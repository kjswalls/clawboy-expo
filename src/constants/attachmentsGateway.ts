/**
 * Client-side limits for `chat.send` attachments (OpenClaw gateway).
 *
 * Upstream (openclaw/openclaw) parses `attachments[].content` as base64 and
 * routes payloads through `parseMessageWithAttachments` / media staging.
 * Non-image payloads over ~2 MB are offloaded to the gateway media store
 * (see gateway PRs around chat attachments). Keeping each inline attachment
 * under this cap avoids oversized JSON frames and reduces RangeError risk on
 * some gateway builds when validation clones huge strings.
 *
 * Encoding: each attachment uses `{ mimeType?, fileName?, type?, content }`
 * where `content` is **raw base64** (no `data:` prefix), matching common
 * gateway + Control UI expectations.
 */
export const GATEWAY_ATTACHMENT_MAX_BYTES = 1_750_000;

/** Sum of decoded attachment sizes per send — stay under typical WS / JSON limits. */
export const GATEWAY_ATTACHMENTS_TOTAL_MAX_BYTES = 4_000_000;

/** Max duration for a picked video before we reject (still may fail if file is huge). */
export const VIDEO_PICK_MAX_DURATION_SECONDS = 180;

/** Max length for a single press-and-hold voice note. */
export const VOICE_RECORDING_MAX_SECONDS = 120;
