/**
 * One-shot diagnostic for media load failures.
 *
 * When expo-image / expo-video fails to render a gateway media URL, iOS
 * reports the raw bytes it received (e.g. "3C 21 64 6F 63 74 79 70… '<!doctyp'")
 * but gives no HTTP status or headers. This helper fires a single authenticated
 * GET for the same URL, classifies the response, and returns a MediaDiagnosis
 * so the UI can show a more specific subtitle in MediaFallbackCard.
 *
 * Deduped per URL — re-calls return the cached verdict immediately with no
 * additional network request.
 */

import { sanitizeUrlForDisplay } from './gatewayMedia';

export type MediaFailureReason =
  | 'html'          // server returned an HTML page instead of media (SPA fallthrough, etc.)
  | 'auth-failed'   // 401 / 403
  | 'not-found'     // 404
  | 'network-error' // fetch threw (no network, TLS error, etc.)
  | 'other';        // any other unclassifiable response

/** Full diagnosis result returned by `diagnoseMediaFailureDetailed`. */
export interface MediaDiagnosis {
  reason: MediaFailureReason;
  /** HTTP status code (absent if a network error prevented any response). */
  httpStatus?: number;
  /** HTTP status text, e.g. "Not Found". */
  httpStatusText?: string;
  /** Content-Type header value from the response. */
  contentType?: string;
  /** Content-Length header value from the response. */
  contentLength?: string;
  /** First ~200 chars of the response body. */
  snippet?: string;
  /** The URL after stripping any `?token=` query parameter — safe to display. */
  sanitizedUrl: string;
}

// Cache completed diagnoses so we never re-fetch the same URL.
const cache = new Map<string, MediaDiagnosis>();
// In-flight promises keyed by URL so concurrent callers await the same request.
const inflight = new Map<string, Promise<MediaDiagnosis>>();

/**
 * Full diagnostic: fetches the URL, classifies the response, and returns a
 * `MediaDiagnosis` with HTTP status, content-type, and a body snippet.
 * Results are cached per URL so repeated calls have zero network cost.
 */
export async function diagnoseMediaFailureDetailed(
  url: string,
  token: string | null,
): Promise<MediaDiagnosis> {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async (): Promise<MediaDiagnosis> => {
    const sanitizedUrl = sanitizeUrlForDisplay(url);
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let diagnosis: MediaDiagnosis;
    try {
      const res = await fetch(url, { method: 'GET', headers });
      const contentType = res.headers.get('content-type') ?? undefined;
      const contentLength = res.headers.get('content-length') ?? undefined;

      let snippet: string | undefined;
      try {
        const text = await res.text();
        snippet = text.slice(0, 200) || undefined;
      } catch {
        snippet = undefined;
      }

      let reason: MediaFailureReason;
      if (res.status === 401 || res.status === 403) {
        reason = 'auth-failed';
      } else if (res.status === 404) {
        reason = 'not-found';
      } else if (contentType?.includes('text/html')) {
        reason = 'html';
      } else {
        reason = 'other';
      }

      diagnosis = {
        reason,
        httpStatus: res.status,
        httpStatusText: res.statusText || undefined,
        contentType,
        contentLength,
        snippet,
        sanitizedUrl,
      };

      if (__DEV__) {
        console.warn(
          '[diagnoseMediaFailure] Media URL returned unexpected response.\n' +
          `  URL: ${sanitizedUrl}\n` +
          `  Status: ${res.status} ${res.statusText}\n` +
          `  Content-Type: ${contentType ?? '(none)'}\n` +
          `  Content-Length: ${contentLength ?? '(unknown)'}\n` +
          `  Reason: ${reason}\n` +
          `  First 200 chars: ${JSON.stringify(snippet ?? '')}`,
        );
      }
    } catch (err) {
      diagnosis = {
        reason: 'network-error',
        sanitizedUrl,
      };
      if (__DEV__) {
        console.warn('[diagnoseMediaFailure] Could not reach URL:', sanitizedUrl, err);
      }
    }

    cache.set(url, diagnosis);
    inflight.delete(url);
    return diagnosis;
  })();

  inflight.set(url, promise);
  return promise;
}

/**
 * Thin wrapper around `diagnoseMediaFailureDetailed` that returns only the
 * `MediaFailureReason` for callers that don't need the full diagnosis.
 */
export async function diagnoseMediaFailure(
  url: string,
  token: string | null,
): Promise<MediaFailureReason> {
  const d = await diagnoseMediaFailureDetailed(url, token);
  return d.reason;
}
