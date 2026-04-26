import { coalesceMultiline, parseLogLine } from '../logParser'

// ── Plain-text format (regression) ────────────────────────────────────────────

describe('parseLogLine – plain text', () => {
  it('parses an info line with square-bracket tag', () => {
    const line = '2026-03-18T04:21:12.054Z info [tools] edit failed: some error'
    const result = parseLogLine(line, 0)
    expect(result.ts).toBe('2026-03-18T04:21:12.054Z')
    expect(result.level).toBe('info')
    expect(result.tag).toBe('[tools]')
    expect(result.msg).toBe('edit failed: some error')
    expect(result.id).toBe('log-0')
    expect(result.raw).toBe(line)
  })

  it('parses a warn line (normalises warning → warn)', () => {
    const line = '2026-03-18T10:00:00.000Z warning agents/tool-images Some warning text'
    const result = parseLogLine(line, 1)
    expect(result.level).toBe('warn')
    expect(result.tag).toBe('agents/tool-images')
    expect(result.msg).toBe('Some warning text')
  })

  it('parses an error line', () => {
    const line = '2026-03-18T15:26:37.358Z error [tools] browser failed: Error: Unknown ref'
    const result = parseLogLine(line, 2)
    expect(result.level).toBe('error')
    expect(result.tag).toBe('[tools]')
    expect(result.msg).toContain('browser failed')
  })

  it('parses a debug line', () => {
    const line = '2026-03-18T08:00:00.000Z debug internal/scheduler job dispatched'
    const result = parseLogLine(line, 3)
    expect(result.level).toBe('debug')
    expect(result.tag).toBe('internal/scheduler')
    expect(result.msg).toBe('job dispatched')
  })

  it('parses a line with no tag (level directly before message)', () => {
    const line = '2026-03-18T12:00:00.000Z info Simple message without tag'
    const result = parseLogLine(line, 4)
    expect(result.level).toBe('info')
    expect(result.raw).toBe(line)
    expect(result.ts).toBe('2026-03-18T12:00:00.000Z')
  })

  it('falls back to unknown level for lines without an ISO timestamp', () => {
    const line = 'this is a raw continuation line'
    const result = parseLogLine(line, 5)
    expect(result.level).toBe('unknown')
    expect(result.ts).toBeNull()
    expect(result.tag).toBeNull()
    expect(result.msg).toBe(line)
  })

  it('assigns unique ids using seq', () => {
    const line = '2026-01-01T00:00:00.000Z info msg'
    expect(parseLogLine(line, 10).id).toBe('log-10')
    expect(parseLogLine(line, 99).id).toBe('log-99')
  })

  it('trims trailing whitespace from raw', () => {
    const line = '2026-03-18T04:21:12.054Z info [tools] message   '
    const result = parseLogLine(line, 6)
    expect(result.raw).toBe('2026-03-18T04:21:12.054Z info [tools] message')
  })
})

// ── tslog JSON format ─────────────────────────────────────────────────────────

