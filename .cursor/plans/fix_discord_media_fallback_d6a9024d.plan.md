---
name: Fix Discord media fallback
overview: Wire `guessedMedia` from `MessageBubble` to `MediaEmbed` so the cross-channel fallback card actually renders, and derive a readable filename from the `?source=` query param.
todos:
  - id: forward-guessed-media-bubble
    content: Pass message.guessedMedia to MediaEmbed and FileAttachmentCard inside MessageBubble
    status: pending
  - id: derive-fallback-filename
    content: Add deriveFallbackName helper in MediaEmbed (decodes ?source=) and reuse in VideoEmbed
    status: pending
  - id: qa-and-test
    content: Add MessageBubble smoke test asserting guessedMedia forwarding; optional unit test for deriveFallbackName
    status: pending
isProject: false
---

# Fix Discord media fallback (minimal scope)

## Why "just a timestamp, nothing above"

`chat.ts` correctly clears the bare filename and pushes a guessed-image entry with `guessedMedia: true`. The data survives all the way to `ChatUiMessage`. But [src/components/chat/MessageBubble.tsx](src/components/chat/MessageBubble.tsx) does not forward `guessedMedia` to `MediaEmbed`:

```398:403:src/components/chat/MessageBubble.tsx
<MediaEmbed
  images={message.images}
  audioUrl={message.audioUrl}
  videoUrl={message.videoUrl}
  align={isUser ? 'right' : 'left'}
/>
```

In [src/components/chat/MediaEmbed.tsx](src/components/chat/MediaEmbed.tsx) the failed-source set is gated behind `if (guessedMedia)`, so without the prop the fallback path never runs:

```162:166:src/components/chat/MediaEmbed.tsx
const handleImageError = (src: string): void => {
  if (guessedMedia) {
    setFailedSrcs((prev) => new Set([...prev, src]));
  }
};
```

The `Image` keeps trying to decode HTML, the slot stays visually empty, the `MessageBody` returns null because `content` was cleared in `chat.ts`, and the user sees just the timestamp. The iOS `ImageIO` logs are the OS complaining about the HTML body — they will continue (per your "minimal" scope choice).

The internal-event branch in [src/components/chat/MessageList.tsx](src/components/chat/MessageList.tsx) already passes `guessedMedia`, so same-session task events render correctly. The bug only affects regular assistant bubbles routed through `MessageBubble`.

## Changes

### 1. Forward `guessedMedia` in `MessageBubble`

[src/components/chat/MessageBubble.tsx](src/components/chat/MessageBubble.tsx)

- Pass `guessedMedia={message.guessedMedia}` to `<MediaEmbed>` at line 398.
- Pass `guessedMedia={message.guessedMedia}` to each `<FileAttachmentCard>` rendered around line 408 (so the `(i)` info button appears for guessed file attachments too — keeps behaviour consistent with the internal-event branch).

### 2. Recover the original filename in the fallback card

[src/components/chat/MediaEmbed.tsx](src/components/chat/MediaEmbed.tsx)

Replace the basename derivation at line 179 with a helper that prefers the `?source=` query param decoded back to a filesystem basename, then falls back to the URL basename.

```ts
function deriveFallbackName(src: string): string {
  try {
    const u = new URL(src);
    const source = u.searchParams.get('source');
    if (source) {
      const decoded = decodeURIComponent(source);
      const last = decoded.split('/').pop();
      if (last) return last;
    }
  } catch {
    // not a parseable URL — fall through
  }
  return src.split('/').pop() ?? src;
}
```

Use it at the existing fallback render site:

```tsx
if (guessedMedia && failedSrcs.has(src)) {
  return <MediaFallbackCard key={`${src}-${i}`} kind="image" name={deriveFallbackName(src)} />;
}
```

The same helper is reused inside `VideoEmbed` for consistency — [src/components/chat/VideoEmbed.tsx](src/components/chat/VideoEmbed.tsx) already does `url.split('/').pop()?.split('?')[0]` which has the same problem when the URL is the gateway-proxied form. Either inline the same logic there or export `deriveFallbackName` from `MediaEmbed` (small, no need for a new file).

## Out of scope (per your "minimal" choice)

- No HEAD pre-flight to silence the `[ImageIO]` iOS logs.
- No probe-result cache.
- Gateway-side fix (have the server attach `details.media` to cross-channel history) is the real long-term solution; this PR keeps the client-side best-effort guess.

## Manual QA

1. Open the Discord session with the bare-filename assistant message — the bubble should now render a `MediaFallbackCard` row showing the original `something---uuid.jpg` filename plus the `(i)` info button. Tapping it shows the existing alert copy.
2. Open a same-session image-generation turn — `MediaEmbed` thumbnail still renders normally (no regression: `guessedMedia` is undefined for non-guess paths).
3. Open a same-session generation turn that succeeds in production but a `chat.history` replay where the file has since been deleted — fallback now appears with the recovered filename.

## Tests

- [src/components/chat/__tests__/MessageBubble.test.tsx](src/components/chat/__tests__/MessageBubble.test.tsx) — add a smoke test: render with `guessedMedia: true` and `images: [gateway-url]`, assert `MediaEmbed` receives `guessedMedia` (or snapshot includes the prop on the rendered tree).
- Optional unit test for `deriveFallbackName` covering: URL with `?source=` (returns basename of decoded path), plain URL (returns URL basename), invalid URL (returns input basename).