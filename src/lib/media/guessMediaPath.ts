/**
 * Best-effort media path guesser for cross-channel sessions.
 *
 * When the OpenClaw gateway sends media to another transport (e.g. Discord)
 * and the message history only retains the bare filename, we can guess the
 * likely server-side path under ~/.openclaw/media/tool-{kind}-generation/.
 *
 * Rules:
 * - Use `~` so the gateway expands per its own $HOME — never hard-code /home/ubuntu.
 * - Normalize em-dash / en-dash → triple ASCII hyphen (channel typography differs
 *   from the on-disk naming convention that joins slug and UUID with ---).
 * - One candidate per filename; no HEAD probe loop.
 */

const MEDIA_KIND_BY_EXT: Record<string, 'image' | 'video' | 'audio'> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  opus: 'audio',
  ogg: 'audio',
}

const TOOL_DIR_BY_KIND: Record<'image' | 'video' | 'audio', string> = {
  image: 'tool-image-generation',
  video: 'tool-video-generation',
  audio: 'tool-audio-generation',
}

/**
 * Map em-dash / en-dash back to triple ASCII hyphen used on disk.
 * Channels like Discord substitute smartypants dashes that differ from
 * the `---` separator in gateway-generated filenames.
 */
export function normalizeFilenameForGatewayGuess(name: string): string {
  return name.replace(/[\u2014\u2013]/g, '---')
}

export interface GuessedMediaPath {
  kind: 'image' | 'video' | 'audio'
  /** Single best-guess POSIX path; gateway expands `~` server-side. */
  sourcePath: string
}

/**
 * Given a bare filename (no directory) with a known media extension, return
 * the best-guess gateway path. Returns null for unknown extensions.
 */
export function guessMediaPath(filename: string): GuessedMediaPath | null {
  const trimmed = filename.trim()
  const ext = trimmed.split('.').pop()?.toLowerCase() ?? ''
  const kind = MEDIA_KIND_BY_EXT[ext]
  if (!kind) return null
  const dir = TOOL_DIR_BY_KIND[kind]
  const normalized = normalizeFilenameForGatewayGuess(trimmed)
  return { kind, sourcePath: `~/.openclaw/media/${dir}/${normalized}` }
}

/**
 * Returns true when the entire trimmed content looks like a single bare media
 * filename (no spaces, no newlines, known media extension, ≤200 chars).
 * Conservative on purpose — must not match normal prose that mentions a .jpg.
 */
export function isBareMediaFilename(content: string): boolean {
  const t = content.trim()
  if (!t) return false
  if (/\s/.test(t)) return false
  if (t.includes('\n')) return false
  if (t.length > 200) return false
  return guessMediaPath(t) !== null
}
