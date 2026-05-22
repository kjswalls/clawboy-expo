import { stripConversationMetadata } from '../utils';

describe('stripConversationMetadata', () => {
  it('preserves [clawboy-answers] link-ref directive at start of message', () => {
    const raw =
      '[clawboy-answers]: <data:application/json;base64,eyJfc2luZ2xlIjoiSnVzdCB0ZXN0aW5nIn0=>\n\n1. Question 1: Just testing';
    expect(stripConversationMetadata(raw)).toBe(raw);
  });

  it('preserves [clawboy-options] link-ref directive at start of message', () => {
    const raw =
      '[clawboy-options]: <data:application/json,{"single":{"prompt":"Q","choices":[]}}>\n\nQ';
    expect(stripConversationMetadata(raw)).toBe(raw);
  });

  it('still strips a real envelope prefix', () => {
    const raw = '[#general kirby 2026-05-22 12:59 PST] hello world';
    expect(stripConversationMetadata(raw)).toBe('hello world');
  });
});
