// Tool display resolution: maps tool names to icons, human-readable titles,
// and keys to extract detail text from args.
// Based on the canonical tool-display.json from the OpenClaw server.

export type ToolIconType =
  | 'terminal'
  | 'file-text'
  | 'edit'
  | 'pen-line'
  | 'globe'
  | 'search'
  | 'folder'
  | 'database'
  | 'puzzle'
  | 'message'
  | 'browser'
  | 'image'
  | 'clock'
  | 'plug'
  | 'bot'
  | 'attach'

export interface ToolDisplay {
  icon: ToolIconType
  title: string
  detailKeys: string[]
}

const TOOL_MAP: Record<string, ToolDisplay> = {
  // --- Server canonical tools (from tool-display.json) ---

  // Shell / exec
  exec:             { icon: 'terminal',   title: 'Exec',            detailKeys: ['command'] },
  process:          { icon: 'terminal',   title: 'Process',         detailKeys: ['sessionId'] },

  // File operations
  read:             { icon: 'file-text',  title: 'Read',            detailKeys: ['path'] },
  write:            { icon: 'edit',       title: 'Write',           detailKeys: ['path'] },
  edit:             { icon: 'pen-line',   title: 'Edit',            detailKeys: ['path'] },
  apply_patch:      { icon: 'pen-line',   title: 'Apply Patch',     detailKeys: [] },
  attach:           { icon: 'attach',     title: 'Attach',          detailKeys: ['path', 'url', 'fileName'] },

  // Browser
  browser:          { icon: 'browser',    title: 'Browser',         detailKeys: ['targetUrl', 'targetId'] },

  // Canvas / UI
  canvas:           { icon: 'image',      title: 'Canvas',          detailKeys: ['action', 'url', 'target', 'node', 'nodeId'] },

  // Nodes (mobile/device)
  nodes:            { icon: 'plug',       title: 'Nodes',           detailKeys: ['node', 'nodeId'] },

  // Cron
  cron:             { icon: 'clock',      title: 'Cron',            detailKeys: ['id'] },

  // Gateway
  gateway:          { icon: 'plug',       title: 'Gateway',         detailKeys: ['reason', 'delayMs'] },

  // Messaging
  message:          { icon: 'message',    title: 'Message',         detailKeys: ['provider', 'to'] },

  // Agents / sessions
  agents_list:      { icon: 'bot',        title: 'Agents',          detailKeys: [] },
  sessions_list:    { icon: 'folder',     title: 'Sessions',        detailKeys: ['kinds', 'limit'] },
  sessions_history: { icon: 'file-text',  title: 'Session History', detailKeys: ['sessionKey', 'limit'] },
  sessions_send:    { icon: 'message',    title: 'Session Send',    detailKeys: ['label', 'sessionKey', 'agentId'] },
  sessions_spawn:   { icon: 'bot',        title: 'Sub-agent',       detailKeys: ['label', 'task', 'agentId'] },
  subagents:        { icon: 'bot',        title: 'Subagents',       detailKeys: ['target'] },
  session_status:   { icon: 'folder',     title: 'Session Status',  detailKeys: ['sessionKey', 'model'] },

  // Memory
  memory_search:    { icon: 'database',   title: 'Memory Search',   detailKeys: ['query'] },
  memory_get:       { icon: 'database',   title: 'Memory Get',      detailKeys: ['path', 'from', 'lines'] },

  // Web
  web_search:       { icon: 'search',     title: 'Web Search',      detailKeys: ['query', 'count'] },
  web_fetch:        { icon: 'globe',      title: 'Web Fetch',       detailKeys: ['url', 'extractMode'] },

  // WhatsApp
  whatsapp_login:   { icon: 'message',    title: 'WhatsApp Login',  detailKeys: [] },

  // Image / TTS
  image:            { icon: 'image',      title: 'Image',           detailKeys: ['prompt', 'path'] },
  tts:              { icon: 'message',    title: 'Text-to-Speech',  detailKeys: ['text'] },

  // --- Extra aliases for MCP / third-party tools ---
  bash:             { icon: 'terminal',   title: 'Bash',            detailKeys: ['command', 'cmd'] },
  shell:            { icon: 'terminal',   title: 'Shell',           detailKeys: ['command', 'cmd'] },
  grep:             { icon: 'search',     title: 'Grep',            detailKeys: ['pattern', 'query'] },
  glob:             { icon: 'folder',     title: 'Find Files',      detailKeys: ['pattern', 'glob', 'path'] },
  find:             { icon: 'folder',     title: 'Find',            detailKeys: ['pattern', 'path'] },
}

/** Resolve a tool name to its display metadata. Falls back to a generic puzzle icon. */
export function resolveToolDisplay(toolName: string): ToolDisplay {
  // Exact match
  const lower = toolName.toLowerCase()
  if (TOOL_MAP[lower]) return TOOL_MAP[lower]

  // Try stripping common prefixes (e.g. "mcp_tool_bash" -> "bash")
  const stripped = lower.replace(/^(mcp_tool_|tool_|mcp_)/, '')
  if (TOOL_MAP[stripped]) return TOOL_MAP[stripped]

  // Partial match: check if any key is contained in the tool name
  for (const [key, display] of Object.entries(TOOL_MAP)) {
    if (lower.includes(key)) return display
  }

  // Fallback
  return {
    icon: 'puzzle',
    title: toolName,
    detailKeys: []
  }
}

/**
 * Extract a human-readable detail string from tool call args.
 * Traverses detailKeys in order and returns the first non-empty string value,
 * truncated to maxLen characters.
 */
export function extractToolDetail(
  args: Record<string, unknown> | undefined,
  detailKeys: string[],
  maxLen = 80
): string {
  if (!args) return ''

  // Check configured detail keys first, then fall back to _meta (server summary)
  for (const key of [...detailKeys, '_meta']) {
    const val = args[key]
    if (typeof val === 'string' && val.trim()) {
      const trimmed = val.trim()
      if (trimmed.length > maxLen) {
        return trimmed.slice(0, maxLen) + '\u2026'
      }
      return trimmed
    }
  }

  return ''
}
