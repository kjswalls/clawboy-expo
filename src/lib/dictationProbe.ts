export interface DictationTextEntry {
  kind: 'text';
  ts: number;
  len: number;
  head: string;
  tail: string;
  /** Where the tick was recorded (e.g. 'composer'). Helps disambiguate when
   *  more than one input is instrumented. */
  source: string;
  /** Snapshot of the input's React focus state at tick time. */
  isFocused?: boolean;
  /** Whether the native ref was attached when the tick was recorded. */
  hasRef?: boolean;
}

export interface DictationFocusEntry {
  kind: 'focus';
  ts: number;
  type: 'focus' | 'blur';
  source: string;
}

export type DictationEntry = DictationTextEntry | DictationFocusEntry;

const RING_SIZE = 500;
let buffer: DictationEntry[] = [];
let nextIdx = 0;
let listeners = new Set<() => void>();
/** Stable snapshot for useSyncExternalStore — only replaced when the ring mutates. */
let cachedSnapshot: DictationEntry[] = [];

function refreshCachedSnapshot(): void {
  if (buffer.length === 0) {
    cachedSnapshot = [];
    return;
  }
  if (buffer.length < RING_SIZE) {
    cachedSnapshot = buffer.slice();
    return;
  }
  cachedSnapshot = [...buffer.slice(nextIdx), ...buffer.slice(0, nextIdx)];
}

function pushEntry(entry: DictationEntry): void {
  if (buffer.length < RING_SIZE) {
    buffer.push(entry);
  } else {
    buffer[nextIdx] = entry;
    nextIdx = (nextIdx + 1) % RING_SIZE;
  }
  refreshCachedSnapshot();
  listeners.forEach((l) => l());
}

export interface RecordDictationTickOptions {
  source?: string;
  isFocused?: boolean;
  hasRef?: boolean;
}

export function recordDictationTick(text: string, opts?: RecordDictationTickOptions): void {
  pushEntry({
    kind: 'text',
    ts: Date.now(),
    len: text.length,
    head: text.slice(0, 24),
    tail: text.length > 24 ? text.slice(-24) : '',
    source: opts?.source ?? 'composer',
    isFocused: opts?.isFocused,
    hasRef: opts?.hasRef,
  });
}

export interface RecordDictationFocusOptions {
  type: 'focus' | 'blur';
  source?: string;
}

export function recordDictationFocusEvent(opts: RecordDictationFocusOptions): void {
  pushEntry({
    kind: 'focus',
    ts: Date.now(),
    type: opts.type,
    source: opts.source ?? 'composer',
  });
}

export function getDictationEntries(): DictationEntry[] {
  return cachedSnapshot;
}

export function clearDictationEntries(): void {
  buffer = [];
  nextIdx = 0;
  cachedSnapshot = [];
  listeners.forEach((l) => l());
}

export function subscribeDictation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