describe('parseLogLine – tslog JSON', () => {
  it('parses a WARN tslog record with JSON-encoded subsystem name', () => {
    // This is the exact shape seen in the gateway logs screenshots.
    const record = {
      '0': '{"subsystem":"cron"}',
      '1': "payload.model 'google/gemini-3-flash-preview' not allowed, falling back to agent defaults",
      _meta: {
        runtime: 'node',
        runtimeVersion: '25.8.1',
        hostname: 'unknown',
        name: '{"subsystem":"cron"}',
        parentNames: ['openclaw'],
        date: '2026-04-24T05:19:57.172Z',
        logLevelId: 4,
        logLevelName: 'WARN',
      },
    }
    const line = JSON.stringify(record)
    const result = parseLogLine(line, 0)

    expect(result.ts).toBe('2026-04-24T05:19:57.172Z')
    expect(result.level).toBe('warn')
    // subsystem descriptor in "0" is skipped; only "1" (the human message) is the msg
    expect(result.msg).toBe(
      "payload.model 'google/gemini-3-flash-preview' not allowed, falling back to agent defaults"
    )
    // tag = parentNames + subsystem
    expect(result.tag).toBe('openclaw/cron')
    expect(result.raw).toBe(line)
    expect(result.id).toBe('log-0')
  })

  it('parses a tslog record with plain (non-JSON) name', () => {
    const record = {
      '0': 'Server started on port 3000',
      _meta: {
        name: 'openclaw',
        parentNames: [],
        date: '2026-04-24T06:00:00.000Z',
        logLevelName: 'INFO',
      },
    }
    const result = parseLogLine(JSON.stringify(record), 1)
    expect(result.level).toBe('info')
    expect(result.tag).toBe('openclaw')
    expect(result.msg).toBe('Server started on port 3000')
  })

  it('parses a tslog record with nested parentNames', () => {
    const record = {
      '0': 'Some message',
      _meta: {
        name: 'http',
        parentNames: ['openclaw', 'server'],
        date: '2026-04-24T06:00:00.000Z',
        logLevelName: 'DEBUG',
      },
    }
    const result = parseLogLine(JSON.stringify(record), 2)
    expect(result.tag).toBe('openclaw/server/http')
    expect(result.level).toBe('debug')
  })

  it('normalises FATAL to error and TRACE to debug', () => {
    const makeRecord = (logLevelName: string) =>
      JSON.stringify({
        '0': 'test',
        _meta: { name: 'app', parentNames: [], date: '2026-01-01T00:00:00.000Z', logLevelName },
      })

    expect(parseLogLine(makeRecord('FATAL'), 0).level).toBe('error')
    expect(parseLogLine(makeRecord('TRACE'), 0).level).toBe('debug')
    expect(parseLogLine(makeRecord('SILLY'), 0).level).toBe('debug')
  })

  it('does not duplicate subsystem descriptor in msg', () => {
    // "0" is the subsystem descriptor — should be skipped in favour of "1" message.
    const record = {
      '0': '{"subsystem":"agents"}',
      '1': 'Agent tool call dispatched',
      _meta: {
        name: '{"subsystem":"agents"}',
        parentNames: ['openclaw'],
        date: '2026-04-24T07:00:00.000Z',
        logLevelName: 'INFO',
      },
    }
    const result = parseLogLine(JSON.stringify(record), 3)
    expect(result.msg).toBe('Agent tool call dispatched')
    expect(result.msg).not.toContain('subsystem')
  })

  it('falls back to unknown for JSON without _meta', () => {
    const line = '{"key":"value","other":123}'
    const result = parseLogLine(line, 4)
    expect(result.level).toBe('unknown')
    expect(result.raw).toBe(line)
  })

  it('falls back to plain-text parse for invalid JSON starting with {', () => {
    const line = '{not valid json'
    const result = parseLogLine(line, 5)
    expect(result.level).toBe('unknown')
    expect(result.msg).toBe('{not valid json')
  })
})

// ── coalesceMultiline ─────────────────────────────────────────────────────────

describe('coalesceMultiline', () => {
  it('returns a single-line array unchanged', () => {
    const lines = ['2026-01-01T00:00:00.000Z info normal line']
    expect(coalesceMultiline(lines)).toEqual(lines)
  })

  it('merges continuation lines into the preceding timestamped line', () => {
    const lines = [
      '2026-01-01T00:00:00.000Z error [tools] Something failed:',
      '  at Object.<anonymous> (/app/foo.ts:10:5)',
      '  at Module._compile (node:internal/modules/cjs/loader:1356:14)',
    ]
    const result = coalesceMultiline(lines)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Something failed')
    expect(result[0]).toContain('at Object.<anonymous>')
  })

  it('keeps multiple distinct timestamped lines separate', () => {
    const lines = [
      '2026-01-01T00:00:00.000Z info line one',
      '2026-01-01T00:00:01.000Z info line two',
      '2026-01-01T00:00:02.000Z info line three',
    ]
    expect(coalesceMultiline(lines)).toHaveLength(3)
  })

  it('merges JSON blob continuation lines', () => {
    const lines = [
      '2026-01-01T00:00:00.000Z info agents {"subsystem":"foo"} Image resized',
      '  {"key":"value"}',
    ]
    const result = coalesceMultiline(lines)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('{"key":"value"}')
  })

  it('handles empty array', () => {
    expect(coalesceMultiline([])).toEqual([])
  })

  it('handles first line having no timestamp', () => {
    const lines = ['no timestamp here', '  continuation']
    const result = coalesceMultiline(lines)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('no timestamp here\n  continuation')
  })

  it('keeps tslog JSON records as separate lines even without a timestamp prefix', () => {
    const jsonLine1 = JSON.stringify({
      '0': 'msg one',
      _meta: { name: 'a', parentNames: [], date: '2026-01-01T00:00:00.000Z', logLevelName: 'INFO' },
    })
    const jsonLine2 = JSON.stringify({
      '0': 'msg two',
      _meta: { name: 'a', parentNames: [], date: '2026-01-01T00:00:01.000Z', logLevelName: 'INFO' },
    })
    const result = coalesceMultiline([jsonLine1, jsonLine2])
    expect(result).toHaveLength(2)
  })
})
