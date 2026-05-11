# ClawBoy app icon variants

Six 1024x1024 SVG options. Each uses the same `BrandLogo` monogram (already in a 1024 viewBox) layered over a premium gradient background recipe:

- **base gradient** -- diagonal `linearGradient` top-left to bottom-right
- **radial shine** -- white radial at ~(300, 280), mimics Apple's lit-from-above-left
- **corner vignette** -- dark radial at ~(820, 880) for depth
- **embossed glyph** -- 3 paths at white 95% + `feGaussianBlur` drop shadow
- **hairline bevel** -- 1px inner stroke at 6% white, reads under iOS squircle clip

| File | Background | Glyph size | Character |
| --- | --- | --- | --- |
| `icon-purple.svg` | `#C084FC` to `#4F46E5` gradient | ~38% canvas | Default accent; matches `dark`/`cygnus` theme |
| `icon-tower.svg` | `#60B4F8` to `#1A3A8A` gradient | ~38% canvas | ClawBoy brand blue (`tower` palette) |
| `icon-purple-pink.svg` | `#B06AE8` to `#F0A2B0` gradient | ~38% canvas | Warmer, boutique -- purple + tower pink |
| `icon-dark.svg` | `#1A1A2E` to `#080B12` gradient | ~62% canvas (1.54x) | **Current app icon.** Most restrained; faint purple shine |
| `icon-dark-transparent.svg` | Transparent (no base/shine/vignette/bevel) | ~62% canvas (1.54x) | Foreground-only variant of icon-dark -- used for `adaptive-icon.png` and `splash-icon.png` |
| `icon-light.svg` | `#FFFFFF` to `#F7F9FF` gradient + faint brand-loader color grid | ~62% canvas (1.54x) | Light variant with black glyph + soft depth, matched to About palette |
| `icon-light-transparent.svg` | Transparent (no base/grid/shine/vignette/bevel) | ~62% canvas (1.54x) | Foreground-only variant of icon-light -- for white splash/adaptive backgrounds |
| `icon-purple-large.svg` | `#C084FC` to `#4F46E5` gradient | ~62% canvas (1.54x) | Purple winner with larger glyph; 3D depth treatment |
| `icon-grid.svg` | `#0A0E16` base + BrandLoader 3x3 rainbow grid | ~62% canvas (1.54x) | NW+S+SE constellation lit; 3D shine/vignette/glyphFill/depth from icon-purple-large |
| `icon-grid-transparent.svg` | Transparent (no base/shine/vignette/bevel) | ~62% canvas (1.54x) | Foreground-only variant of icon-grid -- used for `adaptive-icon.png` and `splash-icon.png` |

## Picking a winner

Open each SVG in a browser (drag into a tab) or Figma. iOS will apply the squircle clip automatically — you can simulate it by viewing at ~180×180px.

## Exporting to PNG

### Option A — Figma / Sketch

1. Open the chosen `.svg`
2. Export frame as PNG 1024×1024 (sRGB, no transparency)
3. Place at `assets/icon.png`

### Option B -- headless (no design tool)

```bash
# App icon (opaque)
npx @resvg/resvg-js-cli assets/brand/icon-options/icon-light.svg assets/icon.png --fit-width 1024

# Android adaptive icon + splash (transparent foreground)
npx @resvg/resvg-js-cli assets/brand/icon-options/icon-light-transparent.svg assets/adaptive-icon.png --fit-width 1024
npx @resvg/resvg-js-cli assets/brand/icon-options/icon-light-transparent.svg assets/splash-icon.png --fit-width 1024
```

### Android adaptive icon

`icon-light-transparent.svg` is the foreground-only source (no opaque background). The system background color `#FFFFFF` is provided by `app.json`. Export directly to `assets/adaptive-icon.png` using the command above.

## No code changes needed

`app.json` already points to `assets/icon.png` and `assets/adaptive-icon.png`. Dropping new PNGs there is all that's required for the next `eas build` or `expo prebuild`.
