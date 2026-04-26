import { describe, it, expect } from '@jest/globals';
import { BUILTIN_SLASH_COMMANDS, parseSlashCommand } from '../slashCommands';

const cmds = BUILTIN_SLASH_COMMANDS;

describe('parseSlashCommand', () => {
  it('parses /new (no args)', () => {
    const result = parseSlashCommand('/new', cmds);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe('new');
    expect(result!.args).toBe('');
  });

  it('parses /model with an arg', () => {
    const result = parseSlashCommand('/model claude-3', cmds);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe('model');
    expect(result!.args).toBe('claude-3');
  });

  it('parses /steer with id and message', () => {
    const result = parseSlashCommand('/steer abc hello there', cmds);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe('steer');
    expect(result!.args).toBe('abc hello there');
  });

  it('parses /reset (whitespace trimmed)', () => {
    const result = parseSlashCommand('  /reset  ', cmds);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe('reset');
    expect(result!.args).toBe('');
  });

  it('parses alias /export for export-session command', () => {
    const result = parseSlashCommand('/export', cmds);
    expect(result).not.toBeNull();
    expect(result!.command.id).toBe('export-session');
  });

  it('returns null for unknown command', () => {
    expect(parseSlashCommand('/xyzzy', cmds)).toBeNull();
  });

  it('returns null for empty slash', () => {
    expect(parseSlashCommand('/', cmds)).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parseSlashCommand('hello world', cmds)).toBeNull();
  });

  it('handles colon separator syntax', () => {
    const result = parseSlashCommand('/model: claude-3', cmds);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe('model');
    expect(result!.args).toBe('claude-3');
  });
});
