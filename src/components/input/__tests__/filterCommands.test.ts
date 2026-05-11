import { describe, it, expect } from '@jest/globals';
import { BUILTIN_SLASH_COMMANDS, filterCommands } from '../slashCommands';

describe('filterCommands', () => {
  it('returns all non-power commands when query is empty and showPower is false', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, '', { showPower: false });
    expect(result.every((c) => c.tier !== 'power')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes power commands when query is non-empty', () => {
    // "kill" and "steer" are power-tier; search for them
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, 'k', { showPower: true });
    const names = result.map((c) => c.name);
    expect(names).toContain('kill');
  });

  it('hides power commands when showPower is false and query is empty', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, '', { showPower: false });
    const names = result.map((c) => c.name);
    expect(names).not.toContain('kill');
    expect(names).not.toContain('steer');
    expect(names).not.toContain('verbose');
  });

  it('filters by name prefix', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, 'mo', { showPower: true });
    const names = result.map((c) => c.name);
    expect(names).toContain('model');
  });

  it('filters by description substring', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, 'session', { showPower: true });
    // "new" description contains "session", "reset" contains "session", etc.
    expect(result.length).toBeGreaterThan(0);
  });

  it('sorts essential before standard before power', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, '', { showPower: true });
    const tiers = result.map((c) => c.tier);
    const essentialIdx = tiers.indexOf('essential');
    const lastEssentialIdx = tiers.lastIndexOf('essential');
    const powerIdx = tiers.indexOf('power');
    if (essentialIdx !== -1 && powerIdx !== -1) {
      expect(essentialIdx).toBeLessThan(powerIdx);
    }
    // Standard comes after all essentials
    const firstStandard = tiers.indexOf('standard');
    if (firstStandard !== -1 && lastEssentialIdx !== -1) {
      expect(lastEssentialIdx).toBeLessThanOrEqual(firstStandard);
    }
  });

  it('returns empty array when no match', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, 'xyzzy12345', { showPower: true });
    expect(result).toHaveLength(0);
  });

  it('alias match works', () => {
    const result = filterCommands(BUILTIN_SLASH_COMMANDS, 'export', { showPower: true });
    const names = result.map((c) => c.name);
    // The export-session command has alias "export"
    expect(names).toContain('export-session');
  });
});

describe('argOptions', () => {
  it('verbose has ["on","off"] argOptions', () => {
    const cmd = BUILTIN_SLASH_COMMANDS.find((c) => c.name === 'verbose');
    expect(cmd?.argOptions).toEqual(['on', 'off']);
  });

  it('fast has ["status","on","off"] argOptions', () => {
    const cmd = BUILTIN_SLASH_COMMANDS.find((c) => c.name === 'fast');
    expect(cmd?.argOptions).toEqual(['status', 'on', 'off']);
  });

  it('tts has ["on","off","inherit"] argOptions', () => {
    const cmd = BUILTIN_SLASH_COMMANDS.find((c) => c.name === 'tts');
    expect(cmd?.argOptions).toEqual(['on', 'off', 'inherit']);
  });

  it('commands without fixed choices have no argOptions', () => {
    const noOptions = ['new', 'reset', 'stop', 'help', 'model', 'agent'];
    for (const name of noOptions) {
      const cmd = BUILTIN_SLASH_COMMANDS.find((c) => c.name === name);
      expect(cmd?.argOptions).toBeUndefined();
    }
  });
});
