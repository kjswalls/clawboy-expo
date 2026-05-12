/**
 * downloadMedia.ts unit tests.
 *
 * All file-system + crypto calls are mocked in-process — no native module needed.
 * Mocks use jest.fn() inside factories (required by jest-hoist) and are retrieved
 * via jest.requireMock in tests, following the same pattern as device-identity.test.ts.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ── jest.mock factories — must only use jest.fn() inside, no outer-scope refs ──

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: '/cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  __esModule: true,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(),
}));

// ── Retrieve mocks after registration ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = jest.requireMock('expo-file-system/legacy') as {
  cacheDirectory: string;
  getInfoAsync: jest.MockedFunction<any>;
  makeDirectoryAsync: jest.MockedFunction<any>;
  deleteAsync: jest.MockedFunction<any>;
  readAsStringAsync: jest.MockedFunction<any>;
  writeAsStringAsync: jest.MockedFunction<any>;
  createDownloadResumable: jest.MockedFunction<any>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = jest.requireMock('expo-crypto') as {
  CryptoDigestAlgorithm: { SHA256: string };
  CryptoEncoding: { HEX: string };
  digestStringAsync: jest.MockedFunction<any>;
};

// ── Module under test (imported after mocks are registered) ───────────────────

import {
  downloadToCacheCancellable,
  downloadToCache,
  clearMediaCache,
  getMediaCacheUsageBytes,
  cancelAllDownloads,
  MediaSavedFileError,
} from '../downloadMedia';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXED_HASH = 'abcdef12345678ab';
const FIXED_HASH_FULL = 'abcdef12345678abcdef12345678abcdef12345678abcdef12345678abcdef12';

function makeManifestJson(entries: Array<{ path: string; size: number; lastAccessMs: number }>) {
  return JSON.stringify({ entries });
}

/** A download resumable that succeeds and supports progress callbacks. */
function makeResumable(destPath: string, overrides?: { status?: number }) {
  const progressCallbacks: Array<(p: any) => void> = [];
  const resumable = {
    downloadAsync: jest.fn<any>().mockResolvedValue({
      uri: destPath,
      status: overrides?.status ?? 200,
    }),
    pauseAsync: jest.fn<any>().mockResolvedValue(undefined),
    _fire: (written: number, total: number) => {
      progressCallbacks.forEach((cb) =>
        cb({ totalBytesWritten: written, totalBytesExpectedToWrite: total }),
      );
    },
  };
  // Capture the progress callback passed to createDownloadResumable.
  fs.createDownloadResumable.mockImplementation(
    (_url: string, _dest: string, _opts: object, progressCb: ((p: any) => void) | undefined) => {
      if (progressCb) progressCallbacks.push(progressCb);
      return resumable;
    },
  );
  return resumable;
}

/** Set up the filesystem mock for a clean (no cached files) state. */
function setupEmptyFs(destPath?: string) {
  let destHits = 0;
  fs.getInfoAsync.mockImplementation((p: string) => {
    if (p.endsWith('manifest.json'))
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    if (p.endsWith('clawboy-media/') || p.endsWith('ephemeral/'))
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    if (destPath && p === destPath) {
      destHits += 1;
      if (destHits === 1) {
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      }
      return Promise.resolve({
        exists: true,
        uri: p,
        size: 100_000,
        isDirectory: false,
        modificationTime: 1,
      });
    }
    return Promise.resolve({ exists: false, uri: p, isDirectory: false });
  });
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
  fs.readAsStringAsync.mockRejectedValue(new Error('ENOENT'));
  fs.writeAsStringAsync.mockResolvedValue(undefined);
  fs.deleteAsync.mockResolvedValue(undefined);
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  cancelAllDownloads();

  // Stable hash for all tests unless overridden.
  crypto.digestStringAsync.mockResolvedValue(FIXED_HASH_FULL);

  // Default: successful HEAD (no Content-Length).
  global.fetch = jest.fn<any>().mockResolvedValue({
    headers: { get: jest.fn<any>().mockReturnValue(null) },
  });

  const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;
  setupEmptyFs(destPath);
  makeResumable(destPath);
});

