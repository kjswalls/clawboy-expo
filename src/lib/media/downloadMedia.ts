/**
 * Authenticated media download + on-device cache with LRU eviction.
 *
 * Files are cached under `<cacheDirectory>/clawboy-media/<hash>.<ext>` using
 * a profile+URL-hash key so the same remote file is only downloaded once per
 * profile.  The cache dir is excluded from iCloud/Google Drive backups.
 *
 * Tokens are carried only in HTTP headers — never in the cached file path
 * or local logs.
 *
 * LRU budget: persistent files are tracked in a manifest.json next to the
 * cache dir.  After each write the total is checked against TOTAL_CACHE_CAP;
 * oldest entries (by lastAccessMs) are deleted until the total is under cap.
 *
 * Ephemeral files (opt-out-of-replay mode) live under clawboy-media/ephemeral/
 * and are excluded from the LRU manifest — they are deleted by the caller on
 * unmount.
 */

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import i18n from '@/i18n';
import type { MediaFailureReason } from './diagnoseMediaFailure';

/** Thrown when a file exceeds the download size cap. Used in `checkFileSizeCap`
 *  so the rethrow is locale-independent (not string-compared). */
class FileTooLargeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'FileTooLargeError';
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const MEDIA_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}clawboy-media/`;
const EPHEMERAL_SUBDIR = `${MEDIA_CACHE_DIR}ephemeral/`;
const MANIFEST_PATH = `${MEDIA_CACHE_DIR}manifest.json`;

/** Per-file size cap enforced via HEAD pre-flight. */
const FILE_SIZE_CAP = 256 * 1024 * 1024; // 256 MB

/** Total persistent cache budget before LRU eviction kicks in. */
const TOTAL_CACHE_CAP = 1024 * 1024 * 1024; // 1 GB

/** Extension to use when no file extension can be derived from the URL. */
const FALLBACK_EXT = '.bin';

// ── Typed error for saved-file validation failures ────────────────────────────

/**
 * Thrown by `downloadToCacheCancellable` when the downloaded bytes fail
 * content validation (e.g. server returned an HTML error page saved as .mp4).
 * Callers can check `instanceof MediaSavedFileError` to skip the redundant
 * `diagnoseMediaFailure` GET probe and surface the reason directly.
 */
export class MediaSavedFileError extends Error {
  readonly reason: MediaFailureReason;
  constructor(reason: MediaFailureReason, message: string) {
    super(message);
    this.name = 'MediaSavedFileError';
    this.reason = reason;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DownloadResult {
  /** Local file URI usable with expo-video / expo-sharing / MediaLibrary. */
  localUri: string;
  /** Detected or inferred MIME type string. */
  mimeType: string;
}

export interface DownloadHandle {
  promise: Promise<DownloadResult>;
  /** Cancel an in-progress download and clean up any partial file. */
  cancel: () => void;
}

export interface DownloadOpts {
  onProgress?: (fraction: number) => void;
  /** Profile id used to namespace the cache key. Defaults to '_'. */
  profileId?: string;
  /**
   * When true the file is written to the ephemeral subfolder and NOT tracked
   * in the LRU manifest.  The caller is responsible for deleting it on unmount.
   */
  ephemeral?: boolean;
  fileName?: string;
  mimeType?: string;
}

// ── Manifest (LRU tracking) ───────────────────────────────────────────────────

interface ManifestEntry {
  path: string;
  size: number;
  lastAccessMs: number;
}

interface CacheManifest {
  entries: ManifestEntry[];
}

async function readManifest(): Promise<CacheManifest> {
  try {
    const info = await FileSystem.getInfoAsync(MANIFEST_PATH);
    if (!info.exists) return { entries: [] };
    const raw = await FileSystem.readAsStringAsync(MANIFEST_PATH);
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as CacheManifest).entries)
    ) {
      return parsed as CacheManifest;
    }
    return { entries: [] };
  } catch {
    return { entries: [] };
  }
}

async function writeManifest(manifest: CacheManifest): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(MANIFEST_PATH, JSON.stringify(manifest));
  } catch {
    // Non-fatal — worst case LRU tracking is imprecise until next boot.
  }
}

/** Update lastAccessMs for an existing manifest entry (cache hit touch). */
async function touchManifestEntry(path: string): Promise<void> {
  const manifest = await readManifest();
  const idx = manifest.entries.findIndex((e) => e.path === path);
  if (idx !== -1) {
    manifest.entries[idx] = { ...manifest.entries[idx]!, lastAccessMs: Date.now() };
    await writeManifest(manifest);
  }
}

/** Add or update an entry and run LRU eviction if the total exceeds the cap. */
async function addManifestEntry(entry: ManifestEntry): Promise<void> {
  const manifest = await readManifest();

  // Remove any stale entry for this path (re-download case).
  const filtered = manifest.entries.filter((e) => e.path !== entry.path);
  filtered.push(entry);
  manifest.entries = filtered;

  // LRU eviction: remove oldest until total is under cap.
  let total = manifest.entries.reduce((sum, e) => sum + e.size, 0);
  if (total > TOTAL_CACHE_CAP) {
    manifest.entries.sort((a, b) => a.lastAccessMs - b.lastAccessMs);
    while (total > TOTAL_CACHE_CAP && manifest.entries.length > 0) {
      const oldest = manifest.entries.shift()!;
      total -= oldest.size;
      await FileSystem.deleteAsync(oldest.path, { idempotent: true }).catch(() => {});
    }
  }

  await writeManifest(manifest);
}

// ── Inflight dedup registry ───────────────────────────────────────────────────

/**
 * Maps destPath → active Promise<DownloadResult> so concurrent callers
 * downloading the same file receive the same promise.  Cleared on completion
 * (success or error).
 *
 * Module-level is intentional — this is a runtime cache, not React state.
 */
const inflight = new Map<string, Promise<DownloadResult>>();

/**
 * Maps destPath → cancel function so the global registry can abort all active
 * downloads on disconnect.
 */
const cancelRegistry = new Map<string, () => void>();

/** Cancel all active downloads (call on disconnect/logout). */
export function cancelAllDownloads(): void {
  for (const cancel of cancelRegistry.values()) {
    try {
      cancel();
    } catch {
      // Ignore
    }
  }
  cancelRegistry.clear();
  inflight.clear();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extname(p: string): string {
  const base = p.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot);
}

/**
 * Query parameter keys whose decoded value may carry the real file extension
 * when the URL pathname has none.  The OpenClaw gateway uses `?source=<path>`
 * (e.g. `?source=~%2F.openclaw%2Fmedia%2F…%2Fclip.mp4`), so AVFoundation
 * would otherwise see a `.bin` file and refuse to decode it.
 */
const QUERY_KEYS_FOR_EXT = ['source', 'path', 'file', 'url', 'name'] as const;

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);

    // Prefer the pathname extension (standard URLs).
    const pathExt = extname(u.pathname);
    if (pathExt.length > 1 && pathExt.length <= 6) return pathExt.toLowerCase();

    // Fallback: scan allow-listed query params for a decodable path with extension.
    for (const key of QUERY_KEYS_FOR_EXT) {
      const raw = u.searchParams.get(key);
      if (!raw) continue;
      const ext = extname(decodeURIComponent(raw));
      if (ext.length > 1 && ext.length <= 6) return ext.toLowerCase();
    }

    return FALLBACK_EXT;
  } catch {
    const ext = extname(url);
    return ext.length > 1 && ext.length <= 6 ? ext.toLowerCase() : FALLBACK_EXT;
  }
}

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    try {
      await FileSystem.setExcludedFromBackupsAsync(dir, true);
    } catch {
      // Not fatal — some platforms / versions may not support this.
    }
  }
}

async function urlHash(input: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return digest.slice(0, 16);
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * HEAD pre-flight: reject downloads that exceed the per-file size cap.
 * Silently passes if the server doesn't support HEAD or omits Content-Length.
 */
async function checkFileSizeCap(url: string, token: string | null | undefined): Promise<void> {
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const cl = resp.headers.get('content-length');
    if (cl) {
      const bytes = parseInt(cl, 10);
      if (!isNaN(bytes) && bytes > FILE_SIZE_CAP) {
        throw new FileTooLargeError(i18n.t('chat.media.download.fileTooLarge', { bytes, limit: '256 MB' }));
      }
    }
  } catch (e) {
    if (e instanceof FileTooLargeError) throw e;
    // HEAD failed or no Content-Length — allow download to proceed.
  }
}

// ── Post-download validation ──────────────────────────────────────────────────

/**
 * B2/B3: Read the first 64 bytes of the saved file and verify it is not an
 * HTML error page masquerading as media. Throws `MediaSavedFileError` on
 * detection; errors during reading are silently swallowed to avoid
 * false-positive failures on exotic platforms.
 */
async function validateSavedFile(path: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(path, { size: true });

    // Only treat as empty when we can positively confirm size === 0.
    // If info.exists is false we cannot determine size, so we skip this check.
    if (info.exists && 'size' in info && info.size === 0) {
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      throw new MediaSavedFileError('other', i18n.t('chat.media.download.fileEmpty'));
    }

    const sizeBytes = info.exists && 'size' in info ? (info.size ?? 0) : 0;

    // Read first 64 bytes as base64 for content sniffing.
    const b64 = await FileSystem.readAsStringAsync(path, {
      encoding: 'base64' as const,
      position: 0,
      length: 64,
    });

    // atob is available on Hermes (RN 0.73+) and in Node.js 16+.
    const raw = atob(b64);

    // Detect HTML error page: first non-whitespace char is '<'.
    if (raw.trimStart().charCodeAt(0) === 0x3c /* '<' */) {
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      throw new MediaSavedFileError('html', i18n.t('chat.media.download.htmlPage'));
    }

  } catch (e) {
    if (e instanceof MediaSavedFileError) throw e;
    // Could not read file for sniffing — do not false-positive; let caller proceed.
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Download a media file with progress reporting and a cancel handle.
 *
 * - Persistent files: profile-namespaced hash key, tracked in LRU manifest.
 * - Ephemeral files: UUID name under ephemeral/, NOT in LRU manifest.
 * - In-flight dedup: concurrent calls for the same persistent destPath share one Promise.
 * - HEAD pre-flight: rejects files > 256 MB before downloading.
 * - LRU eviction: after each persistent write, trims oldest entries to stay under 1 GB.
 */
export function downloadToCacheCancellable(
  url: string,
  token: string | null | undefined,
  opts?: DownloadOpts,
): DownloadHandle {
  const profileId = opts?.profileId ?? '_';
  const ephemeral = opts?.ephemeral ?? false;
  const onProgress = opts?.onProgress;

  let cancelled = false;
  // B1: set to true once the cache file is committed; prevents cancelFn from
  // deleting a successfully written cache entry on post-completion cancel().
  let completed = false;
  let cancelFn: (() => void) | null = null;

  const doDownload = async (): Promise<DownloadResult> => {
    const ext = opts?.fileName
      ? extname(opts.fileName).toLowerCase() || extFromUrl(url)
      : extFromUrl(url);

    let destPath: string;
    if (ephemeral) {
      await ensureDir(EPHEMERAL_SUBDIR);
      destPath = `${EPHEMERAL_SUBDIR}${generateUUID()}${ext}`;
    } else {
      await ensureDir(MEDIA_CACHE_DIR);
      const hash = await urlHash(`${profileId}\u0000${url}`);
      destPath = `${MEDIA_CACHE_DIR}${hash}${ext}`;

      // Return cached file immediately (touch manifest entry for LRU).
      const existing = await FileSystem.getInfoAsync(destPath);
      if (existing.exists) {
        void touchManifestEntry(destPath);
        return { localUri: destPath, mimeType: opts?.mimeType ?? mimeFromExt(ext) };
      }

      // Dedup: if another caller is already downloading this path, share the promise.
      const active = inflight.get(destPath);
      if (active) return active;
    }

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    // HEAD pre-flight size check.
    await checkFileSizeCap(url, token);

    if (cancelled) throw new Error(i18n.t('chat.media.download.cancelled'));

    const dl = FileSystem.createDownloadResumable(
      url,
      destPath,
      { headers },
      onProgress
        ? (downloadProgress) => {
            if (downloadProgress.totalBytesExpectedToWrite > 0) {
              onProgress(
                downloadProgress.totalBytesWritten /
                  downloadProgress.totalBytesExpectedToWrite,
              );
            }
          }
        : undefined,
    );

    cancelFn = async () => {
      // B1: once completed, the file is a committed cache entry — never delete it.
      if (completed) return;
      try {
        await dl.pauseAsync();
      } catch {
        // ignore
      }
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
    };

    if (!ephemeral) cancelRegistry.set(destPath, () => { void cancelFn?.(); });

    const result = await dl.downloadAsync();

    if (!ephemeral) {
      cancelRegistry.delete(destPath);
      inflight.delete(destPath);
    }

    if (cancelled) {
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      throw new Error(i18n.t('chat.media.download.cancelled'));
    }

    if (!result) {
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      throw new Error(i18n.t('chat.media.download.failedNoResult'));
    }
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      throw new Error(i18n.t('chat.media.download.failedStatus', { status: result.status }));
    }

    // B2/B3: validate saved bytes (HTML sniff, zero-size, DEV hex log).
    if (!ephemeral) {
      await validateSavedFile(destPath);
    }

    // Persist LRU entry for non-ephemeral files.
    if (!ephemeral) {
      const fileInfo = await FileSystem.getInfoAsync(destPath, { size: true });
      const size = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
      await addManifestEntry({ path: destPath, size, lastAccessMs: Date.now() });
    }

    // B1: mark completed before resolving — cancelFn must not delete a
    // committed cache entry even if cancel() is called post-completion.
    completed = true;

    return { localUri: result.uri, mimeType: opts?.mimeType ?? mimeFromExt(ext) };
  };

  // Wrap in dedup for persistent files.
  let promise: Promise<DownloadResult>;
  if (!ephemeral) {
    // We need the destPath synchronously for dedup, but it requires async hashing.
    // We handle dedup inside doDownload (after the hash is computed), so the outer
    // promise here is a single-caller wrapper that propagates cancellation.
    promise = doDownload().catch((e) => {
      // Ensure inflight and cancelRegistry are cleaned up on error.
      cancelRegistry.forEach((_, k) => {
        if (cancelRegistry.get(k) === cancelFn) {
          cancelRegistry.delete(k);
          inflight.delete(k);
        }
      });
      throw e;
    });
  } else {
    promise = doDownload();
  }

  const cancel = (): void => {
    cancelled = true;
    void cancelFn?.();
  };

  return { promise, cancel };
}

/**
 * Thin wrapper around `downloadToCacheCancellable` for callers that don't need
 * progress or cancellation.
 */
export async function downloadToCache(
  url: string,
  token: string | null | undefined,
  opts?: Pick<DownloadOpts, 'fileName' | 'mimeType' | 'profileId'>,
): Promise<DownloadResult> {
  return downloadToCacheCancellable(url, token, opts).promise;
}

/**
 * Delete all cached media files (persistent + ephemeral) and reset the manifest.
 * Should be called on profile-switch and logout.
 */
export async function clearMediaCache(): Promise<void> {
  cancelAllDownloads();
  try {
    const info = await FileSystem.getInfoAsync(MEDIA_CACHE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(MEDIA_CACHE_DIR, { idempotent: true });
    }
  } catch {
    // Failure to clear cache is not fatal.
  }
}

/**
 * Return the total byte count of all persistent cached files.
 * Returns 0 if the manifest is missing or unreadable.
 */
export async function getMediaCacheUsageBytes(): Promise<number> {
  const manifest = await readManifest();
  return manifest.entries.reduce((sum, e) => sum + e.size, 0);
}

// ── MIME helpers ──────────────────────────────────────────────────────────────

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.mp3':
      return 'audio/mpeg';
    case '.opus':
      return 'audio/opus';
    case '.ogg':
      return 'audio/ogg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
