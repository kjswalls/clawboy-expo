/**
 * Strips markdown and protocol artifacts from an assistant message, producing
 * plain text suitable for `Speech.speak` (expo-speech).
 *
 * Handles:
 *   - MEDIA: token lines emitted by TTS / image-gen tools
 *   - Fenced code blocks  (``` ... ```)
 *   - Inline code  (`...`)
 *   - Markdown headings  (# / ## / ###)
 *   - Unordered list bullets  (- / * / •)
 *   - Ordered list numbers  (1. 2.)
 *   - Markdown links  [label](url) → label
 *   - Bare URLs  (https?://...)
 *   - Blockquote markers  (> ...)
 *   - Bold / italic markers  (* ** _ __)
 *   - Horizontal rules  (--- / ***)
 *   - HTML tags
 */
export function extractSpeakableText(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // Remove MEDIA: lines (gateway media token — not speakable).
  // Consume the surrounding newline so the line vanishes cleanly.
  text = text.replace(/\n?^MEDIA:\s*`?[^\n`]+`?\s*$/gim, '');

  // Remove fenced code blocks entirely — reading code aloud is noise.
  // Consume leading/trailing newlines so the surrounding paragraphs join cleanly.
  text = text.replace(/\n?```[\s\S]*?```\n?/g, '\n');
  text = text.replace(/\n?~~~[\s\S]*?~~~\n?/g, '\n');

  // Remove horizontal rules — consume the whole line + newline.
  text = text.replace(/\n?^[-*_]{3,}\s*$\n?/gm, '\n');

  // Remove inline code
  text = text.replace(/`[^`]*`/g, '');

  // Convert markdown links to their label text: [label](url) → label
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Remove bare URLs
  text = text.replace(/https?:\/\/\S+/g, '');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Remove heading hashes — keep the heading text
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove blockquote markers
  text = text.replace(/^>\s?/gm, '');

  // Remove unordered list bullets (must be before bold/italic marker removal)
  text = text.replace(/^[-•]\s+/gm, '');
  // Asterisk bullet: only when it's at the start of a line followed by a space
  text = text.replace(/^\*\s+/gm, '');

  // Remove ordered list numbers
  text = text.replace(/^\d+\.\s+/gm, '');

  // Remove bold / italic markers
  text = text.replace(/\*{1,3}|_{1,3}/g, '');

  // Collapse multiple blank lines to a single blank
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
