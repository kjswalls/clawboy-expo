import ExpoModulesCore
import CryptoKit

// ── ASN.1 DER helpers ────────────────────────────────────────────────────────
//
// Minimal parser used only to locate SubjectPublicKeyInfo inside a certificate
// DER blob. We avoid a full ASN.1 library to keep the module self-contained.

/// Decodes one DER element starting at `offset` in `der`.
/// Returns (elementStart, contentStart, end) or nil if the encoding is invalid.
private func derElement(_ der: Data, at offset: Int) -> (elementStart: Int, contentStart: Int, end: Int)? {
  guard offset < der.count else { return nil }
  var i = offset + 1 // skip tag byte
  guard i < der.count else { return nil }
  let firstLen = Int(der[i])
  i += 1
  let length: Int
  if firstLen & 0x80 == 0 {
    length = firstLen
  } else {
    let n = firstLen & 0x7f
    guard n > 0, i + n <= der.count else { return nil }
    var len = 0
    for _ in 0..<n { len = (len << 8) | Int(der[i]); i += 1 }
    length = len
  }
  let end = i + length
  guard end <= der.count else { return nil }
  return (offset, i, end)
}

/// Walks the RFC 5280 ASN.1 certificate DER and returns the raw bytes of the
/// SubjectPublicKeyInfo SEQUENCE, or nil if the structure cannot be parsed.
///
/// TBSCertificate field order (RFC 5280 §4.1):
///   [0] version (optional), serialNumber, signature, issuer,
///   validity, subject, subjectPublicKeyInfo, ...
private func extractSpkiDer(from certDer: Data) -> Data? {
  // Outer Certificate SEQUENCE
  guard let cert = derElement(certDer, at: 0), certDer[cert.elementStart] == 0x30 else { return nil }
  // TBSCertificate SEQUENCE
  guard let tbs = derElement(certDer, at: cert.contentStart), certDer[tbs.elementStart] == 0x30 else { return nil }

  var pos = tbs.contentStart

  // Skip optional version [0] EXPLICIT (context-constructed tag 0xa0)
  if pos < certDer.count && certDer[pos] == 0xa0 {
    guard let e = derElement(certDer, at: pos) else { return nil }
    pos = e.end
  }
  // serialNumber INTEGER (0x02)
  guard pos < certDer.count, certDer[pos] == 0x02,
        let sn = derElement(certDer, at: pos) else { return nil }
  pos = sn.end
  // signature AlgorithmIdentifier SEQUENCE (0x30)
  guard pos < certDer.count, certDer[pos] == 0x30,
        let sig = derElement(certDer, at: pos) else { return nil }
  pos = sig.end
  // issuer Name SEQUENCE (0x30)
  guard pos < certDer.count, certDer[pos] == 0x30,
        let issuer = derElement(certDer, at: pos) else { return nil }
  pos = issuer.end
  // validity SEQUENCE (0x30)
  guard pos < certDer.count, certDer[pos] == 0x30,
        let validity = derElement(certDer, at: pos) else { return nil }
  pos = validity.end
  // subject Name SEQUENCE (0x30)
  guard pos < certDer.count, certDer[pos] == 0x30,
        let subject = derElement(certDer, at: pos) else { return nil }
  pos = subject.end
  // subjectPublicKeyInfo SEQUENCE — this is what we want
  guard pos < certDer.count, certDer[pos] == 0x30,
        let spki = derElement(certDer, at: pos) else { return nil }

  return certDer[spki.elementStart..<spki.end]
}

/// Returns the lowercase hex SHA-256 of the SubjectPublicKeyInfo DER of the
/// leaf certificate in `serverTrust`, or nil if extraction fails.
///
/// Parses the SPKI directly from the certificate DER (via SecCertificateCopyData)
/// rather than reconstructing it from a key-type header table. This is
/// key-type-agnostic and produces the same hash as Chrome, Firefox, and Android
/// for all key types: RSA (any size), EC (any curve), Ed25519, etc.
private func spkiSha256Hex(from serverTrust: SecTrust) -> String? {
  guard let chain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate],
        let cert = chain.first else { return nil }
  let certDer = SecCertificateCopyData(cert) as Data
  guard let spkiDer = extractSpkiDer(from: certDer) else { return nil }
  let digest = SHA256.hash(data: spkiDer)
  return digest.map { String(format: "%02x", $0) }.joined()
}

