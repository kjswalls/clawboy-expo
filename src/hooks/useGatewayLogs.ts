import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { coalesceMultiline, parseLogLine, type LogLine } from '@/lib/logParser';
import { extractLoggingFile, type LogsTailParams } from '@/lib/openclaw/logs';

const POLL_INTERVAL_MS = 2_000;
export const MAX_LINES = 5_000;

function normalizeLogPath(p: string | null | undefined): string | null {
  if (p == null) return null;
  const t = p.trim();
  return t.length > 0 ? t : null;
}
const INITIAL_LIMIT = 500;
const POLL_LIMIT = 1_000;
const POLL_MAX_BYTES = 128 * 1_024;

let globalSeq = 0;
function nextSeq(): number {
  return globalSeq++
}

function parseLines(rawLines: string[], startSeq: number): { parsed: LogLine[]; endSeq: number } {
  const coalesced = coalesceMultiline(rawLines);
  let seq = startSeq;
  const parsed = coalesced.map((raw) => parseLogLine(raw, seq++));
  return { parsed, endSeq: seq };
}

export interface GatewayLogsState {
  lines: LogLine[];
  loading: boolean;
  error: string | null;
  paused: boolean;
  path: string | null;
  /**
   * Set when `logs.tail` returned no path AND `logging.file` is unset in
   * the gateway config. The gateway is using the dated default in this
   * directory. Not a complete file path — display only, non-copyable.
   */
  pathHint: string | null;
  /** Epoch ms of the last successful poll (whether or not it returned new lines). */
  lastPollAt: number | null;
  /** Number of new lines returned by the most recent poll. */
  lastNewCount: number;
  setPaused: (paused: boolean) => void;
  refresh: () => void;
  clear: () => void;
}

/**
 * Polls logs.tail with cursor-based live-tailing.
 *
 * Lifecycle:
 * - On mount: fetch last INITIAL_LIMIT lines, record cursor.
 * - Poll every 2s while connected & !paused: fetch lines since cursor,
 *   append to ring buffer (capped at MAX_LINES).
 * - Rotation guard: if new cursor < stored cursor the log file rotated —
 *   reset buffer and re-fetch from the new tail.
 * - In-flight guard: skip a poll tick if a request is already pending.
 * - Unmount: clear interval, clear all log lines from memory.
 *
 * `enabled` should be false when the modal is closed so the hook stops
 * polling even though it may still be mounted below the modal.
 */