afterEach(() => {
  cancelAllDownloads();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('downloadToCacheCancellable — basic download', () => {
  it('downloads a file and returns a localUri', async () => {
    const { promise } = downloadToCacheCancellable('https://example.com/clip.mp4', 'tok');
    const result = await promise;
    expect(result.localUri).toContain('.mp4');
    expect(result.mimeType).toBe('video/mp4');
  });

  it('passes Authorization Bearer header', async () => {
    const { promise } = downloadToCacheCancellable('https://example.com/clip.mp4', 'mytoken');
    await promise;
    const [, , opts] = fs.createDownloadResumable.mock.calls[0] as any[];
    expect(opts.headers.Authorization).toBe('Bearer mytoken');
  });

  it('omits Authorization header when token is null', async () => {
    const { promise } = downloadToCacheCancellable('https://example.com/clip.mp4', null);
    await promise;
    const [, , opts] = fs.createDownloadResumable.mock.calls[0] as any[];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it('returns cached file immediately on hit (no download)', async () => {
    // Simulate cached file present.
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.includes(FIXED_HASH)) return Promise.resolve({ exists: true, size: 5000 });
      return Promise.resolve({ exists: false });
    });
    const { promise } = downloadToCacheCancellable('https://example.com/clip.mp4', 'tok');
    await promise;
    expect(fs.createDownloadResumable).not.toHaveBeenCalled();
  });
});

/** Poll until `condition()` returns true or `maxMs` elapses. */
async function waitFor(condition: () => boolean, maxMs = 200): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('downloadToCacheCancellable — progress reporting', () => {
  it('calls onProgress with a fraction between 0 and 1', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;

    // Make downloadAsync hang so we can fire progress before it resolves.
    let resolveDownload!: (v: any) => void;
    const hangPromise = new Promise<any>((res) => { resolveDownload = res; });
    const progressCallbacks: Array<(p: any) => void> = [];
    fs.createDownloadResumable.mockImplementation(
      (_url: string, _dest: string, _opts: object, progressCb?: (p: any) => void) => {
        if (progressCb) progressCallbacks.push(progressCb);
        return {
          downloadAsync: jest.fn<any>().mockReturnValue(hangPromise),
          pauseAsync: jest.fn<any>().mockResolvedValue(undefined),
        };
      },
    );

    const progressValues: number[] = [];
    const { promise } = downloadToCacheCancellable('https://example.com/vid.mp4', null, {
      onProgress: (f) => progressValues.push(f),
    });

    // Wait until createDownloadResumable has been called (all prior awaits resolved).
    await waitFor(() => progressCallbacks.length > 0);

    progressCallbacks[0]?.({ totalBytesWritten: 500_000, totalBytesExpectedToWrite: 1_000_000 });
    progressCallbacks[0]?.({ totalBytesWritten: 1_000_000, totalBytesExpectedToWrite: 1_000_000 });

    // Let the download complete.
    resolveDownload({ uri: destPath, status: 200 });
    await promise;

    expect(progressValues).toContain(0.5);
    expect(progressValues).toContain(1);
  });

  it('ignores progress when totalBytesExpectedToWrite is 0', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;

    let resolveDownload!: (v: any) => void;
    const hangPromise = new Promise<any>((res) => { resolveDownload = res; });
    const progressCallbacks: Array<(p: any) => void> = [];
    fs.createDownloadResumable.mockImplementation(
      (_url: string, _dest: string, _opts: object, progressCb?: (p: any) => void) => {
        if (progressCb) progressCallbacks.push(progressCb);
        return {
          downloadAsync: jest.fn<any>().mockReturnValue(hangPromise),
          pauseAsync: jest.fn<any>().mockResolvedValue(undefined),
        };
      },
    );

    const progressValues: number[] = [];
    const { promise } = downloadToCacheCancellable('https://example.com/vid.mp4', null, {
      onProgress: (f) => progressValues.push(f),
    });

    await waitFor(() => progressCallbacks.length > 0);
    progressCallbacks[0]?.({ totalBytesWritten: 0, totalBytesExpectedToWrite: 0 });

    resolveDownload({ uri: destPath, status: 200 });
    await promise;
    expect(progressValues).toHaveLength(0);
  });
});

