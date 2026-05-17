import { describe, it, expect } from '@jest/globals';

import { computeBottomSpacer, computeTopSpacer } from '../computeBottomSpacer';

describe('computeBottomSpacer', () => {
  it('returns 0 when anchor space is not needed', () => {
    expect(computeBottomSpacer({ needsAnchorSpace: false, layoutH: 800 })).toBe(0);
  });

  it('returns 0 when layoutH is unmeasured', () => {
    expect(computeBottomSpacer({ needsAnchorSpace: true, layoutH: 0 })).toBe(0);
  });

  it('holds a full viewport when anchor space is needed', () => {
    expect(computeBottomSpacer({ needsAnchorSpace: true, layoutH: 800 })).toBe(800);
  });

  it('returns layoutH regardless of how much content is already on screen', () => {
    // Long conversation: even when prior history far exceeds the viewport,
    // the spacer must still reserve viewport-tall tail room so a freshly
    // sent user message can anchor at the top via scrollToIndex(viewPosition: 0).
    expect(computeBottomSpacer({ needsAnchorSpace: true, layoutH: 800 })).toBe(800);
  });
});

describe('computeTopSpacer', () => {
  it('returns 0 when layoutH is unmeasured', () => {
    expect(computeTopSpacer({ layoutH: 0, intrinsicContentH: 100 })).toBe(0);
  });

  it('returns 0 when intrinsicContentH is unmeasured', () => {
    expect(computeTopSpacer({ layoutH: 800, intrinsicContentH: 0 })).toBe(0);
  });

  it('returns remaining space when intrinsic content is shorter than viewport', () => {
    expect(computeTopSpacer({ layoutH: 800, intrinsicContentH: 300 })).toBe(500);
  });

  it('returns 0 when intrinsic content fills the viewport exactly', () => {
    expect(computeTopSpacer({ layoutH: 800, intrinsicContentH: 800 })).toBe(0);
  });

  it('returns 0 when intrinsic content exceeds the viewport', () => {
    expect(computeTopSpacer({ layoutH: 800, intrinsicContentH: 1200 })).toBe(0);
  });

  it('is a fixed point — re-applying with header-subtracted contentH yields same value', () => {
    // Simulate: intrinsicH=156, layoutH=800.
    // First call produces headerH=644.
    const layoutH = 800;
    const intrinsicH = 156;
    const headerH = computeTopSpacer({ layoutH, intrinsicContentH: intrinsicH });
    expect(headerH).toBe(644);
    // After re-render: rawContentH = intrinsicH + headerH = 800. Subtract headerH → intrinsicH again.
    const nextHeaderH = computeTopSpacer({ layoutH, intrinsicContentH: 800 - headerH });
    expect(nextHeaderH).toBe(headerH);
  });
});
