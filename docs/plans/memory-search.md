# Memory search in clawboy-expo — implementation plan

## Context

OpenClaw gateway has no direct session-text-search RPC, but its `memory_search` MCP tool (CLI: `openclaw memory search`) can hybrid-search session transcripts when `memorySearch.experimental.sessionMemory = true` and an embedding provider is configured. Clawboy-expo currently has **no** client binding for it and no search UI in the sidebar.

This plan adds a `memory_search` client binding plus a two-surface UI (sidebar inline + dedicated `/search` route), with hybrid local+remote search and tap-to-jump-to-message.

## Locked design decisions

1. **UI: Both** — sidebar inline search + dedicated `app/search.tsx` route.
2. **Scope: Hybrid** — instant local lexical filter over loaded session titles/previews + debounced `memory_search` for transcript hits.
3. **Config: Assume on, fall back gracefully** — call optimistically; on disabled response, show inline hint.
4. **Tap behavior: Open session + scroll to match** — already-exposed `MessageList.scrollToMessageId` consumed via a pending-scroll latch.

## RPC method discovery (gateway-side unverified)

Only `tools.catalog` is invoked from the client today ([client.ts:1663](../../src/lib/openclaw/client.ts#L1663)) — no precedent for invoking an MCP tool over WS. Binding tries methods in order, caches first success:

1. `tools.invoke` with `{ tool: 'memory_search', args: {...} }` (mirrors gateway HTTP envelope at `gateway/tools-invoke-http-api.md`)
2. `memory.search` with `{ query, limit, ... }` (mirrors first-class RPCs like `sessions.list`)
3. `tools.call` with `{ name, arguments }` (MCP wire spec)

Distinguish `METHOD_NOT_FOUND`-style errors (continue) from real errors (stop + surface). **Confirm actual method before merge** via gateway source or `EXPO_PUBLIC_PROTOCOL_DEBUG=1` frame inspection.

## Files

### New

- **`src/lib/openclaw/memory.ts`** — binding + `normalize()`. Exports `searchMemory(call, params)` returning `{ results, disabled?, error? }`. Defensive parsing across `result | .results | .items | .hits | .matches` plus MCP `content: [{ type:'text', text: JSON }]` envelope. See sketch below.
- **`src/hooks/useMemorySearch.ts`** — debounce (150 ms, mirror [GatewayLogsModal.tsx:191-245](../../src/components/settings/GatewayLogsModal.tsx#L191-L245)), generation-counter cancel of stale RPC, disabled-latch state. Returns `{ query, setQuery, results, loading, disabled, error }`. Reads client via existing `useConnection()` (see usage in [app/index.tsx](../../app/index.tsx)).
- **`app/search.tsx`** — root-level route (sibling of `index.tsx`). Pinned `TextInput` + back button + count, scrollable FlashList of richer result rows, `All | Sessions | Memory` filter chips, score↓ / recent↓ sort toggle. Hydrates initial query from `useLocalSearchParams<{ q?: string }>()`. Calls `useMemorySearch` independently — no shared store.
- **`src/lib/openclaw/__tests__/memory.test.ts`** — Jest, mock `RpcCaller`. Cases: empty query short-circuits; normalize across all response shapes; METHOD_NOT_FOUND fallback walks the list and caches success; "disabled"/"embedding"/"not configured" → `disabled: true`.
- **`src/hooks/__tests__/useMemorySearch.test.ts`** — debounce coalesces rapid input; gen counter drops stale resolution; disabled latch sticky until query cleared.

### Edited

- **`src/lib/openclaw/index.ts`** — append `export * from './memory'`.
- **`src/lib/openclaw/client.ts`** — add `OpenClawClient.searchMemory(params)` method near `getToolsCatalog` (around [client.ts:1660](../../src/lib/openclaw/client.ts#L1660)), delegating to `memoryApi.searchMemory(this._call.bind(this), params)`.
- **`src/components/sidebar/SessionSidebarList.tsx`** — insert search input block between the New Session row (~line 343-360) and the list/empty rendering (~line 362). When `query.trim().length > 0`:
  - replace list data with `[local-section-header, ...localMatches, remote-section-header, ...top5 remoteResults, see-all-link]`
  - new `ListItem` variants `'remote-result' | 'see-all'` in the renderItem switch
  - `'remote-result'` press: `setPendingScrollTarget(sessionKey, messageId)` → `onSelectSession(sessionKey)` → sidebar closes
  - `'see-all'` press: `router.push({ pathname: '/search', params: { q: query } })`
  - When `disabled === true` and query non-empty: muted one-line hint under input, "Memory search not configured on gateway" with `Linking.openURL` to docs.
- **`app/index.tsx`** — add `useEffect` keyed on `[currentSessionKey, messages.length, historyLoading]`: when history loads and messages populated, `consumePendingScrollTarget(currentSessionKey)` → `requestAnimationFrame(() => messageListRef.current?.scrollToMessageId(id))` (twice, mirror existing send-anchor pattern at [MessageList.tsx:418](../../src/components/chat/MessageList.tsx#L418)). `messageListRef` already exists at [app/index.tsx:555](../../app/index.tsx#L555); proven pattern at lines 623/1116 with `scrollToAnnotationId`.
- **`src/components/chat/sendScrollTarget.ts`** — already exists; add sibling `pendingMessageScrollTarget` API with `setPendingScrollTarget(sessionKey, messageId | undefined)` and `consumePendingScrollTarget(sessionKey): { messageId } | null`. Module-level Map, no React context.
- **`src/i18n/locales/en.json`** (and sibling locales — list with `ls src/i18n/locales/` before merge) — add `sidebar.searchPlaceholder`, `sidebar.searchDisabled`, `sidebar.seeAllResults`, `sidebar.localMatches`, `sidebar.transcriptMatches`, `search.title`, `search.empty`, `search.filterAll`, `search.filterSessions`, `search.filterMemory`, `search.sortScore`, `search.sortRecent`.

### Unchanged (verified)

- **`src/components/chat/MessageList.tsx`** — `scrollToMessageId` already exposed at [MessageList.tsx:770-775](../../src/components/chat/MessageList.tsx#L770-L775). No API change needed.

## Conventions to mirror

- Module file pattern: import `RpcCaller` from `./types`, named async exports, defensive response parsing, try-catch for optional ops. Reference [src/lib/openclaw/sessions.ts](../../src/lib/openclaw/sessions.ts) and [src/lib/openclaw/chat.ts](../../src/lib/openclaw/chat.ts).
- Search input visual: copy from [GatewayLogsModal.tsx:467-484](../../src/components/settings/GatewayLogsModal.tsx#L467-L484) — height 32, `colors.secondary` bg, hairline border, `BorderRadius.md`, `clearButtonMode="while-editing"`.
- Tokens: `useTokens()`, `colors.{primary,secondary,border,mutedForeground,foreground}`, `Spacing.{sm,md,lg}` from [src/constants/theme.ts](../../src/constants/theme.ts).
- i18n: `useTranslation()` + `t('sidebar.*')`/`t('search.*')` — already used throughout SessionSidebarList.

## Result shape (defensive — refine after gateway probe)

```ts
interface MemorySearchResult {
  id: string;            // chunk id | messageId | composite fallback
  content: string;
  score: number;
  source: 'memory' | 'session' | string;
  sessionKey?: string;
  messageId?: string;    // load-bearing for scroll-to; may be absent
  agentId?: string;
  filePath?: string;
  timestamp?: string;
  snippet?: string;
}
interface MemorySearchResponse {
  results: MemorySearchResult[];
  disabled?: boolean;
  error?: string;
}
```

## memory.ts sketch

```ts
import type { RpcCaller } from './types';

type MemoryRpcMethod = 'tools.invoke' | 'memory.search' | 'tools.call';
const METHOD_ORDER: MemoryRpcMethod[] = ['tools.invoke', 'memory.search', 'tools.call'];
let cachedMethod: MemoryRpcMethod | null = null;

export interface SearchMemoryParams {
  query: string;
  limit?: number;
  minScore?: number;
  agentId?: string;
  scope?: 'memory' | 'session' | 'all';
}

function paramsFor(method: MemoryRpcMethod, p: SearchMemoryParams) {
  switch (method) {
    case 'tools.invoke': return { tool: 'memory_search', args: { query: p.query, maxResults: p.limit, minScore: p.minScore, agent: p.agentId, scope: p.scope } };
    case 'memory.search': return { query: p.query, limit: p.limit, minScore: p.minScore, agentId: p.agentId, scope: p.scope };
    case 'tools.call':   return { name: 'memory_search', arguments: { query: p.query, max_results: p.limit, min_score: p.minScore, agent: p.agentId } };
  }
}

export async function searchMemory(call: RpcCaller, params: SearchMemoryParams): Promise<MemorySearchResponse> {
  if (!params.query.trim()) return { results: [] };
  const tried: string[] = [];
  for (const method of cachedMethod ? [cachedMethod] : METHOD_ORDER) {
    tried.push(method);
    try {
      const raw = await call<any>(method, paramsFor(method, params), { timeoutMs: 10_000 });
      cachedMethod = method;
      return normalize(raw);
    } catch (err: any) {
      const code = String(err?.code || err?.error?.code || '');
      const msg  = String(err?.message || err?.error?.message || '');
      if (/METHOD_NOT_FOUND|unknown_method|no such method/i.test(code + ' ' + msg)) continue;
      if (/disabled|embedding|not configured|no provider|index empty/i.test(msg)) {
        return { results: [], disabled: true, error: msg };
      }
      if (cachedMethod) return { results: [], error: msg };
    }
  }
  return { results: [], error: `memory_search not supported (tried: ${tried.join(', ')})` };
}
```

## Verification

1. Gateway: set `memorySearch.enabled = true`, `memorySearch.experimental.sessionMemory = true`, configure an embedding provider (e.g. `OPENAI_API_KEY`). Restart.
2. CLI smoke: `openclaw memory search --query "hello" --json` → confirm non-empty JSON and field names; update `normalize()` if shape differs.
3. Index: `openclaw memory index --force`.
4. Run `EXPO_PUBLIC_PROTOCOL_DEBUG=1` Expo session; type a known phrase in sidebar; inspect WS frame to confirm the settled RPC method.
5. Sidebar: local title/preview hits appear instantly; remote hits ~150 ms later; tap a remote hit → session loads, MessageList scrolls to the matched bubble.
6. Disabled path: temporarily flip the gateway flag off; confirm inline hint + no crash.
7. "See all results" → `/search` opens with query prefilled; filters + sort + result tap all work.
8. `yarn test src/lib/openclaw/__tests__/memory.test.ts src/hooks/__tests__/useMemorySearch.test.ts` passes.

## Open risks

1. **RPC method name unverified** — discovery loop covers three plausible shapes; a fourth would fail silently. Probe gateway source before merge.
2. **`messageId` may be absent** — without it, "scroll to match" degrades to "open session at bottom". Field could be `messageId | message_id | msgId | bubbleId`. Confirm during verification step 2.
3. **Per-agent scoping unclear** — exposed as optional param, defaulted off (search all). Verify behavior.
4. **MCP envelope JSON-in-text** — normalize handles `content: [{type:'text', text}]` but breaks if text is markdown instead of JSON.
5. **i18n keys** — must add to all locale files, not just `en.json`.

## Sources

- <https://docs.openclaw.ai/llms.txt>
- <https://docs.openclaw.ai/cli/memory.md>
- <https://docs.openclaw.ai/concepts/memory-search.md>
- <https://docs.openclaw.ai/cli/sessions.md>
- <https://github.com/openclaw/openclaw>