// ── Origin helper ───────────────────────────────────────────────────────────

/// Returns an HTTP(S) origin string for a `ws://`/`wss://` URL: scheme-mapped
/// to `http`/`https`, host preserved, and port included only when it differs
/// from the scheme's default (443 for https, 80 for http).
///
/// This matches SocketRocket's `RCTSR_origin` implementation so that standard
/// gateway origin-allow-list entries (`https://example.com`) work for both the
/// built-in RN WebSocket and this module regardless of whether the user omits
/// the port in the URL.
private func httpOrigin(for url: URL) -> String? {
  guard let scheme = url.scheme?.lowercased(), let host = url.host else { return nil }
  let httpScheme: String
  let defaultPort: Int
  switch scheme {
  case "wss", "https": httpScheme = "https"; defaultPort = 443
  case "ws",  "http":  httpScheme = "http";  defaultPort = 80
  default:             return nil
  }
  if let port = url.port, port != defaultPort {
    return "\(httpScheme)://\(host):\(port)"
  }
  return "\(httpScheme)://\(host)"
}

// ── Constant-time comparison ─────────────────────────────────────────────────

/// Compares two strings in constant time (XOR all byte pairs regardless of
/// early mismatch) to prevent timing side-channels during SPKI pin verification.
/// Network jitter makes this practically unexploitable for SPKI pins, but the
/// audit checklist explicitly requires constant-time comparison.
private func secureEquals(_ a: String, _ b: String) -> Bool {
  let aBytes = Array(a.utf8)
  let bBytes = Array(b.utf8)
  guard aBytes.count == bBytes.count else { return false }
  return zip(aBytes, bBytes).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
}

// ── PinnedSocketDelegate ────────────────────────────────────────────────────

/// Manages one `URLSessionWebSocketTask` and bridges its lifecycle events back
/// to the Expo module for forwarding to JS.
class PinnedSocketDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate, URLSessionTaskDelegate {

  private let socketId: Int
  private let allowedSpkiHashes: [String]
  private let onEvent: (String, [String: Any]) -> Void

  private var task: URLSessionWebSocketTask?
  private var session: URLSession?
  private let _closedLock = NSLock()
  private var _closed = false
  /// NSLock-guarded accessor — `closed` is written from three concurrent contexts:
  /// the URLSession delegate queue, the main thread (ping timer), and the Expo
  /// module function queue. All read/write access goes through this computed property.
  private var closed: Bool {
    get { _closedLock.withLock { _closed } }
    set { _closedLock.withLock { _closed = newValue } }
  }
  private var pingTimer: Timer?
  /// Transport-level ping interval, matching OkHttp's default on Android.
  private static let pingIntervalSeconds: TimeInterval = 30

  init(
    socketId: Int,
    url: URL,
    allowedSpkiHashes: [String],
    onEvent: @escaping (String, [String: Any]) -> Void
  ) {
    self.socketId = socketId
    self.allowedSpkiHashes = allowedSpkiHashes
    self.onEvent = onEvent
    super.init()

    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30
    // Use a private serial queue instead of .main so that TLS challenges,
    // message receives, and close events don't block the UI thread.
    // This mirrors SocketRocket's design (private queue + main-thread callbacks).
    let delegateQueue = OperationQueue()
    delegateQueue.qualityOfService = .userInitiated
    delegateQueue.maxConcurrentOperationCount = 1
    let session = URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
    self.session = session

    // OpenClaw gateway enforces controlUi.allowedOrigins. URLSessionWebSocketTask
    // doesn't auto-populate Origin (unlike browsers / SocketRocket), so we mirror
    // the behavior browsers use for same-origin connections by sending the HTTP(S)
    // form of the WebSocket URL's host[:port].
    var request = URLRequest(url: url)
    if let origin = httpOrigin(for: url) {
      request.setValue(origin, forHTTPHeaderField: "Origin")
    }

    let task = session.webSocketTask(with: request)
    self.task = task
    task.resume()
  }

