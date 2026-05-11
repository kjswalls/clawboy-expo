/**
 * themes.config.mjs
 *
 * Defines the VS Code themes to import. Each entry describes how to fetch
 * the theme source, which theme variant to extract from the VSIX, and any
 * signature-colour overrides to apply after the automated mapping.
 *
 * Overrides are useful when the automated VS Code key mapping produces a
 * colour that doesn't match the theme's iconic palette (e.g. One Dark Pro's
 * button.background is not the iconic blue).
 */

/** @typedef {{ type: 'marketplace'; publisher: string; extension: string; themeName?: string }} MarketplaceSource */
/** @typedef {{ type: 'github'; url: string }} GithubSource */
/**
 * @typedef {{
 *   id: string;
 *   mode: 'dark' | 'light';
 *   label: string;
 *   flavor: string;
 *   source: MarketplaceSource | GithubSource;
 *   overrides?: Record<string, string>;
 * }} ThemeConfig
 */

/** @type {ThemeConfig[]} */
export const THEMES = [
  // ── Dark themes ───────────────────────────────────────────────────────────
  {
    id: 'orion',
    mode: 'dark',
    label: 'Orion',
    flavor: 'Hunter of the deep night',
    source: {
      type: 'marketplace',
      publisher: 'zhuangtongfa',
      extension: 'material-theme',
      themeName: 'One Dark Pro',
    },
    // button.background maps to a muted gray; use the iconic blue that appears
    // on keywords and interactive elements throughout the palette.
    overrides: {
      primary: '#61afef',
      accent: '#61afef',
      ring: '#61afef',
      sidebarPrimary: '#61afef',
      thinking: '#61afef',
      tool: '#61afef',
      accentViolet: '#c678dd',
      accentIndigo: '#61afef',
      accentBlue: '#56b6c2',
    },
  },
  {
    id: 'nebula',
    mode: 'dark',
    label: 'Nebula',
    flavor: 'Neon clouds in deep space',
    source: {
      type: 'marketplace',
      publisher: 'enkia',
      extension: 'tokyo-night',
      themeName: 'Tokyo Night',
    },
    // Blue-purple is the palette identity — accentIndigo for the desaturated
    // mid-tone, accentBlue for the cyan highlights.
    overrides: {
      accentIndigo: '#7aa2f7',
      accentBlue: '#7dcfff',
    },
  },

  // ── Light themes ──────────────────────────────────────────────────────────
  {
    id: 'polaris',
    mode: 'light',
    label: 'Polaris',
    flavor: 'True north, plain and clean',
    source: {
      type: 'marketplace',
      publisher: 'github',
      extension: 'github-vscode-theme',
      themeName: 'GitHub Light Default',
    },
    // GitHub's interactive blue is more universal as a primary than the green
    // (which is GitHub's success/add colour).
    overrides: {
      primary: '#0969da',
      accent: '#0969da',
      ring: '#0969da',
      sidebarPrimary: '#0969da',
      thinking: '#0969da',
      tool: '#0969da',
    },
  },
  {
    id: 'empress',
    mode: 'light',
    label: 'The Empress',
    flavor: 'Warm earth, growing things 🪴',
    // Solarized Light is a VS Code built-in; fetch directly from the repo.
    source: {
      type: 'github',
      url: 'https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-solarized-light/themes/solarized-light-color-theme.json',
    },
    overrides: {
      // Solarized's canonical blue for interactive elements.
      primary: '#268bd2',
      accent: '#268bd2',
      ring: '#268bd2',
      sidebarPrimary: '#268bd2',
      thinking: '#268bd2',
      tool: '#268bd2',
    },
  },
  {
    id: 'vega',
    mode: 'light',
    label: 'Vega',
    flavor: 'A bright, polished star',
    source: {
      type: 'marketplace',
      publisher: 'akamud',
      extension: 'vscode-theme-onelight',
      themeName: 'Atom One Light',
    },
    overrides: {},
  },
  {
    id: 'star',
    mode: 'light',
    label: 'The Star',
    flavor: 'Sky-blue and hopeful',
    source: {
      type: 'marketplace',
      publisher: 'galaxydrifters',
      extension: 'parasol-theme',
      themeName: 'Parasol',
    },
    overrides: {
      // Generated border is nearly invisible on white card surface. Darken to
      // a visible but airy blue-gray that complements the sky-blue primary.
      border: '#a9c0cb',
    },
  },
];