describe('downloadToCacheCancellable — profile-namespaced keys', () => {
  it('uses different hash inputs for different profileIds', async () => {
    const hashInputs: string[] = [];
    crypto.digestStringAsync.mockImplementation((_algo: any, input: string) => {
      hashInputs.push(input);
      return Promise.resolve(FIXED_HASH_FULL);
    });

    await downloadToCacheCancellable('https://example.com/f.mp4', 'tok', {
      profileId: 'prof_a',
    }).promise;
    jest.clearAllMocks();
    crypto.digestStringAsync.mockImplementation((_algo: any, input: string) => {
      hashInputs.push(input);
      return Promise.resolve(FIXED_HASH_FULL);
    });
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    fs.writeAsStringAsync.mockResolvedValue(undefined);
    fs.makeDirectoryAsync.mockResolvedValue(undefined);
    makeResumable(`/cache/clawboy-media/${FIXED_HASH}.mp4`);

    await downloadToCacheCancellable('https://example.com/f.mp4', 'tok', {
      profileId: 'prof_b',
    }).promise;

    expect(hashInputs[0]).toContain('prof_a');
    expect(hashInputs[1]).toContain('prof_b');
    expect(hashInputs[0]).not.toBe(hashInputs[1]);
  });

  it('defaults to profileId "_" when not provided', async () => {
    const hashInputs: string[] = [];
    crypto.digestStringAsync.mockImplementation((_algo: any, input: string) => {
      hashInputs.push(input);
      return Promise.resolve(FIXED_HASH_FULL);
    });
    await downloadToCacheCancellable('https://example.com/f.mp4', 'tok').promise;
    // Hash input should be `_\0url`
    expect(hashInputs[0]).toMatch(/^_\u0000/);
  });
});

describe('downloadToCacheCancellable — extension from query params', () => {
  /**
   * Helper: start a download and return the destination path that was passed
   * to `fs.createDownloadResumable`. We only care about the extension.
   */
  async function destExtFor(url: string): Promise<string> {
    // Use a simple always-succeeds resumable for any destPath.
    fs.createDownloadResumable.mockImplementation((_url: string, dest: string) => ({
      downloadAsync: jest.fn<any>().mockResolvedValue({ uri: dest, status: 200 }),
      pauseAsync: jest.fn<any>().mockResolvedValue(undefined),
    }));
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    fs.writeAsStringAsync.mockResolvedValue(undefined);
    fs.makeDirectoryAsync.mockResolvedValue(undefined);

    await downloadToCacheCancellable(url, 'tok').promise;

    const [, dest] = fs.createDownloadResumable.mock.calls[0] as [string, string];
    return dest.slice(dest.lastIndexOf('.'));
  }

  it('gateway ?source= URL → extracts .mp4 from the decoded source param', async () => {
    const url =
      'https://gw.example.com/__openclaw__/assistant-media' +
      '?source=' + encodeURIComponent('~/.openclaw/media/tool-video-generation/clip.mp4');
    expect(await destExtFor(url)).toBe('.mp4');
  });

  it('gateway ?source= URL with audio → extracts .opus', async () => {
    const url =
      'https://gw.example.com/__openclaw__/assistant-media' +
      '?source=' + encodeURIComponent('/tmp/audio/result.opus');
    expect(await destExtFor(url)).toBe('.opus');
  });

  it('regular URL with pathname extension → uses pathname extension (no regression)', async () => {
    expect(await destExtFor('https://example.com/video/clip.mp4')).toBe('.mp4');
  });

  it('URL with no extension anywhere → falls back to .bin', async () => {
    expect(await destExtFor('https://example.com/no-ext')).toBe('.bin');
  });

  it('?source= value with no dot-extension → falls back to .bin', async () => {
    // A path-like value that has no extension in the final segment.
    const url =
      'https://gw.example.com/__openclaw__/assistant-media' +
      '?source=' + encodeURIComponent('/tmp/no-extension-here');
    expect(await destExtFor(url)).toBe('.bin');
  });

  it('?token= param (not allow-listed) is not used for extension', async () => {
    // ?token= should never be consulted even if it contains a path-like string.
    const url =
      'https://gw.example.com/__openclaw__/assistant-media' +
      '?token=' + encodeURIComponent('/tmp/secret.mp4');
    expect(await destExtFor(url)).toBe('.bin');
  });

  it('?source= extension longer than 6 chars is rejected → .bin', async () => {
    const url =
      'https://gw.example.com/__openclaw__/assistant-media' +
      '?source=' + encodeURIComponent('/tmp/file.toolongext');
    expect(await destExtFor(url)).toBe('.bin');
  });
});

