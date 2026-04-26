/**
 * themes.config.mjs
 *
 * Defines the 6 VS Code themes to import. Each entry describes how to fetch
 * the theme source, which theme variant to extract from the VSIX, and any
 * signature-colour overrides to apply after the automated mapping.
 *
 * Overrides are useful when the automated VS Code key mapping produces a
 * colour that doesn't match the theme's iconic palette (e.g. Dracula's
 * button.background is not the famous purple).
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
    id: 'oneDarkPro',
    mode: 'dark',
    label: 'One Dark Pro',
    flavor: "Atom's legacy, refined",
    source: {
      type: 'marketplace',
      publisher: 'zhuangtongfa',
      extension: 'material-theme',
      themeName: 'One Dark Pro',
    },
    // button.background maps to a muted gray; use the iconic One Dark Pro blue
    // that appears on keywords and interactive elements throughout the theme.
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
    id: 'dracula',
    mode: 'dark',
    label: 'Dracula',
    flavor: '"I want to suck your blood"',
    source: {
      type: 'marketplace',
      publisher: 'dracula-theme',
      extension: 'theme-dracula',
      themeName: 'Dracula',
    },
    // Dracula's button.background is a lighter purple highlight — override to
    // the iconic Dracula purple used on keywords and selection highlights.
    // Also fix warning: editorWarning maps to cyan in Dracula; use the orange.
    overrides: {
      primary: '#bd93f9',
      accent: '#bd93f9',
      ring: '#bd93f9',
      sidebarPrimary: '#bd93f9',
      thinking: '#bd93f9',
      tool: '#bd93f9',
      accentViolet: '#bd93f9',
      accentIndigo: '#6272a4',
      accentBlue: '#8be9fd',
      warning: '#ffb86c',
      warningText: '#ffb86c',
    },
  },
  {
    id: 'tokyoNight',
    mode: 'dark',
    label: 'Tokyo Night',
    flavor: 'Neon city after dark',
    source: {
      type: 'marketplace',
      publisher: 'enkia',
      extension: 'tokyo-night',
      themeName: 'Tokyo Night',
    },
    // Tokyo Night's blue-purple is the theme identity — accentIndigo for the
    // desaturated mid-tone, accentBlue for the cyan highlights.
    overrides: {
      accentIndigo: '#7aa2f7',
      accentBlue: '#7dcfff',
    },
  },

  // ── Light themes ──────────────────────────────────────────────────────────
  {
    id: 'githubLight',
    mode: 'light',
    label: 'GitHub Light',
    flavor: 'Clean, neutral, familiar',
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
    id: 'solarizedLight',
    mode: 'light',
    label: 'Solarized Light',
    flavor: 'Warm, easy on the eyes',
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
    id: 'oneLight',
    mode: 'light',
    label: 'One Light',
    flavor: 'Atom Light, polished',
    source: {
      type: 'marketplace',
      publisher: 'akamud',
      extension: 'vscode-theme-onelight',
      themeName: 'Atom One Light',
    },
    overrides: {},
  },
];