  // URLSessionDelegate — TLS challenge
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let serverTrust = challenge.protectionSpace.serverTrust
    else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    // Standard OS validation first.
    var error: CFError?
    let trusted = SecTrustEvaluateWithError(serverTrust, &error)
    guard trusted else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    guard let observedHash = spkiSha256Hex(from: serverTrust) else {
      if allowedSpkiHashes.isEmpty {
        // TOFU mode: cannot compute SPKI hash, allow but skip recording the observation.
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
      } else {
        // Pinning active: cannot verify — fail closed.
        completionHandler(.cancelAuthenticationChallenge, nil)
      }
      return
    }

    onEvent("onPeerSpki", ["socketId": socketId, "sha256Hex": observedHash])

    if allowedSpkiHashes.isEmpty {
      // TOFU mode: no enforcement, just observe.
      completionHandler(.useCredential, URLCredential(trust: serverTrust))
      return
    }

    if allowedSpkiHashes.contains(where: { secureEquals($0, observedHash) }) {
      completionHandler(.useCredential, URLCredential(trust: serverTrust))
    } else {
      onEvent("onPinError", [
        "socketId": socketId,
        "observed": observedHash,
        "allowed": allowedSpkiHashes
      ])
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }

  // URLSessionWebSocketDelegate — open
  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    guard !closed else { return }
    onEvent("onOpen", ["socketId": socketId])
    startPingTimer()
    listen()
  }

  // URLSessionWebSocketDelegate — close
  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    guard !closed else { return }
    closed = true
    stopPingTimer()
    let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    onEvent("onClose", [
      "socketId": socketId,
      "code": closeCode.rawValue,
      "reason": reasonStr,
      "wasClean": closeCode == .normalClosure || closeCode == .goingAway
    ])
    self.session?.invalidateAndCancel()
  }

  // URLSessionTaskDelegate — completion (connection error path)
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard !closed else { return }
    closed = true
    stopPingTimer()
    if let error = error {
      // When the server rejects the WebSocket upgrade with an HTTP error (e.g. 403
      // "origin not allowed", 401 "unauthorized"), the task's response holds the
      // real status code. Surface it so the JS error handler can distinguish a
      // transport failure (1006) from an explicit server rejection (4000+status).
      let httpStatus = (task.response as? HTTPURLResponse).map { $0.statusCode }
      let closeCode: Int
      let reason: String
      if let status = httpStatus, status >= 400 {
        // Use the private close-code range 4000–4999 to encode HTTP status codes
        // from failed handshakes. The JS layer (OpenClawClient) treats any non-1000/1001
        // close as an error and will build a meaningful message from the reason string.
        closeCode = 4000 + status
        reason = "HTTP \(status): \(error.localizedDescription)"
      } else {
        closeCode = 1006
        reason = error.localizedDescription
      }
      onEvent("onError", ["socketId": socketId, "message": reason])
      onEvent("onClose", ["socketId": socketId, "code": closeCode, "reason": reason, "wasClean": false])
    }
    self.session?.invalidateAndCancel()
  }

  func send(_ data: String) {
    guard !closed else { return }
    task?.send(.string(data)) { [weak self] error in
      if let error, let self, !self.closed {
        self.onEvent("onError", ["socketId": self.socketId, "message": error.localizedDescription])
      }
    }
  }

  func close() {
    guard !closed else { return }
    closed = true
    stopPingTimer()
    task?.cancel(with: .normalClosure, reason: nil)
    session?.invalidateAndCancel()
  }

  // ── Transport-level ping ────────────────────────────────────────────────────

  private func startPingTimer() {
    stopPingTimer()
    // Timer must be scheduled on the main run loop regardless of the delegate
    // queue so it fires reliably even when there is no active network activity.
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.closed else { return }
      let timer = Timer.scheduledTimer(
        withTimeInterval: PinnedSocketDelegate.pingIntervalSeconds,
        repeats: true
      ) { [weak self] _ in
        self?.sendPing()
      }
      self.pingTimer = timer
    }
  }

  private func stopPingTimer() {
    // Timer was scheduled on the main run loop; it must be invalidated there.
    let timer = pingTimer
    pingTimer = nil
    DispatchQueue.main.async { timer?.invalidate() }
  }

  private func sendPing() {
    guard !closed else { stopPingTimer(); return }
    task?.sendPing { [weak self] error in
      guard let self else { return }
      if let error, !self.closed {
        self.closed = true
        self.stopPingTimer()
        self.onEvent("onError", ["socketId": self.socketId, "message": "Ping failed: \(error.localizedDescription)"])
        self.onEvent("onClose", [
          "socketId": self.socketId,
          "code": 1006,
          "reason": "Ping failed: \(error.localizedDescription)",
          "wasClean": false
        ])
        self.session?.invalidateAndCancel()
      }
    }
  }

  // Read messages in a loop using the completion-handler API.
  private func listen() {
    guard !closed else { return }
    task?.receive { [weak self] result in
      guard let self, !self.closed else { return }
      switch result {
      case .success(let message):
        switch message {
        case .string(let text):
          self.onEvent("onMessage", ["socketId": self.socketId, "data": text])
        case .data(let data):
          if let text = String(data: data, encoding: .utf8) {
            self.onEvent("onMessage", ["socketId": self.socketId, "data": text])
          } else {
            #if DEBUG
            print("[PinnedWebSocket] Binary frame on socketId=\(self.socketId) could not be decoded as UTF-8 — dropped")
            #endif
          }
        @unknown default:
          break
        }
        self.listen()
      case .failure(let error):
        if !self.closed {
          self.closed = true
          self.stopPingTimer()
          self.onEvent("onError", ["socketId": self.socketId, "message": error.localizedDescription])
          self.onEvent("onClose", [
            "socketId": self.socketId,
            "code": 1006,
            "reason": error.localizedDescription,
            "wasClean": false
          ])
          self.session?.invalidateAndCancel()
        }
      }
    }
  }
}

