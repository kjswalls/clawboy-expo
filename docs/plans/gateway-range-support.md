# Gateway: HTTP Range / 206 support for `assistant-media`

**Status:** Planned — not yet implemented  
**Affects:** `openclaw` server, `handleControlUiAssistantMediaRequest`  
**Related client fix:** `src/components/chat/VideoEmbed.tsx` (download-before-play workaround)

---

## Problem

iOS `AVFoundation` (via `expo-video`) opens video playback by issuing an HTTP `Range: bytes=0-1` probe to get the total file length before it starts buffering. The OpenClaw gateway currently returns `200 OK` with the full file body instead of `206 Partial Content` with the requested byte range, causing AVFoundation to abort with:

```
CoreMediaErrorDomain -12939  (byte range length mismatch)
```

The client-side workaround is to download the entire file locally first and play it from a `file://` URI. This works but wastes bandwidth on slow connections and kills the "instant play" feel for large files.

The proper fix is server-side: teach `handleControlUiAssistantMediaRequest` to speak HTTP Range.

---

## Required server changes

### File: `ui/src/server/assistant-media.ts` (or equivalent)

#### 1. Advertise byte-range support

Add to every response (200 or 206):

```
Accept-Ranges: bytes
```

#### 2. Parse the `Range` header

```
Range: bytes=<start>-<end>
Range: bytes=<start>-        ← end = filesize - 1
Range: bytes=-<suffix>       ← last N bytes
```

Use a strict parser — reject malformed ranges with `416`.

#### 3. Serve `206 Partial Content`

When a valid `Range` header is present and satisfiable:

- Status: `206 Partial Content`
- Headers:
  ```
  Content-Range: bytes <start>-<end>/<total>
  Content-Length: <end - start + 1>
  Accept-Ranges: bytes
  ```
- Body: the requested byte slice of the file (read with `fs.createReadStream(path, { start, end })`)

#### 4. Respond `416 Range Not Satisfiable` for bad ranges

When the range is syntactically invalid or `start > filesize`:

```
HTTP/1.1 416 Range Not Satisfiable
Content-Range: bytes */<total>
```

#### 5. Fall back to `200` for missing `Range` header

Non-range requests (browser image loads, download buttons) continue to receive the full file with `200 OK`.

---

## Pseudocode sketch

```typescript
async function handleAssistantMedia(req: Request, res: Response): Promise<void> {
  const filePath = resolveAndValidatePath(req.query.source as string);
  const stat = await fs.stat(filePath);
  const total = stat.size;

  res.setHeader('Accept-Ranges', 'bytes');

  const rangeHeader = req.headers['range'];
  if (!rangeHeader) {
    res.setHeader('Content-Length', total);
    res.status(200);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const range = parseRange(total, rangeHeader);
  if (range === null || range.start > range.end) {
    res.setHeader('Content-Range', `bytes */${total}`);
    res.status(416).end();
    return;
  }

  const chunkSize = range.end - range.start + 1;
  res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
  res.setHeader('Content-Length', chunkSize);
  res.status(206);
  fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
}

function parseRange(
  total: number,
  header: string,
): { start: number; end: number } | null {
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];

  let start: number;
  let end: number;

  if (startStr === '' && endStr !== '') {
    // Suffix range: bytes=-N  →  last N bytes
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr !== '' ? parseInt(endStr, 10) : total - 1;
  }

  end = Math.min(end, total - 1);
  if (isNaN(start) || isNaN(end) || start > end || start >= total) return null;
  return { start, end };
}
```

---

## Smoke test (after implementation)

```bash
# Replace URL/TOKEN with your gateway details.
GATEWAY="https://your-gateway.example.com"
TOKEN="your-token"
FILE="/__openclaw__/assistant-media?source=%2Ftmp%2Ftest.mp4"

# Should return 206 with Content-Range header:
curl -v -H "Authorization: Bearer $TOKEN" \
     -H "Range: bytes=0-99" \
     "$GATEWAY$FILE" 2>&1 | grep -E "^< (HTTP|Content-Range|Accept-Ranges)"

# Expected output:
# < HTTP/1.1 206 Partial Content
# < Accept-Ranges: bytes
# < Content-Range: bytes 0-99/<total>

# Should return 416 for out-of-range:
curl -v -H "Authorization: Bearer $TOKEN" \
     -H "Range: bytes=999999999-999999999" \
     "$GATEWAY$FILE" 2>&1 | grep "^< HTTP"
# < HTTP/1.1 416 Range Not Satisfiable
```

---

## Client rollback path

Once the gateway ships Range support, the client-side download-before-play workaround in `VideoEmbed.tsx` can be simplified:

1. Remove `downloadToCacheCancellable` call for video URLs that come from the gateway.
2. Pass the authenticated `{ uri, headers }` source directly to `useVideoPlayer` (as it did before the fix).
3. Keep the LRU download cache for explicit "save for offline" or retry scenarios.

The preference key `clawboy-media-cache-replay` and the Settings UI can remain — they're still useful for offline-capable replay when the user is on a slow connection.