describe('downloadToCacheCancellable — HEAD size cap', () => {
  it('rejects when Content-Length exceeds 256 MB', async () => {
    const overCap = (256 * 1024 * 1024 + 1).toString();
    global.fetch = jest.fn<any>().mockResolvedValue({
      headers: { get: jest.fn<any>().mockReturnValue(overCap) },
    });

    await expect(
      downloadToCacheCancellable('https://example.com/big.mp4', 'tok').promise,
    ).rejects.toThrow('256 MB');
  });

  it('proceeds when Content-Length equals the cap exactly', async () => {
    const atCap = (256 * 1024 * 1024).toString();
    global.fetch = jest.fn<any>().mockResolvedValue({
      headers: { get: jest.fn<any>().mockReturnValue(atCap) },
    });
    await expect(
      downloadToCacheCancellable('https://example.com/max.mp4', 'tok').promise,
    ).resolves.toBeTruthy();
  });

  it('proceeds when HEAD fails (server does not support HEAD)', async () => {
    global.fetch = jest.fn<any>().mockRejectedValue(new Error('Network error'));
    await expect(
      downloadToCacheCancellable('https://example.com/clip.mp4', 'tok').promise,
    ).resolves.toBeTruthy();
  });

  it('proceeds when Content-Length is absent', async () => {
    global.fetch = jest.fn<any>().mockResolvedValue({
      headers: { get: jest.fn<any>().mockReturnValue(null) },
    });
    await expect(
      downloadToCacheCancellable('https://example.com/clip.mp4', 'tok').promise,
    ).resolves.toBeTruthy();
  });
});

describe('downloadToCacheCancellable — cancel', () => {
  it('cancel() invokes pauseAsync and deletes the partial file', async () => {
    // Make the download hang so cancel() has time to fire after the resumable is created.
    let resolveDownload!: (v: any) => void;
    const hangPromise = new Promise<any>((res) => { resolveDownload = res; });

    const pauseFn = jest.fn<any>().mockResolvedValue(undefined);
    let resumableCreated = false;

    fs.createDownloadResumable.mockImplementation(() => {
      resumableCreated = true;
      return {
        downloadAsync: jest.fn<any>().mockReturnValue(hangPromise),
        pauseAsync: pauseFn,
      };
    });

    const handle = downloadToCacheCancellable('https://example.com/clip.mp4', 'tok');

    // Suppress the expected cancellation rejection to avoid unhandled rejection crash.
    const settledPromise = handle.promise.catch(() => null);

    // Wait until the resumable is actually created (all prior awaits resolved).
    await waitFor(() => resumableCreated);

    handle.cancel();

    // Let async cancel work settle.
    await new Promise((r) => setTimeout(r, 30));

    expect(pauseFn).toHaveBeenCalled();
    expect(fs.deleteAsync).toHaveBeenCalled();

    // Resolve the download so the hanging promise settles.
    resolveDownload({ uri: '/cache/clawboy-media/hang.mp4', status: 200 });
    await settledPromise;
  });
});

describe('downloadToCacheCancellable — cancel after completion (B1)', () => {
  it('cancel() after a successful download does NOT delete the committed cache file', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;
    // setupEmptyFs + makeResumable already applied in beforeEach.

    const handle = downloadToCacheCancellable('https://example.com/clip.mp4', 'tok');
    await handle.promise;

    // Clear any deleteAsync calls that happened during the download itself.
    fs.deleteAsync.mockClear();

    handle.cancel();

    // Give the async cancelFn time to settle.
    await new Promise((r) => setTimeout(r, 30));

    const deletedPaths = (fs.deleteAsync.mock.calls as any[][]).map((c) => c[0] as string);
    expect(deletedPaths.some((p) => p.includes(FIXED_HASH))).toBe(false);
  });
});