// ── Expo Module ────────────────────────────────────────────────────────────

public class ExpoPinnedWebsocketModule: Module {
  private var sockets: [Int: PinnedSocketDelegate] = [:]

  public func definition() -> ModuleDefinition {
    Name("ExpoPinnedWebsocket")

    Events("onOpen", "onMessage", "onClose", "onError", "onPeerSpki", "onPinError")

    Function("createSocket") { [weak self] (socketId: Int, urlString: String, allowedSpkiHashes: [String]) in
      guard let self else { return }
      guard let url = URL(string: urlString) else {
        self.sendEvent("onError", [
          "socketId": socketId,
          "message": "Invalid URL: \(urlString)"
        ])
        return
      }
      guard let scheme = url.scheme?.lowercased(), scheme == "ws" || scheme == "wss" else {
        self.sendEvent("onError", [
          "socketId": socketId,
          "message": "expo-pinned-websocket: URL scheme must be ws:// or wss://"
        ])
        return
      }

      let delegate = PinnedSocketDelegate(
        socketId: socketId,
        url: url,
        allowedSpkiHashes: allowedSpkiHashes
      ) { [weak self] eventName, payload in
        self?.sendEvent(eventName, payload)
      }
      self.sockets[socketId] = delegate
    }

    Function("sendMessage") { [weak self] (socketId: Int, data: String) in
      self?.sockets[socketId]?.send(data)
    }

    Function("closeSocket") { [weak self] (socketId: Int) in
      self?.sockets[socketId]?.close()
      self?.sockets.removeValue(forKey: socketId)
    }
  }
}
