# Gateway: mediaLocalRoots allowlist — /tmp 404 and macOS symlink gap

**Status:** Upstream server bug — tracked in openclaw/openclaw  
**Client workaround:** Improved `MediaFallbackCard` copy (`isAgentGeneratedAllowlistMiss`)  
**Related:** [fix-video-gateway-media-and-cache.md](./fix-video-gateway-media-and-cache.md)

---

## Symptom

When an agent uses a TTS or image-generation tool and emits `MEDIA: /tmp/...` paths, the
gateway's `/__openclaw__/assistant-media` endpoint returns `HTTP 404 Not Found` (9-byte body)
instead of serving the file. The client correctly builds the URL and sends a Bearer token;
the request reaches the handler but is rejected by the path allowlist.

Example URLs seen in the wild:

```
https://midgar-1b4eaa3.turkey-rockhopper.ts.net/__openclaw__/assistant-media?source=%2Ftmp%2Fguma-test.mp3
https://midgar-1b4eaa3.turkey-rockhopper.ts.net/__openclaw__/assistant-media?source=%2Ftmp%2Fguma-wave.jpg
```

---

## Root cause

The `assistant-media` handler maintains a hardcoded list of allowed local root directories
(`mediaLocalRoots`). It only serves files whose paths start with an allowed root. The check
uses string prefix matching against `os.tmpdir()` and a few other well-known directories.

### macOS `/tmp` symlink problem

On macOS, `/tmp` is a symlink to `/private/tmp`. Node's `os.tmpdir()` returns `/var/folders/.../T/`
on newer macOS and `/private/tmp` on others — but **never `/tmp`** as a string. So:

- Agent tool writes to `/tmp/guma-test.mp3` ✓ (file exists)
- `assistant-media` checks `'/tmp/guma-test.mp3'.startsWith(os.tmpdir())` → **false**
- Handler returns `404 Not Found` even though the file is physically there

The fix is to `fs.realpathSync()` (or the async equivalent) the `source` path before running
the allowlist check, and/or to explicitly include both `/tmp` and `/private/tmp` in the roots
on macOS.

---

## Upstream issues to track

| Issue | Title |
|-------|-------|
| openclaw/openclaw#21180 | Media local roots: /tmp not accessible on macOS (`os.tmpdir()` ≠ `/private/tmp`) |
| openclaw/openclaw#47856 | Feature: configurable `mediaLocalRoots` for image tool |
| openclaw/openclaw#50312 | Allow configurable `mediaLocalRoots` for outbound media sends |
| openclaw/openclaw#19325 | feat: support `messages.mediaLocalRoots` for custom media directories (stale/closed) |
| openclaw/openclaw#17136 | fix: allow agent workspace directories in media local roots (merged) |

---

## Required server changes

### 1. Resolve symlinks before allowlist check

```typescript
import { realpathSync } from 'fs';

function resolveAndValidatePath(rawSource: string): string {
  // ... existing sanitization ...
  const resolved = realpathSync(absolutePath); // <-- add this
  if (!ALLOWED_ROOTS.some(root => resolved.startsWith(root))) {
    throw new NotFoundError();
  }
  return resolved;
}
```

### 2. Always include /tmp-equivalent roots

```typescript
import os from 'os';
import { realpathSync } from 'fs';

function buildAllowedRoots(): string[] {
  const roots = [
    path.join(os.homedir(), '.openclaw'),
    // ... other default roots ...
  ];
  // Add both /tmp and its realpath to cover macOS symlink
  try { roots.push(realpathSync('/tmp')); } catch {}
  try { roots.push('/tmp'); } catch {}
  try { roots.push(os.tmpdir()); } catch {}
  return [...new Set(roots)];
}
```

### 3. Expose configurable `messages.mediaLocalRoots`

Allow users to add directories in `openclaw.config.json`:

```json
{
  "messages": {
    "mediaLocalRoots": [
      "/custom/media/dir",
      "~/Library/Messages/Attachments"
    ]
  }
}
```

---

## Client-side workaround (already shipped)

`MediaFallbackCard` now detects this specific failure shape via `isAgentGeneratedAllowlistMiss()`:

- `httpStatus === 404`
- URL path contains `/__openclaw__/assistant-media`
- `?source=` decodes to an absolute path (`/…`, `~/…`, or `file://`)

When all three are true, the card shows:

- Subtitle: "Path not allowed by gateway" (instead of "File isn't on the server")
- Info alert body: "Your agent saved this file to a path the gateway won't serve. Ask your agent
  to save generated media under `~/.openclaw/workspace/`, or add the path to `mediaLocalRoots`
  in your gateway config."

This is a UX improvement only — the 404 still happens. The server fix above is required to
make these files actually load.

---

## Workaround for users (until server fix ships)

Tell the agent: "Save any generated media files to `~/.openclaw/workspace/` instead of `/tmp/`."

If using a custom config, add `/tmp` to `mediaLocalRoots` (if your gateway version supports it).