describe('downloadToCacheCancellable — saved-file validation (B2)', () => {
  it('HTML body saved as .mp4 → rejects with MediaSavedFileError and deletes the partial file', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;

    // Return base64-encoded HTML for the downloaded file; manifest reads get empty manifest.
    const htmlBase64 = btoa('<!DOCTYPE html><html><body>Error</body></html>');
    fs.readAsStringAsync.mockImplementation((p: string, opts?: any) => {
      if (opts?.encoding === 'base64' && p === destPath) {
        return Promise.resolve(htmlBase64);
      }
      // Zero-size check: return non-zero size for validate getInfoAsync
      return Promise.reject(new Error('ENOENT'));
    });
    // Override getInfoAsync so validateSavedFile sees a non-zero size for the file.
    let destProbeCount = 0;
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p.endsWith('clawboy-media/') || p.endsWith('ephemeral/'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p === destPath) {
        destProbeCount += 1;
        if (destProbeCount === 1) return Promise.resolve({ exists: false, uri: p, isDirectory: false });
        return Promise.resolve({ exists: true, uri: p, isDirectory: false, modificationTime: 1, size: 5000 });
      }
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    });

    const { promise } = downloadToCacheCancellable('https://example.com/clip.mp4', 'tok');

    await expect(promise).rejects.toBeInstanceOf(MediaSavedFileError);

    // The partial file must be deleted after HTML detection.
    const deletedPaths = (fs.deleteAsync.mock.calls as any[][]).map((c) => c[0] as string);
    expect(deletedPaths.some((p) => p === destPath)).toBe(true);
  });

  it('MediaSavedFileError carries reason "html"', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;
    const htmlBase64 = btoa('<html>');
    fs.readAsStringAsync.mockImplementation((p: string, opts?: any) => {
      if (opts?.encoding === 'base64' && p === destPath) return Promise.resolve(htmlBase64);
      return Promise.reject(new Error('ENOENT'));
    });
    let destProbeCount = 0;
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p.endsWith('clawboy-media/') || p.endsWith('ephemeral/'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p === destPath) {
        destProbeCount += 1;
        if (destProbeCount === 1) return Promise.resolve({ exists: false, uri: p, isDirectory: false });
        return Promise.resolve({ exists: true, uri: p, isDirectory: false, modificationTime: 1, size: 1000 });
      }
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    });

    let caught: unknown;
    try {
      await downloadToCacheCancellable('https://example.com/clip.mp4', 'tok').promise;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MediaSavedFileError);
    expect((caught as MediaSavedFileError).reason).toBe('html');
  });

  it('empty file → rejects with MediaSavedFileError reason "other"', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;
    let destProbeCount = 0;
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p.endsWith('clawboy-media/') || p.endsWith('ephemeral/'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p === destPath) {
        destProbeCount += 1;
        if (destProbeCount === 1) return Promise.resolve({ exists: false, uri: p, isDirectory: false });
        return Promise.resolve({ exists: true, uri: p, isDirectory: false, modificationTime: 1, size: 0 });
      }
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    });

    let caught: unknown;
    try {
      await downloadToCacheCancellable('https://example.com/clip.mp4', 'tok').promise;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MediaSavedFileError);
    expect((caught as MediaSavedFileError).reason).toBe('other');
  });

  it('unreadable file (sniff throws) → proceeds without error', async () => {
    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;
    // readAsStringAsync rejects for the file (e.g. permissions error after write).
    fs.readAsStringAsync.mockRejectedValue(new Error('Permission denied'));
    // But size is non-zero.
    let destProbeCount = 0;
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p.endsWith('clawboy-media/') || p.endsWith('ephemeral/'))
        return Promise.resolve({ exists: false, uri: p, isDirectory: false });
      if (p === destPath) {
        destProbeCount += 1;
        if (destProbeCount === 1) return Promise.resolve({ exists: false, uri: p, isDirectory: false });
        return Promise.resolve({ exists: true, uri: p, isDirectory: false, modificationTime: 1, size: 100_000 });
      }
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    });

    await expect(
      downloadToCacheCancellable('https://example.com/clip.mp4', 'tok').promise,
    ).resolves.toBeTruthy();
  });
});

