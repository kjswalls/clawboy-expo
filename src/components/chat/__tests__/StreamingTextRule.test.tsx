/**
 * Tests that the custom `text` markdown rule used during streaming correctly
 * applies the library's `inheritedStyles` (paragraph fontSize, lineHeight, etc.)
 * so the streaming-tail text renders at the same size as finalized text.
 *
 * The rule is tested by inspecting the returned React element's props directly
 * (no render tree required) since the rule is a pure function that returns a
 * plain JSX element.
 */
import React from 'react'
import { describe, it, expect } from '@jest/globals'
import { Text } from 'react-native'

// Private-use sentinel — same value as in MessageBubble.tsx.
const CURSOR_SENTINEL = '\uE001'

// Minimal stub for StreamingCursor.
function StreamingCursorStub(): React.JSX.Element {
  return <Text>|</Text>
}

/**
 * Build the custom text rule the same way MessageBubble.tsx does it.
 * The rule accepts (node, _children, _parent, _styles, inheritedStyles).
 */
function makeTextRule(markdownTextStyle: object) {
  return function textRule(
    node: { key?: string; content?: string },
    _children: React.ReactNode,
    _parent: unknown,
    _styles: object,
    inheritedStyles: object = {},
  ): React.JSX.Element {
    const content = String(node.content ?? '')
    const idx = content.indexOf(CURSOR_SENTINEL)
    if (idx === -1) {
      return <Text key={node.key} style={[inheritedStyles, markdownTextStyle]}>{content}</Text>
    }
    return (
      <Text key={node.key} style={[inheritedStyles, markdownTextStyle]}>
        {content.slice(0, idx)}
        <StreamingCursorStub />
      </Text>
    )
  }
}

describe('streaming text rule — inheritedStyles', () => {
  const paragraphStyle = { fontSize: 16, lineHeight: 24 }
  const textStyle = { color: '#ffffff' }
  const rule = makeTextRule(textStyle)

  it('includes inheritedStyles in style array when no sentinel', () => {
    const el = rule(
      { key: 'k1', content: 'Hello' },
      null,
      null,
      {},
      paragraphStyle,
    )
    // The returned element is a <Text> — inspect its props.style array directly.
    const styleArray = (el as React.ReactElement<{ style: object[] }>).props.style
    expect(Array.isArray(styleArray)).toBe(true)
    // inheritedStyles is the first element, markdownTextStyle is second.
    expect(styleArray[0]).toEqual(paragraphStyle)
    expect(styleArray[1]).toEqual(textStyle)
    // Flattened, the final style contains both fontSize and color.
    const flat = Object.assign({}, ...styleArray)
    expect(flat).toMatchObject({ fontSize: 16, lineHeight: 24, color: '#ffffff' })
  })

  it('includes inheritedStyles in style array when sentinel is present', () => {
    const el = rule(
      { key: 'k2', content: 'Hello' + CURSOR_SENTINEL },
      null,
      null,
      {},
      paragraphStyle,
    )
    const styleArray = (el as React.ReactElement<{ style: object[] }>).props.style
    expect(Array.isArray(styleArray)).toBe(true)
    expect(styleArray[0]).toEqual(paragraphStyle)
    const flat = Object.assign({}, ...styleArray)
    expect(flat).toMatchObject({ fontSize: 16, lineHeight: 24 })
  })

  it('markdownStyles.text color wins over inheritedStyles color (later in array)', () => {
    const el = rule(
      { key: 'k3', content: 'Test' },
      null,
      null,
      {},
      { fontSize: 16, color: '#000000' }, // inheritedStyles — earlier in array
    )
    const styleArray = (el as React.ReactElement<{ style: object[] }>).props.style
    // markdownTextStyle ({ color: '#ffffff' }) is the last entry, so its color wins.
    const flat = Object.assign({}, ...styleArray)
    expect(flat.color).toBe('#ffffff')
  })

  it('falls back gracefully when inheritedStyles is omitted (empty default)', () => {
    // Simulates a library version that does not pass the 5th argument.
    const el = rule({ key: 'k4', content: 'Fallback' }, null, null, {})
    const styleArray = (el as React.ReactElement<{ style: object[] }>).props.style
    expect(Array.isArray(styleArray)).toBe(true)
    // First element should be the empty default {}, second is markdownTextStyle.
    expect(styleArray[0]).toEqual({})
    expect(styleArray[1]).toEqual(textStyle)
  })
})
