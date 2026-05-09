import type { AgentFile } from '@/lib/openclaw/types';

// File extensions that, when they appear as the sole TLD of an `http(s)://`
// host, indicate a gateway filesystem path auto-linked by linkify rather than
// a real web URL.  e.g. `http://memory.md` or `https://script.sh`.
const FILE_EXTENSION_TLDS = new Set([
  'md', 'mdx', 'markdown',
  'txt', 'log', 'csv',
  'json', 'yaml', 'yml', 'toml',
  'sh', 'bash', 'zsh', 'fish',
  'py', 'rs', 'ts', 'tsx', 'js', 'jsx',
  'html', 'css',
  'go', 'rb', 'java', 'c', 'cpp', 'h',
]);

/**
 * Returns true when `href` looks like an `http(s)://` URL whose "host" is
 * actually a bare filename — i.e. `http://memory.md` rather than a real domain.
 *
 * Match criteria (all must be true):
 *  - scheme is http or https
 *  - no path component beyond the root (no slash after the host, or only `/`)
 *  - no query string or fragment
 *  - the extension of the host (after the last `.`) is in FILE_EXTENSION_TLDS
 */
function isHttpFilenameUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // Must have no meaningful path (linkify produces e.g. http://memory.md/ with trailing slash)
  if (url.pathname !== '/' && url.pathname !== '') return false;
  if (url.search || url.hash) return false;
  const host = url.hostname.toLowerCase();
  const dotIdx = host.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = host.slice(dotIdx + 1);
  return FILE_EXTENSION_TLDS.has(ext);
}

/**
 * Returns true when `href` is an internal link — i.e. it should NOT be
 * handed to `Linking.openURL`.
 *
 * `file://` URLs always count as internal: they point to files on the
 * **gateway** filesystem, not the device, so they can never be opened by the
 * OS browser or any installed app.
 *
 * `http(s)://name.ext` URLs where `ext` is a common file extension are also
 * treated as internal — these arise when linkify auto-promotes a bare filename
 * like `memory.md` to `http://memory.md` (Moldova ccTLD).
 *
 * Everything else with a URL scheme (http/https/mailto/tel/sms/ws/wss/…) is
 * treated as external and left to `Linking.openURL`.
 */
export function isInternalLink(href: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  // file:// → always internal (gateway filesystem path, not device path)
  if (/^file:\/\//i.test(trimmed)) return true;
  // http(s)://name.ext (no path/query/fragment) → linkify auto-promotion of a
  // bare filename; treat as internal so it routes through the file viewer.
  if (/^https?:\/\//i.test(trimmed) && isHttpFilenameUrl(trimmed)) return true;
  // Anything else with a scheme is external
  return !/^[a-z][a-z0-9+\-.]*:/i.test(trimmed);
}

/**
 * Given an internal `href`, return the bare filename/path suitable for passing
 * to `getAgentFile`.  Strips:
 *  - `file://` scheme
 *  - `http(s)://name.ext` scheme (where name.ext is the hostname)
 *  - `#fragment` and `?query`
 *  - leading `./` and `/`
 *
 * Returns null if the result is empty.
 */
export function extractBareHref(href: string): string | null {
  let bare = href.trim();

  // Strip file:// scheme
  bare = bare.replace(/^file:\/\//i, '');

  // Strip http(s)://name.ext scheme (linkify-promoted filenames)
  if (/^https?:\/\//i.test(bare) && isHttpFilenameUrl(href)) {
    let url: URL;
    try {
      url = new URL(bare);
      bare = url.hostname;
    } catch {
      bare = bare.replace(/^https?:\/\//i, '');
    }
  }

  // Strip fragment and query string
  const fragIdx = bare.indexOf('#');
  if (fragIdx !== -1) bare = bare.slice(0, fragIdx);
  const queryIdx = bare.indexOf('?');
  if (queryIdx !== -1) bare = bare.slice(0, queryIdx);

  // Normalise leading ./ and /
  bare = bare.replace(/^\.\//, '').replace(/^\//, '');

  return bare || null;
}

/**
 * Normalises `href` and does a case-insensitive lookup against each file's
 * `name` (bare filename) and `path` (workspace-relative path).
 *
 * Normalisation steps (applied in order):
 *  1. Strip `file://` scheme (gateway absolute paths use this)
 *  2. Strip `http(s)://name.ext` scheme (linkify-promoted bare filenames)
 *  3. Strip `#fragment` and `?query`
 *  4. Strip leading `./` and `/`
 *
 * Match modes (tried in order, first match wins):
 *  a. Exact match on `file.name`
 *  b. Exact match on `file.path`
 *  c. `file.path` is a suffix of the bare href
 *     e.g. href "memory/detail/infrastructure.md" matches path "memory/detail/infrastructure.md"
 *  d. Bare href ends with `/<file.path>`
 *     e.g. href "home/ubuntu/.openclaw/workspace/memory/detail/infrastructure.md"
 *     matches path "memory/detail/infrastructure.md"
 *  e. Basename of the bare href matches `file.name` (only when href contains `/`)
 *     e.g. href "home/ubuntu/.openclaw/workspace/MEMORY.md" matches name "MEMORY.md"
 *
 * Returns the first matching AgentFile, or null if none match.
 */
export function findAgentFileMatch(
  href: string,
  files: AgentFile[],
): AgentFile | null {
  if (!href || files.length === 0) return null;

  const bare = extractBareHref(href);
  if (!bare) return null;

  const lower = bare.toLowerCase();
  // Only compute basename when the path actually has a directory component,
  // to avoid false-positive basename matches for schemeless single-segment hrefs.
  const hasDirectory = lower.includes('/');
  const lowerBasename = hasDirectory ? (lower.split('/').pop() ?? lower) : lower;

  for (const file of files) {
    const nameLower = file.name.toLowerCase();
    const pathLower = file.path.toLowerCase();

    // (a) exact name match
    if (nameLower === lower) return file;
    // (b) exact path match
    if (pathLower === lower) return file;
    // (c) file.path is a suffix of the href (e.g. "docs/Memory.MD" in href)
    if (pathLower.endsWith(`/${lower}`)) return file;
    // (d) href ends with the workspace-relative file path
    if (hasDirectory && lower.endsWith(`/${pathLower}`)) return file;
    // (e) basename of a deep href matches file.name
    if (hasDirectory && nameLower === lowerBasename) return file;
  }

  return null;
}
