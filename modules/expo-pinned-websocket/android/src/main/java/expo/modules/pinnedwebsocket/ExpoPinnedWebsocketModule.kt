package expo.modules.pinnedwebsocket

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.*
import okio.ByteString
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.*

class ExpoPinnedWebsocketModule : Module() {

    private val activeSockets = ConcurrentHashMap<Int, PinnedWebSocketImpl>()

    override fun definition(): ModuleDefinition = ModuleDefinition {
        Name("ExpoPinnedWebsocket")

        Events("onOpen", "onMessage", "onClose", "onError", "onPeerSpki", "onPinError")

        Function("createSocket") { socketId: Int, urlString: String, allowedSpkiHashes: List<String> ->
            val impl = PinnedWebSocketImpl(
                socketId = socketId,
                url = urlString,
                allowedSpkiHashes = allowedSpkiHashes,
                onEvent = { name, payload -> sendEvent(name, payload) }
            )
            activeSockets[socketId] = impl
            impl.connect()
        }

        Function("sendMessage") { socketId: Int, data: String ->
            activeSockets[socketId]?.send(data)
        }

        Function("closeSocket") { socketId: Int ->
            activeSockets.remove(socketId)?.close()
        }
    }
}

// ── PinnedWebSocketImpl ──────────────────────────────────────────────────────

