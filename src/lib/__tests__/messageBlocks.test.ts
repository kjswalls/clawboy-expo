import { splitMessageIntoBlocks } from '../messageBlocks';

describe('splitMessageIntoBlocks', () => {
  // -------------------------------------------------------------------------
  // Basic edge cases
  // -------------------------------------------------------------------------

  it('returns empty array for empty content', () => {
    expect(splitMessageIntoBlocks('')).toEqual([]);
    expect(splitMessageIntoBlocks('   \n  ')).toEqual([]);
  });

  it('returns a single section for a single paragraph', () => {
    const blocks = splitMessageIntoBlocks('Hello world');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('prose');
    expect(blocks[0].index).toBe(0);
    expect(blocks[0].raw).toBe('Hello world');
    expect(blocks[0].componentTypes).toContain('paragraph');
  });

  it('assigns sequential indices', () => {
    const content = '# A\n\npara\n\n# B\n\npara two';
    const blocks = splitMessageIntoBlocks(content);
    blocks.forEach((b, i) => {
      expect(b.index).toBe(i);
    });
  });

  // -------------------------------------------------------------------------
  // Grouping: single-blank-line paragraphs merge
  // -------------------------------------------------------------------------

  it('merges two paragraphs separated by one blank line', () => {
    const content = 'First paragraph\n\nSecond paragraph';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('prose');
    expect(blocks[0].raw).toContain('First paragraph');
    expect(blocks[0].raw).toContain('Second paragraph');
  });

  it('merges multiple consecutive paragraphs into one section', () => {
    const content = 'Para one.\n\nPara two.\n\nPara three.';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].raw).toContain('Para one.');
    expect(blocks[0].raw).toContain('Para three.');
  });

  // -------------------------------------------------------------------------
  // Splitting: double-blank-line gap (no-heading fallback)
  // -------------------------------------------------------------------------

  it('splits on double blank line (>= 2 blank lines between blocks) — no headings', () => {
    const content = 'First block\n\n\nSecond block';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].raw.trim()).toContain('First block');
    expect(blocks[1].raw.trim()).toContain('Second block');
  });

  // -------------------------------------------------------------------------
  // Heading-primary mode: headings are the ONLY split boundary
  // -------------------------------------------------------------------------

  it('heading + following paragraph → 1 section, type heading', () => {
    const content = '# Title\n\nSome paragraph';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].headingText).toBe('Title');
    expect(blocks[0].raw).toContain('Title');
    expect(blocks[0].raw).toContain('Some paragraph');
  });

  it('two headings each with content → 2 sections', () => {
    const content = '# A\n\npara1\n\n# B\n\npara2';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].headingText).toBe('A');
    expect(blocks[1].type).toBe('heading');
    expect(blocks[1].headingText).toBe('B');
  });

  it('heading + paragraph + list + code in one section (heading-primary: no fence split)', () => {
    const content = [
      '# My Section',
      '',
      'Intro paragraph.',
      '',
      '- item 1',
      '- item 2',
      '',
      '```js',
      'console.log("hi")',
      '```',
    ].join('\n');
    const blocks = splitMessageIntoBlocks(content);
    // Heading-primary: fence does NOT split within a heading section
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].headingText).toBe('My Section');
    expect(blocks[0].componentTypes).toContain('heading');
    expect(blocks[0].componentTypes).toContain('list');
    expect(blocks[0].componentTypes).toContain('fence');
  });

  it('pre-heading content + heading → 2 sections (pre-heading content is section 0)', () => {
    const content = 'Intro before any heading.\n\n# Section One\n\nBody text.';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('prose');
    expect(blocks[0].raw).toContain('Intro before any heading.');
    expect(blocks[1].type).toBe('heading');
    expect(blocks[1].headingText).toBe('Section One');
    expect(blocks[1].raw).toContain('Body text.');
  });

  it('three headings → 3 sections regardless of fences and hrs', () => {
    const content = [
      '# Alpha',
      '',
      '```js',
      'code here',
      '```',
      '',
      '---',
      '',
      'Prose after hr.',
      '',
      '# Beta',
      '',
      'More text.',
      '',
      '# Gamma',
      '',
      'Last section.',
    ].join('\n');
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].headingText).toBe('Alpha');
    expect(blocks[1].headingText).toBe('Beta');
    expect(blocks[2].headingText).toBe('Gamma');
    // Fence + hr within Alpha section do NOT split it
    expect(blocks[0].componentTypes).toContain('fence');
    expect(blocks[0].raw).toContain('Prose after hr.');
  });

  it('heading-primary: fence followed by prose stays in same section', () => {
    const content = [
      '# My Heading',
      '',
      '```js',
      'x = 1',
      '```',
      '',
      'Prose after fence under same heading.',
    ].join('\n');
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].raw).toContain('Prose after fence under same heading.');
  });

  // -------------------------------------------------------------------------
  // Horizontal rules split sections, are not their own section
  // -------------------------------------------------------------------------

  it('hr splits into two sections without producing a section for hr itself', () => {
    const content = 'Before\n\n---\n\nAfter';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => !b.componentTypes.includes('hr'))).toBe(true);
    expect(blocks[0].raw.trim()).toContain('Before');
    expect(blocks[1].raw.trim()).toContain('After');
  });

  // -------------------------------------------------------------------------
  // Fence grouping: leading prose absorbed, fence closes section
  // -------------------------------------------------------------------------

  it('paragraph then fence → 1 section of type code', () => {
    const content = 'Here is the code:\n\n```js\nconsole.log("hi")\n```';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
    expect(blocks[0].componentTypes).toContain('paragraph');
    expect(blocks[0].componentTypes).toContain('fence');
  });

  it('fence followed by prose → 2 sections (fence closes its section)', () => {
    const content = '```js\nx = 1\n```\n\nNew paragraph after code';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('code');
    expect(blocks[1].type).toBe('prose');
  });

  it('standalone fence with no surrounding prose → 1 section of type code', () => {
    const content = '```python\nx = 1\n```';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
  });

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  it('identifies bullet lists and keeps list type in componentTypes', () => {
    const content = '- item one\n- item two\n- item three';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].componentTypes).toContain('list');
    expect(blocks[0].raw).toContain('item one');
  });

  // -------------------------------------------------------------------------
  // Blockquotes
  // -------------------------------------------------------------------------

  it('identifies blockquotes', () => {
    const content = '> This is quoted\n> content here';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].componentTypes).toContain('blockquote');
  });

  // -------------------------------------------------------------------------
  // Preview / source offsets
  // -------------------------------------------------------------------------

  it('generates short preview for long blocks', () => {
    const longText = 'word '.repeat(100);
    const blocks = splitMessageIntoBlocks(longText.trim());
    expect(blocks[0].preview.length).toBeLessThanOrEqual(121); // 120 + ellipsis char
  });

  it('sourceStart/sourceEnd are valid char offsets and raw is recoverable', () => {
    const content = 'Hello world\n\nSecond block';
    const blocks = splitMessageIntoBlocks(content);
    for (const block of blocks) {
      expect(block.sourceStart).toBeGreaterThanOrEqual(0);
      expect(block.sourceEnd).toBeLessThanOrEqual(content.length);
      expect(block.sourceStart).toBeLessThan(block.sourceEnd);
      expect(content.slice(block.sourceStart, block.sourceEnd)).toContain(block.raw.trim());
    }
  });

  // -------------------------------------------------------------------------
  // componentTypes deduplication
  // -------------------------------------------------------------------------

  it('componentTypes has no duplicates', () => {
    const content = 'Para one\n\nPara two\n\nPara three';
    const blocks = splitMessageIntoBlocks(content);
    const ct = blocks[0].componentTypes;
    expect(ct).toEqual([...new Set(ct)]);
  });

  // -------------------------------------------------------------------------
  // Complex mixed content
  // -------------------------------------------------------------------------

  it('handles heading + paragraphs + code + list — heading-primary keeps all in one section', () => {
    const content = [
      '# My Heading',
      '',
      'First paragraph here.',
      '',
      '```python',
      'x = 1 + 2',
      '```',
      '',
      '- list item',
      '- another item',
    ].join('\n');
    const blocks = splitMessageIntoBlocks(content);
    // Heading-primary: all tokens belong to the single heading section.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].headingText).toBe('My Heading');
    expect(blocks[0].componentTypes).toContain('fence');
    expect(blocks[0].componentTypes).toContain('list');
  });

  it('multiple sections with hr separators', () => {
    const content = 'Section A\n\n---\n\nSection B\n\n---\n\nSection C';
    const blocks = splitMessageIntoBlocks(content);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].raw.trim()).toBe('Section A');
    expect(blocks[1].raw.trim()).toBe('Section B');
    expect(blocks[2].raw.trim()).toBe('Section C');
  });
});
