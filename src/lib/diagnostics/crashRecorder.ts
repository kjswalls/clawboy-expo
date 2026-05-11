/**
 * Encrypted crash recorder.
 *
 * Persists a single `CrashRecord` to `AsyncStorage`, encrypted with the
 * shared AES-256-GCM key that lives in `SecureStore` (same key used for the
 * chat cache). An attacker with file-system access but no Secure Enclave
 * access cannot read the record.
 *
 * Design decisions:
 * - ONLY the last crash is retained. One record is enough to diagnose a
 *   crash; keeping many creates unnecessary long-term on-device storage.
 * - Records older than MAX_AGE_MS (7 days) are discarded on read.
 * - The record intentionally omits session ID, message content, and any
 *   other user data. It only captures error name + message, component stack,
 *   app version info, and current route — all safe diagnostic signals.
 * - Error messages may contain user-generated strings in rare edge cases
 *   (e.g. "TypeError: Cannot read property 'x' of undefined"). These are
 *   truncated to 300 chars. The scrubber regex also runs on message.
 * - The component stack from React's ErrorBoundary contains component names
 *   only, no user data.
 *
 * Known limitation — fatal-crash race:
 *   `recordCrash` is async (AsyncStorage write + SecureStore key fetch).
 *   If the JS thread is terminated by a native signal (OOM, watchdog timeout)
 *   before the Promise resolves, the record will not be persisted. This
 *   mostly affects fatal native crashes; recoverable JS errors caught by
 *   ErrorBoundary keep the thread alive long enough for the write to finish.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sealBytes, openBytes } from '@/lib/chatCache/crypto';
import { bytesToHex, hexToBytes } from '@/lib/chatCache/bytes';
import { scrubString } from './scrub';
import { APP_VERSION, BUILD_NUMBER, UPDATE_ID } from '@/lib/appMeta';

const STORAGE_KEY = 'clawboy.lastCrash.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MSG_LEN = 300;
const MAX_COMPONENT_STACK_LEN = 2000;

export interface CrashRecord {
  /** Unix ms timestamp of the crash. */
  ts: number;
  /** Error class name (e.g. "TypeError"). */
  name: string;
  /** Truncated, scrubbed error message. */
  message: string;
  /** React component stack (component names only, no user data). */
  componentStack?: string;
  appVersion: string;
  buildNumber: string;
  updateId: string | null;
  /** Expo Router pathname at time of crash. */
  route?: string;
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a crash record to `AsyncStorage` (encrypted). Overwrites any
 * existing record. Swallows all errors to avoid crashing the crash handler.
 */
export async function recordCrash(input: {
  error: Error;
  componentStack?: string;
  route?: string;
}): Promise<void> {
  try {
    const record: CrashRecord = {
      ts: Date.now(),
      name: input.error.name ?? 'Error',
      message: scrubString(input.error.message ?? '', MAX_MSG_LEN),
      componentStack: input.componentStack
        ? input.componentStack.slice(0, MAX_COMPONENT_STACK_LEN)
        : undefined,
      appVersion: APP_VERSION,
      buildNumber: BUILD_NUMBER,
      updateId: UPDATE_ID,
      route: input.route,
    };
    const json = JSON.stringify(record);
    const plainBytes = new TextEncoder().encode(json);
    const sealed = await sealBytes(plainBytes);
    // Store as hex — AsyncStorage holds strings; bytesToHex is the same util
    // used by the chat cache so encoding is consistent.
    await AsyncStorage.setItem(STORAGE_KEY, bytesToHex(sealed));
  } catch {
    // Never propagate — we're already in an error handler.
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Read the most recent crash record. Returns `null` if:
 * - No record exists.
 * - The record is corrupt, cannot be decrypted, or fails JSON parse.
 * - The record is older than MAX_AGE_MS (7 days).
 */
export async function readLastCrash(): Promise<CrashRecord | null> {
  try {
    const hex = await AsyncStorage.getItem(STORAGE_KEY);
    if (!hex) return null;

    // hexToBytes validates that the string has even length; returns empty array
    // on corrupt input — openBytes will then return null on the too-short check.
    let sealed: Uint8Array;
    try {
      sealed = hexToBytes(hex);
    } catch {
      return null;
    }
    const plaintext = await openBytes(sealed);
    if (!plaintext) return null;

    const json = new TextDecoder().decode(plaintext);
    const record = JSON.parse(json) as unknown;

    if (!isCrashRecord(record)) return null;
    if (Date.now() - record.ts > MAX_AGE_MS) {
      await clearLastCrash();
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

// ── Clear ────────────────────────────────────────────────────────────────────

/** Remove the crash record from storage. Call after the user dismisses the recovery banner. */
export async function clearLastCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Swallow
  }
}

// ── Type guard ───────────────────────────────────────────────────────────────

function isCrashRecord(v: unknown): v is CrashRecord {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['ts'] === 'number' &&
    typeof r['name'] === 'string' &&
    typeof r['message'] === 'string' &&
    typeof r['appVersion'] === 'string' &&
    typeof r['buildNumber'] === 'string' &&
    // updateId is string | null per the interface
    (r['updateId'] === null || typeof r['updateId'] === 'string') &&
    // optional fields must be correct type when present
    (r['componentStack'] === undefined || typeof r['componentStack'] === 'string') &&
    (r['route'] === undefined || typeof r['route'] === 'string')
  );
}
