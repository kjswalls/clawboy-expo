import {
  clearDictationEntries,
  getDictationEntries,
  recordDictationTick,
} from '../dictationProbe';

describe('dictationProbe', () => {
  beforeEach(() => {
    clearDictationEntries();
  });

  it('getDictationEntries returns a stable snapshot until the ring mutates', () => {
    const empty = getDictationEntries();
    expect(getDictationEntries()).toBe(empty);

    recordDictationTick('hello');
    const afterOne = getDictationEntries();
    expect(afterOne).toHaveLength(1);
    expect(getDictationEntries()).toBe(afterOne);

    recordDictationTick('world');
    const afterTwo = getDictationEntries();
    expect(afterTwo).toHaveLength(2);
    expect(afterTwo).not.toBe(afterOne);
    expect(getDictationEntries()).toBe(afterTwo);
  });

  it('clearDictationEntries replaces the snapshot', () => {
    recordDictationTick('x');
    const before = getDictationEntries();
    clearDictationEntries();
    const after = getDictationEntries();
    expect(after).toEqual([]);
    expect(after).not.toBe(before);
  });
});