describe('downloadToCacheCancellable — ephemeral mode', () => {
  it('writes to the ephemeral/ subdir', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false });

    const { promise } = downloadToCacheCancellable('https://example.com/clip.mp4', 'tok', {
      ephemeral: true,
    });

    // The resumable won't be set up by makeResumable — set it up here.
    fs.createDownloadResumable.mockImplementation((_url: string, dest: string) => ({
      downloadAsync: jest.fn<any>().mockResolvedValue({ uri: dest, status: 200 }),
      pauseAsync: jest.fn<any>().mockResolvedValue(undefined),
    }));

    await promise;

    const [, dest] = fs.createDownloadResumable.mock.calls[0] as any[];
    expect(dest).toContain('ephemeral/');
  });

  it('does NOT write a manifest entry for ephemeral files', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    fs.createDownloadResumable.mockImplementation((_url: string, dest: string) => ({
      downloadAsync: jest.fn<any>().mockResolvedValue({ uri: dest, status: 200 }),
      pauseAsync: jest.fn<any>().mockResolvedValue(undefined),
    }));

    await downloadToCacheCancellable('https://example.com/clip.mp4', 'tok', {
      ephemeral: true,
    }).promise;

    expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  });
});

describe('LRU eviction', () => {
  it('deletes the oldest entry when total exceeds the 1 GB cap', async () => {
    const HALF_GB = 512 * 1024 * 1024;
    const NEW_FILE_SIZE = 600 * 1024 * 1024;

    const existingEntries = [
      { path: '/cache/clawboy-media/old_a.mp4', size: HALF_GB, lastAccessMs: 1000 },
      { path: '/cache/clawboy-media/old_b.mp4', size: HALF_GB, lastAccessMs: 2000 },
    ];

    const destPath = `/cache/clawboy-media/${FIXED_HASH}.mp4`;

    let destProbeCount = 0;
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json'))
        return Promise.resolve({ exists: true, uri: p, isDirectory: false, modificationTime: 1, size: 400 });
      if (p.endsWith('clawboy-media/'))
        return Promise.resolve({ exists: true, uri: p, isDirectory: true, modificationTime: 1, size: 1 });
      if (p === destPath) {
        destProbeCount += 1;
        if (destProbeCount === 1) return Promise.resolve({ exists: false, uri: p, isDirectory: false });
        return Promise.resolve({ exists: true, uri: p, isDirectory: false, modificationTime: 1, size: NEW_FILE_SIZE });
      }
      return Promise.resolve({ exists: false, uri: p, isDirectory: false });
    });
    fs.readAsStringAsync.mockResolvedValue(makeManifestJson(existingEntries));
    fs.writeAsStringAsync.mockResolvedValue(undefined);
    fs.deleteAsync.mockResolvedValue(undefined);
    makeResumable(destPath);

    await downloadToCacheCancellable('https://example.com/new.mp4', 'tok').promise;

    const deletedPaths = fs.deleteAsync.mock.calls.map((c: any[]) => c[0] as string);
    expect(deletedPaths.some((p) => p.includes('old_a.mp4'))).toBe(true);
  });
});

describe('clearMediaCache', () => {
  it('deletes the entire cache directory', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true });
    await clearMediaCache();
    expect(fs.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('clawboy-media'),
      expect.objectContaining({ idempotent: true }),
    );
  });

  it('is a no-op when the cache dir does not exist', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    await clearMediaCache();
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });
});

describe('getMediaCacheUsageBytes', () => {
  it('returns the sum of sizes from the manifest', async () => {
    fs.getInfoAsync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json')) return Promise.resolve({ exists: true });
      return Promise.resolve({ exists: false });
    });
    fs.readAsStringAsync.mockResolvedValue(
      makeManifestJson([
        { path: '/a.mp4', size: 1_000_000, lastAccessMs: 1 },
        { path: '/b.mp4', size: 2_000_000, lastAccessMs: 2 },
      ]),
    );
    const bytes = await getMediaCacheUsageBytes();
    expect(bytes).toBe(3_000_000);
  });

  it('returns 0 when the manifest is absent', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    const bytes = await getMediaCacheUsageBytes();
    expect(bytes).toBe(0);
  });
});

describe('downloadToCache (thin wrapper)', () => {
  it('resolves with a DownloadResult', async () => {
    const result = await downloadToCache('https://example.com/img.png', 'tok');
    expect(result).toHaveProperty('localUri');
    expect(result).toHaveProperty('mimeType');
  });
});
