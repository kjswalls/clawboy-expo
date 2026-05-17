export interface DictationEntry {
  ts: number;
  len: number;
  head: string;
  tail: string;
}

const RING_SIZE = 500;
let buffer: DictationEntry[] = [];
let nextIdx = 0;
let listeners = new Set<() => void>();

export function recordDictationTick(text: string): void {
  const entry: DictationEntry = {
    ts: Date.now(),
    len: text.length,
    head: text.slice(0, 24),
    tail: text.length > 24 ? text.slice(-24) : '',
  };
  if (buffer.length < RING_SIZE) {
    buffer.push(entry);
  } else {
    buffer[nextIdx] = entry;
    nextIdx = (nextIdx + 1) % RING_SIZE;
  }
  listeners.forEach((l) => l());
}

export function getDictationEntries(): DictationEntry[] {
  if (buffer.length < RING_SIZE) return buffer.slice();
  return [...buffer.slice(nextIdx), ...buffer.slice(0, nextIdx)];
}

export function clearDictationEntries(): void {
  buffer = [];
  nextIdx = 0;
  listeners.forEach((l) => l());
}

export function subscribeDictation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
