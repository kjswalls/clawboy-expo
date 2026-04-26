#!/usr/bin/env node
/**
 * generate-vscode-themes.mjs
 *
 * Downloads VS Code theme files (from Marketplace VSIX or GitHub raw URLs),
 * extracts their colour maps, and emits src/constants/themes/generated.ts
 * with fully-typed palette objects matching our ThemeColors schema.
 *
 * Usage:
 *   node scripts/generate-vscode-themes.mjs
 *   npm run sync-vscode-themes
 */

import { createRequire } from 'node:module';
import { resolve, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { parse: parseJsonc } = require('jsonc-parser');

import { THEMES } from './themes.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchBuffer(url) {
  console.log(`  ↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── JSONC parse helper ────────────────────────────────────────────────────────

function parseThemeJsonc(text) {
  const errors = [];
  const result = parseJsonc(text, errors, { allowTrailingComma: true, allowEmptyContent: true });
  if (errors.length > 0) {
    console.warn(`    ⚠ JSONC parse errors (${errors.length}) — continuing with partial result`);
  }
  return result ?? {};
}

// ── Colour utilities ──────────────────────────────────────────────────────────

/** Strip alpha from an 8-digit hex (#RRGGBBAA → #RRGGBB). */
function stripAlpha(hex) {
  if (!hex) return hex;
  if (hex.startsWith('#') && hex.length === 9) return hex.slice(0, 7);
  return hex;
}

/** Convert relative luminance component. */
function linearise(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance [0, 1]. */
function luminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** Pick white or black text for best contrast against a background hex. */
function contrastForeground(bgHex) {
  try {
    const lum = luminance(bgHex.slice(0, 7));
    return lum > 0.179 ? '#000000' : '#FFFFFF';
  } catch {
    return '#FFFFFF';
  }
}

/** Blend two hex colours by a given weight (0=a, 1=b). Returns hex. */
function blendHex(hexA, hexB, t = 0.5) {
  const parse = (h) => {
    const c = h.replace('#', '').slice(0, 6);
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// ── VS Code theme resolution ──────────────────────────────────────────────────

/**
 * Resolve a VS Code theme JSON from a VSIX buffer.
 * Locates the correct theme variant by matching `themeName` in the package.json
 * contributes.themes, then resolves `include` chains recursively.
 */
function resolveThemeFromVsix(zipBuffer, themeName) {
  const zip = new AdmZip(zipBuffer);

  // Parse extension/package.json to find the theme file path.
  const pkgEntry = zip.getEntry('extension/package.json');
  if (!pkgEntry) throw new Error('VSIX missing extension/package.json');
  const pkg = JSON.parse(pkgEntry.getData().toString('utf8'));

  const contributes = pkg.contributes?.themes ?? [];
  let themeRelPath;

  if (themeName) {
    const match = contributes.find(
      (t) =>
        t.label === themeName ||
        t.uiTheme === themeName ||
        (typeof t.label === 'string' && t.label.toLowerCase().includes(themeName.toLowerCase()))
    );
    themeRelPath = match?.path;
  }

  // Fallback: first dark/light theme.
  if (!themeRelPath) {
    themeRelPath = contributes[0]?.path;
  }

  if (!themeRelPath) throw new Error(`No theme path found in VSIX for "${themeName}"`);

  // Normalise path: strip leading './' and ensure it's under extension/.
  const normalised = themeRelPath.replace(/^\.\//, '');
  const entryPath = normalised.startsWith('extension/') ? normalised : `extension/${normalised}`;

  return resolveThemeEntry(zip, entryPath);
}

/**
 * Recursively resolve include chains in a theme JSON.
 * Returns merged { colors, tokenColors } with included base applied first.
 */
function resolveThemeEntry(zip, entryPath) {
  const entry = zip.getEntry(entryPath);
  if (!entry) throw new Error(`Theme entry not found in VSIX: ${entryPath}`);

  const raw = parseThemeJsonc(entry.getData().toString('utf8'));

  let base = { colors: {}, tokenColors: [] };

  if (raw.include) {
    const dir = posix.dirname(entryPath);
    const includePath = posix.join(dir, raw.include);
    try {
      base = resolveThemeEntry(zip, includePath);
    } catch (e) {
      console.warn(`    ⚠ Could not resolve include "${raw.include}": ${e.message}`);
    }
  }

  return {
    colors: { ...base.colors, ...(raw.colors ?? {}) },
    tokenColors: [...(base.tokenColors ?? []), ...(raw.tokenColors ?? [])],
  };
}

// ── Source fetching ───────────────────────────────────────────────────────────

const MARKETPLACE_BASE =
  'https://marketplace.visualstudio.com/_apis/public/gallery/publishers';

async function fetchMarketplaceTheme(publisher, extension, themeName) {
  const url = `${MARKETPLACE_BASE}/${publisher}/vsextensions/${extension}/latest/vspackage`;
  const buf = await fetchBuffer(url);
  return resolveThemeFromVsix(buf, themeName);
}

async function fetchGithubTheme(rawUrl) {
  const buf = await fetchBuffer(rawUrl);
  return parseThemeJsonc(buf.toString('utf8'));
}

// ── Palette mapping ───────────────────────────────────────────────────────────

/**
 * Look up a chain of VS Code colour keys, returning the first non-empty value
 * after stripping 8-digit alpha.
 */
function pick(colors, ...keys) {
  for (const key of keys) {
    const v = colors[key];
    if (v && typeof v === 'string' && v.startsWith('#')) {
      return stripAlpha(v);
    }
  }
  return null;
}

/**
 * Map a resolved VS Code theme colours object to our ThemeColors schema.
 */
function mapToThemeColors(colors, mode) {
  const bg = pick(colors, 'editor.background') ?? (mode === 'dark' ? '#1e1e1e' : '#ffffff');
  const fg = pick(colors, 'editor.foreground') ?? (mode === 'dark' ? '#d4d4d4' : '#1f1f1f');

  const card = pick(colors, 'editorWidget.background', 'panel.background', 'editor.background') ?? bg;
  const secondary = pick(colors, 'panel.background', 'sideBar.background', 'editorGroupHeader.tabsBackground') ?? blendHex(bg, fg, 0.08);
  const muted = secondary;

  const mutedFg =
    pick(colors, 'descriptionForeground', 'tab.inactiveForeground', 'editorLineNumber.foreground') ??
    blendHex(fg, bg, 0.45);

  const border =
    pick(colors, 'panel.border', 'editorWidget.border', 'editorGroup.border', 'contrastBorder', 'widget.border') ??
    blendHex(bg, fg, 0.15);

  const inputBg = pick(colors, 'input.background', 'editorWidget.background') ?? secondary;

  const ring =
    pick(colors, 'focusBorder', 'button.background', 'activityBar.activeBorder') ??
    (mode === 'dark' ? '#0078d4' : '#0078d4');

  const primary =
    pick(
      colors,
      'button.background',
      'activityBar.activeBorder',
      'tab.activeBorderTop',
      'focusBorder',
      'activityBarBadge.background',
    ) ?? ring;

  const userBubble =
    pick(colors, 'tab.activeBackground', 'editorWidget.background', 'list.activeSelectionBackground') ?? card;

  const sidebar = pick(colors, 'sideBar.background') ?? bg;
  const sidebarFg = pick(colors, 'sideBar.foreground', 'foreground') ?? fg;
  const sidebarBorder =
    pick(colors, 'sideBar.border', 'panel.border', 'contrastBorder') ?? border;
  const sidebarAccent = pick(colors, 'list.activeSelectionBackground') ?? blendHex(bg, primary, 0.2);
  const sidebarAccentFg = pick(colors, 'list.activeSelectionForeground') ?? contrastForeground(sidebarAccent);

  const destructive =
    pick(colors, 'editorError.foreground', 'errorForeground', 'minimap.errorHighlight') ??
    (mode === 'dark' ? '#f44747' : '#d32f2f');

  const success =
    pick(colors, 'gitDecoration.addedResourceForeground', 'terminal.ansiGreen', 'testing.iconPassed') ??
    (mode === 'dark' ? '#4ec994' : '#388e3c');

  const warning =
    pick(colors, 'editorWarning.foreground', 'gitDecoration.modifiedResourceForeground', 'terminal.ansiYellow') ??
    '#e9b308';

  const warningText =
    mode === 'light'
      ? (pick(colors, 'editorWarning.foreground') ?? '#92400e')
      : warning;

  const accentViolet =
    pick(colors, 'terminal.ansiMagenta', 'terminal.ansiBrightMagenta') ??
    (mode === 'dark' ? '#c678dd' : '#7c3aed');

  const accentIndigo =
    pick(colors, 'terminal.ansiBlue', 'terminal.ansiBrightBlue') ??
    (mode === 'dark' ? '#61afef' : '#3730a3');

  const accentBlue =
    pick(colors, 'terminal.ansiCyan', 'terminal.ansiBrightCyan') ??
    (mode === 'dark' ? '#56b6c2' : '#0891b2');

  const shimmerBase = mutedFg;
  const shimmerHighlight = mode === 'dark' ? '#f2f2f2' : fg;

  const primaryFg = contrastForeground(primary);
  const destructiveFg = contrastForeground(destructive);
  const successFg = contrastForeground(success);
  const warningFg = contrastForeground(warning);

  return {
    background: bg,
    foreground: fg,
    card,
    cardForeground: fg,
    popover: card,
    popoverForeground: fg,
    secondary,
    muted,
    mutedForeground: mutedFg,
    border,
    input: inputBg,
    ring,
    primary,
    primaryForeground: primaryFg,
    accent: primary,
    accentForeground: primaryFg,
    userBubble,
    userBubbleForeground: contrastForeground(userBubble),
    aiBubble: 'transparent',
    aiBubbleForeground: fg,
    sidebar,
    sidebarForeground: sidebarFg,
    sidebarPrimary: primary,
    sidebarPrimaryForeground: primaryFg,
    sidebarAccent,
    sidebarAccentForeground: sidebarAccentFg,
    sidebarBorder,
    destructive,
    destructiveForeground: destructiveFg,
    success,
    successForeground: successFg,
    warning,
    warningForeground: warningFg,
    thinking: primary,
    thinkingForeground: primaryFg,
    tool: primary,
    toolForeground: primaryFg,
    warningText,
    accentViolet,
    accentIndigo,
    accentBlue,
    shimmerBase,
    shimmerHighlight,
  };
}

// ── Code generation ───────────────────────────────────────────────────────────

function formatPalette(id, palette) {
  const entries = Object.entries(palette)
    .map(([k, v]) => `    ${k}: '${v}',`)
    .join('\n');
  return `  ${id}: {\n${entries}\n  },`;
}

function generateTs(palettes) {
  const body = Object.entries(palettes)
    .map(([id, p]) => formatPalette(id, p))
    .join('\n');

  return `// AUTO-GENERATED by scripts/generate-vscode-themes.mjs — do not edit by hand.
// Run \`npm run sync-vscode-themes\` to regenerate.

export const VSCodePalettes = {
${body}
} as const;
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const palettes = {};

  for (const theme of THEMES) {
    console.log(`\nProcessing: ${theme.label} (${theme.id})`);
    try {
      let themeData;

      if (theme.source.type === 'marketplace') {
        themeData = await fetchMarketplaceTheme(
          theme.source.publisher,
          theme.source.extension,
          theme.source.themeName,
        );
      } else {
        themeData = await fetchGithubTheme(theme.source.url);
      }

      const colors = themeData.colors ?? {};
      const palette = mapToThemeColors(colors, theme.mode);

      // Apply per-theme overrides from config.
      for (const [k, v] of Object.entries(theme.overrides ?? {})) {
        if (k in palette) {
          palette[k] = v;
        }
      }

      palettes[theme.id] = palette;
      console.log(`  ✓ ${theme.label} — bg=${palette.background} primary=${palette.primary}`);
    } catch (err) {
      console.error(`  ✗ ${theme.label} FAILED: ${err.message}`);
      process.exitCode = 1;
    }
  }

  if (Object.keys(palettes).length === 0) {
    console.error('\nNo palettes generated — aborting.');
    process.exit(1);
  }

  const outDir = resolve(root, 'src', 'constants', 'themes');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'generated.ts');
  writeFileSync(outPath, generateTs(palettes), 'utf8');
  console.log(`\nWrote ${Object.keys(palettes).length} palettes → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
