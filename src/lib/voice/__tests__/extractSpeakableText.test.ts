import { extractSpeakableText } from '../extractSpeakableText';

describe('extractSpeakableText', () => {
  it('returns empty string for empty input', () => {
    expect(extractSpeakableText('')).toBe('');
  });

  it('passes through plain prose unchanged', () => {
    const text = 'Hello, how can I help you today?';
    expect(extractSpeakableText(text)).toBe(text);
  });

  // ── MEDIA: lines ────────────────────────────────────────────────────────────

  it('strips MEDIA: lines', () => {
    const text = 'Here is your audio.\nMEDIA: /tmp/reply.mp3\nEnjoy!';
    expect(extractSpeakableText(text)).toBe('Here is your audio.\nEnjoy!');
  });

  it('strips MEDIA: lines with backtick-wrapped paths', () => {
    const text = 'Done.\nMEDIA: `/tmp/tts-output.wav`\nNext step.';
    expect(extractSpeakableText(text)).toBe('Done.\nNext step.');
  });

  // ── Fenced code blocks ──────────────────────────────────────────────────────

  it('removes fenced code blocks', () => {
    const text = 'Here is the code:\n```js\nconsole.log("hi");\n```\nDone.';
    expect(extractSpeakableText(text)).toBe('Here is the code:\nDone.');
  });

  it('removes tilde-fenced code blocks', () => {
    const text = 'Example:\n~~~python\nprint("hi")\n~~~\nEnd.';
    expect(extractSpeakableText(text)).toBe('Example:\nEnd.');
  });

  // ── Inline code ─────────────────────────────────────────────────────────────

  it('removes inline code backtick spans', () => {
    expect(extractSpeakableText('Run `npm install` first.')).toBe(
      'Run  first.',
    );
  });

  // ── Markdown links ──────────────────────────────────────────────────────────

  it('converts markdown links to label only', () => {
    expect(extractSpeakableText('[OpenAI](https://openai.com)')).toBe('OpenAI');
  });

  it('converts multiple links', () => {
    const text = 'See [docs](https://docs.example.com) and [guide](https://guide.example.com).';
    expect(extractSpeakableText(text)).toBe('See docs and guide.');
  });

  // ── Bare URLs ───────────────────────────────────────────────────────────────

  it('strips bare https URLs', () => {
    expect(extractSpeakableText('Visit https://example.com for more.')).toBe(
      'Visit  for more.',
    );
  });

  it('strips bare http URLs', () => {
    expect(extractSpeakableText('Try http://localhost:3000')).toBe('Try');
  });

  // ── Headings ────────────────────────────────────────────────────────────────

  it('strips heading hashes but keeps heading text', () => {
    expect(extractSpeakableText('## Installation')).toBe('Installation');
    expect(extractSpeakableText('# Title\nSome prose.')).toBe('Title\nSome prose.');
  });

  // ── Horizontal rules ─────────────────────────────────────────────────────────

  it('removes horizontal rules', () => {
    const text = 'Before\n---\nAfter';
    expect(extractSpeakableText(text)).toBe('Before\nAfter');
  });

  it('removes triple-asterisk rules', () => {
    const text = 'A\n***\nB';
    expect(extractSpeakableText(text)).toBe('A\nB');
  });

  // ── Bold / italic ─────────────────────────────────────────────────────────────

  it('removes bold markers', () => {
    expect(extractSpeakableText('This is **important**.')).toBe('This is important.');
  });

  it('removes italic markers', () => {
    expect(extractSpeakableText('This is *emphasized*.')).toBe('This is emphasized.');
  });

  it('removes underscore italic markers', () => {
    expect(extractSpeakableText('This is _italic_.')).toBe('This is italic.');
  });

  // ── List bullets ─────────────────────────────────────────────────────────────

  it('removes unordered list dashes', () => {
    const text = '- First\n- Second\n- Third';
    expect(extractSpeakableText(text)).toBe('First\nSecond\nThird');
  });

  it('removes unordered list asterisks', () => {
    const text = '* Alpha\n* Beta';
    expect(extractSpeakableText(text)).toBe('Alpha\nBeta');
  });

  it('removes ordered list numbers', () => {
    const text = '1. Step one\n2. Step two\n3. Step three';
    expect(extractSpeakableText(text)).toBe('Step one\nStep two\nStep three');
  });

  // ── Blockquotes ──────────────────────────────────────────────────────────────

  it('removes blockquote markers', () => {
    expect(extractSpeakableText('> This is a quote.')).toBe('This is a quote.');
  });

  // ── HTML tags ────────────────────────────────────────────────────────────────

  it('strips HTML tags', () => {
    expect(extractSpeakableText('Hello <b>world</b>')).toBe('Hello world');
  });

  // ── Blank-line collapsing ─────────────────────────────────────────────────────

  it('collapses multiple blank lines to one', () => {
    const text = 'Para one.\n\n\n\nPara two.';
    expect(extractSpeakableText(text)).toBe('Para one.\n\nPara two.');
  });

  // ── Whitespace trimming ───────────────────────────────────────────────────────

  it('trims leading/trailing whitespace', () => {
    expect(extractSpeakableText('  Hello  ')).toBe('Hello');
  });

  // ── Combined ─────────────────────────────────────────────────────────────────

  it('handles a realistic mixed-content message', () => {
    const input = [
      '## Summary',
      '',
      'Here is the **answer** to your question.',
      '',
      '```python',
      'print("hello")',
      '```',
      '',
      'Check [the docs](https://docs.example.com) for more.',
      'MEDIA: /tmp/tts.mp3',
    ].join('\n');

    const result = extractSpeakableText(input);
    expect(result).toContain('Summary');
    expect(result).toContain('Here is the answer to your question.');
    expect(result).not.toContain('```');
    expect(result).not.toContain('print');
    expect(result).toContain('Check the docs for more.');
    expect(result).not.toContain('MEDIA:');
    expect(result).not.toContain('https://');
  });
});
