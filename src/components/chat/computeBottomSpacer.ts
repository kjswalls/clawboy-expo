/**
 * Pure helper that decides how tall the synthetic bottom spacer should be.
 *
 * The spacer exists so a freshly-sent user message can scroll to the top of
 * the viewport (ChatGPT-style anchor) via `scrollToIndex({ viewPosition: 0 })`
 * regardless of how short the assistant reply is or how long the conversation
 * history is. Without a viewport-tall tail, the list's max scroll offset
 * (`contentH - layoutH`) leaves the user message at the bottom of the
 * viewport, not the top.
 *
 * Sizing rule:
 *  - Off whenever the caller reports no anchor space is needed.
 *  - Off when the viewport height is unmeasured.
 *  - Otherwise hold a full viewport's worth (`layoutH`) so the user message
 *    can land at top.
 *
 * The caller (MessageList) owns the `needsAnchorSpace` policy: true while the
 * tail of the visible list is a user message awaiting a reply, or while an
 * assistant turn is actively streaming. The spacer collapses to 0 once the
 * assistant message lands and finishes streaming.
 */
export interface ComputeBottomSpacerInput {
  /** True while the tail of the list needs viewport-tall room below it so the
   *  last user message can anchor at top via scrollToIndex(viewPosition: 0). */
  needsAnchorSpace: boolean;
  /** Current FlashList/FlatList viewport height. */
  layoutH: number;
}

export function computeBottomSpacer(input: ComputeBottomSpacerInput): number {
  const { needsAnchorSpace, layoutH } = input;
  if (!needsAnchorSpace) return 0;
  if (layoutH <= 0) return 0;
  return layoutH;
}

/**
 * Pure helper that decides how tall the synthetic top spacer (ListHeaderComponent)
 * should be so that short content (e.g. a freshly-reset session with a single
 * info marker) sits at the viewport bottom instead of the top.
 *
 * The caller must pass `intrinsicContentH` — the scroll content height with the
 * current header height already subtracted — so this function never reads the
 * header-inflated total and causes a feedback loop.
 *
 * Returns 0 once intrinsic content fills or exceeds the viewport.
 */
export interface ComputeTopSpacerInput {
  /** Current FlashList/FlatList viewport height. */
  layoutH: number;
  /**
   * Scroll content height minus the currently-rendered ListHeaderComponent
   * height (i.e. items + contentContainerStyle padding only).
   * Caller computes: Math.max(0, rawContentH - currentHeaderH).
   */
  intrinsicContentH: number;
}

export function computeTopSpacer(input: ComputeTopSpacerInput): number {
  const { layoutH, intrinsicContentH } = input;
  if (layoutH <= 0) return 0;
  if (intrinsicContentH <= 0) return 0;
  return Math.max(0, layoutH - intrinsicContentH);
}
