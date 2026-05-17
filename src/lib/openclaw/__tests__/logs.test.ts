import { describe, it, expect } from '@jest/globals';
import { extractLoggingFile } from '../logs';

describe('extractLoggingFile', () => {
  it('returns the trimmed string when logging.file is set', () => {
    expect(extractLoggingFile({ logging: { file: '/var/log/openclaw.log' } }))
      .toBe('/var/log/openclaw.log');
  });

  it('trims surrounding whitespace', () => {
    expect(extractLoggingFile({ logging: { file: '  /tmp/openclaw/x.log  ' } }))
      .toBe('/tmp/openclaw/x.log');
  });

  it('returns null when logging.file is an empty/whitespace string', () => {
    expect(extractLoggingFile({ logging: { file: '' } })).toBeNull();
    expect(extractLoggingFile({ logging: { file: '   ' } })).toBeNull();
  });

  it('returns null when logging.file is missing', () => {
    expect(extractLoggingFile({ logging: { level: 'info' } })).toBeNull();
  });

  it('returns null when logging key is missing', () => {
    expect(extractLoggingFile({ unrelated: true })).toBeNull();
  });

  it('returns null when logging is non-object', () => {
    expect(extractLoggingFile({ logging: 'oops' })).toBeNull();
    expect(extractLoggingFile({ logging: null })).toBeNull();
  });

  it('returns null when file is non-string', () => {
    expect(extractLoggingFile({ logging: { file: 42 } })).toBeNull();
    expect(extractLoggingFile({ logging: { file: null } })).toBeNull();
    expect(extractLoggingFile({ logging: { file: ['/tmp/x.log'] } })).toBeNull();
  });

  it('returns null for null / undefined / non-object config', () => {
    expect(extractLoggingFile(null)).toBeNull();
    expect(extractLoggingFile(undefined)).toBeNull();
    expect(extractLoggingFile('string')).toBeNull();
    expect(extractLoggingFile(123)).toBeNull();
  });
});