internal class PinnedWebSocketImpl(
    private val socketId: Int,
    private val url: String,
    private val allowedSpkiHashes: List<String>,
    private val onEvent: (String, Map<String, Any?>) -> Unit
) {
    private var webSocket: WebSocket? = null
    // AtomicBoolean ensures JMM visibility and provides compareAndSet for exactly-once
    // semantics — onClosed / onFailure / close() may fire concurrently from OkHttp's
    // thread pool and the Expo module function queue.
    private val closed = java.util.concurrent.atomic.AtomicBoolean(false)

    fun connect() {
        val scheme = try { java.net.URI(url).scheme?.lowercase() } catch (_: Exception) { null }
        require(scheme == "ws" || scheme == "wss") {
            "expo-pinned-websocket: URL scheme must be ws:// or wss://"
        }

        val (trustManager, sslSocketFactory) = buildTlsComponents()

        val client = OkHttpClient.Builder()
            .sslSocketFactory(sslSocketFactory, trustManager)
            // Hostname verification uses OkHttp's default — no override needed.
            // OkHostnameVerifier (internal API) is intentionally omitted; OkHttp
            // applies its default hostname verifier when sslSocketFactory is set.
            // Transport-level keepalive: OkHttp sends a WebSocket ping every 30s and
            // fails the socket if a pong isn't received within the same interval.
            // This detects half-open sockets (Wi-Fi hand-off, NAT timeout) faster than
            // the 30s app-level tick watchdog alone.
            .pingInterval(30, TimeUnit.SECONDS)
            .build()

        // OkHttp does not send an Origin header by default. The OpenClaw gateway
        // enforces controlUi.allowedOrigins, so we mirror what browsers send:
        // the HTTP(S) form of the WebSocket URL's host[:port] (RFC 6454).
        val request = Request.Builder()
            .url(url)
            .header("Origin", httpOrigin(url))
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onEvent("onOpen", mapOf("socketId" to socketId))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                onEvent("onMessage", mapOf("socketId" to socketId, "data" to text))
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val text = bytes.utf8()
                if (BuildConfig.DEBUG && text.toByteArray(Charsets.UTF_8).size != bytes.size()) {
                    android.util.Log.w(
                        "PinnedWebSocket",
                        "Binary frame (socketId=$socketId) contained non-UTF-8 bytes — " +
                            "invalid sequences were replaced with \uFFFD"
                    )
                }
                onEvent("onMessage", mapOf("socketId" to socketId, "data" to text))
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (closed.compareAndSet(false, true)) {
                    onEvent("onClose", mapOf(
                        "socketId" to socketId,
                        "code" to code,
                        "reason" to reason,
                        "wasClean" to true
                    ))
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (closed.compareAndSet(false, true)) {
                    onEvent("onError", mapOf("socketId" to socketId, "message" to (t.message ?: "Unknown error")))
                    onEvent("onClose", mapOf(
                        "socketId" to socketId,
                        "code" to 1006,
                        "reason" to (t.message ?: ""),
                        "wasClean" to false
                    ))
                }
            }
        })
    }

    fun send(data: String) {
        webSocket?.send(data)
    }

    fun close() {
        if (closed.compareAndSet(false, true)) {
            webSocket?.close(1000, "Normal closure")
        }
    }

    // ── TLS: SPKI extraction + pinning ─────────────────────────────────────

    private fun buildTlsComponents(): Pair<X509TrustManager, SSLSocketFactory> {
        val defaultTrustManager = getDefaultTrustManager()

        val pinnedTrustManager = object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> =
                defaultTrustManager.getAcceptedIssuers()

            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) =
                defaultTrustManager.checkClientTrusted(chain, authType)

            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                // Standard validation first — throws if chain is not trusted by the OS.
                defaultTrustManager.checkServerTrusted(chain, authType)

                // Extract SPKI SHA-256 of the leaf cert.
                val leaf = chain[0]
                val spkiHash = spkiSha256Hex(leaf)

                if (spkiHash == null) {
                    // Cannot extract SPKI — fail closed when pins are configured.
                    if (allowedSpkiHashes.isNotEmpty()) {
                        throw javax.net.ssl.SSLPeerUnverifiedException(
                            "Unable to extract SPKI from leaf cert for pin enforcement"
                        )
                    }
                    // TOFU mode: cannot observe, let through silently.
                    return
                }

                onEvent("onPeerSpki", mapOf("socketId" to socketId, "sha256Hex" to spkiHash))

                if (allowedSpkiHashes.isEmpty()) return // TOFU mode: observe only

                if (!allowedSpkiHashes.any { constantTimeEquals(it, spkiHash) }) {
                    onEvent("onPinError", mapOf(
                        "socketId" to socketId,
                        "observed" to spkiHash,
                        "allowed" to allowedSpkiHashes
                    ))
                    throw javax.net.ssl.SSLPeerUnverifiedException(
                        "Certificate pin mismatch. Observed: $spkiHash"
                    )
                }
            }
        }

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(pinnedTrustManager), null)
        return Pair(pinnedTrustManager, sslContext.socketFactory)
    }

    companion object {
        /**
         * Compares two strings in constant time using [MessageDigest.isEqual] to
         * prevent timing side-channels during SPKI pin verification. Network jitter
         * makes this practically unexploitable for SPKI pins, but the audit checklist
         * explicitly requires constant-time comparison.
         */
        fun constantTimeEquals(a: String, b: String): Boolean {
            val aBytes = a.toByteArray(Charsets.UTF_8)
            val bBytes = b.toByteArray(Charsets.UTF_8)
            return MessageDigest.isEqual(aBytes, bBytes)
        }

        /**
         * Returns the HTTP(S) origin string for a WebSocket URL, matching the
         * behaviour of browsers and SocketRocket (RN's built-in iOS WebSocket):
         * scheme mapped to http/https, host preserved, port included only when
         * it differs from the scheme default (443 for wss, 80 for ws).
         */
        fun httpOrigin(urlString: String): String {
            return try {
                val parsed = java.net.URI(urlString)
                val scheme = when (parsed.scheme?.lowercase()) {
                    "wss", "https" -> "https"
                    else -> "http"
                }
                val defaultPort = if (scheme == "https") 443 else 80
                val port = parsed.port
                if (port > 0 && port != defaultPort) {
                    "$scheme://${parsed.host}:$port"
                } else {
                    "$scheme://${parsed.host}"
                }
            } catch (_: Exception) {
                // Fallback: the URL was already validated in the Expo module Function.
                urlString
            }
        }

        private fun getDefaultTrustManager(): X509TrustManager {
            val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            factory.init(null as java.security.KeyStore?)
            return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
        }

        /**
         * Returns the lowercase hex SHA-256 of the SubjectPublicKeyInfo (SPKI)
         * DER encoding of [cert]'s public key.
         *
         * `cert.publicKey.encoded` on Android returns the full SPKI DER
         * (X.509 SubjectPublicKeyInfo encoding) — this is the correct input for
         * SPKI pin comparison and matches Chrome/Firefox/iOS expectations.
         */
        fun spkiSha256Hex(cert: X509Certificate): String? {
            return try {
                val spkiDer = cert.publicKey.encoded ?: return null
                val hash = MessageDigest.getInstance("SHA-256").digest(spkiDer)
                hash.joinToString("") { "%02x".format(it) }
            } catch (_: java.security.NoSuchAlgorithmException) {
                // SHA-256 is mandatory on Android (java.security spec §1.4.2); should never happen.
                null
            }
        }
    }
}