export function useGatewayLogs(enabled: boolean): GatewayLogsState {
  const { client, isConnected } = useConnection();

  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [pathHint, setPathHint] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [lastNewCount, setLastNewCount] = useState(0);

  const cursorRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const seqRef = useRef(nextSeq());
  const mountedRef = useRef(true);
  // Stable ref for path so poll() doesn't need it in its dep array.
  const pathRef = useRef<string | null>(null);
  // Single-flight guard so we don't re-probe config.get on every 2s poll
  // when the gateway has no path to report.
  const configProbeAttemptedRef = useRef(false);

  const appendLines = useCallback((newParsed: LogLine[]) => {
    if (newParsed.length === 0) return;
    setLines((prev) => {
      const combined = [...prev, ...newParsed];
      return combined.length > MAX_LINES ? combined.slice(combined.length - MAX_LINES) : combined;
    });
  }, []);

  const wipe = useCallback(() => {
    setLines([]);
    setError(null);
    setPath(null);
    setPathHint(null);
    setLastPollAt(null);
    setLastNewCount(0);
    cursorRef.current = null;
    pathRef.current = null;
    inFlightRef.current = false;
    configProbeAttemptedRef.current = false;
    seqRef.current = nextSeq();
  }, []);

  // Fallback: when logs.tail returns an empty path, look up `logging.file`
  // in the gateway's server config. Fires at most once per wipe() cycle.
  const probeConfigForLogPath = useCallback(async () => {
    const c = client.current;
    if (!c) return;
    if (configProbeAttemptedRef.current) return;
    if (pathRef.current !== null) return;
    configProbeAttemptedRef.current = true;
    try {
      const { config } = await c.getServerConfig();
      if (!mountedRef.current) return;
      if (pathRef.current !== null) return;
      const derived = extractLoggingFile(config);
      if (derived) {
        setPath(derived);
        pathRef.current = derived;
      } else {
        // config.get succeeded but logging.file is unset → gateway is using
        // the dated default in /tmp/openclaw/. Surface the directory as a hint.
        setPathHint('/tmp/openclaw/');
      }
    } catch {
      // Swallow: current "noPath" UX is the intentional fallback.
    }
  }, [client]);

  const fetchInitial = useCallback(async () => {
    const c = client.current;
    if (!c || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await c.tailLogs({ limit: INITIAL_LIMIT });
      if (!mountedRef.current) return;

      const normalizedPath = normalizeLogPath(result.path);
      setPath(normalizedPath);
      pathRef.current = normalizedPath;
      cursorRef.current = result.cursor;

      const { parsed } = parseLines(result.lines, seqRef.current);
      seqRef.current += parsed.length;
      setLines(parsed);
      setLastPollAt(Date.now());
      setLastNewCount(parsed.length);

      if (normalizedPath === null) void probeConfigForLogPath();
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        inFlightRef.current = false;
      }
    }
  }, [client, probeConfigForLogPath]);

  // poll is stable: it reads path via pathRef so path/error are not deps,
  // preventing the interval from being torn down on every state change.
  const poll = useCallback(async () => {
    const c = client.current;
    if (!c || inFlightRef.current || cursorRef.current === null) return;

    inFlightRef.current = true;
    try {
      const params: LogsTailParams = {
        cursor: cursorRef.current,
        limit: POLL_LIMIT,
        maxBytes: POLL_MAX_BYTES,
      };
      const result = await c.tailLogs(params);
      if (!mountedRef.current) return;

      // Log rotation: server cursor moved backward or path changed.
      if (result.cursor < cursorRef.current) {
        cursorRef.current = null;
        setLines([]);
        const np = normalizeLogPath(result.path);
        setPath(np);
        pathRef.current = np;
        // Allow config.get probe to re-run for the rotated file.
        configProbeAttemptedRef.current = false;
        void fetchInitial();
        return;
      }

      const nextPath = normalizeLogPath(result.path);
      if (nextPath !== pathRef.current) {
        setPath(nextPath);
        pathRef.current = nextPath;
      }
      cursorRef.current = result.cursor;

      const { parsed } = parseLines(result.lines, seqRef.current);
      seqRef.current += parsed.length;
      appendLines(parsed);

      setLastPollAt(Date.now());
      setLastNewCount(parsed.length);
      setError(null);

      if (pathRef.current === null) void probeConfigForLogPath();
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      if (mountedRef.current) inFlightRef.current = false;
    }
  }, [client, fetchInitial, appendLines, probeConfigForLogPath]); // path and error removed from deps

  // Initial fetch when enabled+connected state becomes ready.
  useEffect(() => {
    if (!enabled || !isConnected) return;
    if (cursorRef.current !== null) return; // already loaded
    void fetchInitial();
  }, [enabled, isConnected, fetchInitial]);

  // Polling interval.
  useEffect(() => {
    if (!enabled || !isConnected || paused) return;

    const id = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => { clearInterval(id); };
  }, [enabled, isConnected, paused, poll]);

  // Wipe on disable (modal close).
  useEffect(() => {
    if (!enabled) wipe();
  }, [enabled, wipe]);

  // Wipe on unmount for security.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setLines([]);
      setPath(null);
      setPathHint(null);
      setError(null);
      cursorRef.current = null;
      pathRef.current = null;
    };
  }, []);

  const refresh = useCallback(() => {
    cursorRef.current = null;
    setLines([]);
    setLastPollAt(null);
    setLastNewCount(0);
    void fetchInitial();
  }, [fetchInitial]);

  return {
    lines,
    loading,
    error,
    paused,
    path,
    pathHint,
    lastPollAt,
    lastNewCount,
    setPaused,
    refresh,
    clear: wipe,
  };
}
