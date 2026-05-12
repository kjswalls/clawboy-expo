// OpenClaw Protocol v3 — Wire-frame validation schemas
//
// These Zod schemas validate the top-level shape of every WebSocket frame the
// gateway sends to the client. The goal is to reject clearly malformed frames
// (wrong types, missing required fields) BEFORE any side-effects run inside
// `handleMessage`. We deliberately stay loose on inner payloads (`z.unknown()`
// passthrough) so legitimate server-side additions don't trigger rejections.
//
// High-impact event payload schemas are exported for documentation and for
// future tightening — `handleMessage` currently only enforces the top-level
// `WireFrameSchema`. See `docs/audits/findings/X2-security-sweep-findings.md`
// (sec-001).

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Top-level frame discriminators
// ---------------------------------------------------------------------------

export const RequestFrameSchema = z.object({
  type: z.literal('req'),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
})

export const ResponseFrameSchema = z.object({
  type: z.literal('res'),
  id: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z.unknown().optional(),
})

export const EventFrameSchema = z.object({
  type: z.literal('event'),
  event: z.string(),
  payload: z.unknown().optional(),
})

export const WireFrameSchema = z.discriminatedUnion('type', [
  RequestFrameSchema,
  ResponseFrameSchema,
  EventFrameSchema,
])

export type WireFrame = z.infer<typeof WireFrameSchema>

// ---------------------------------------------------------------------------
// High-impact event payload schemas
//
// These describe the expected shapes of the most security-sensitive payloads
// (the ones that drive UI updates and store assistant output). They are
// intentionally permissive — `passthrough` on the object, `unknown` on the
// fields we don't enforce — so a server adding new keys won't cause
// validation failures.
// ---------------------------------------------------------------------------

/** Server challenge nonce sent before the client's `connect` request. */
export const ConnectChallengeSchema = z
  .object({
    nonce: z.string(),
  })
  .passthrough()

/** Initial server response confirming protocol/auth. */
export const HelloOkSchema = z
  .object({
    type: z.literal('hello-ok').optional(),
    auth: z
      .object({
        deviceToken: z.string().optional(),
      })
      .passthrough()
      .optional(),
    policy: z
      .object({
        tickIntervalMs: z.number().optional(),
        minClientVersion: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

/** Streaming chat delta — text chunk for the active session. */
export const ChatDeltaPayloadSchema = z
  .object({
    state: z.literal('delta'),
    sessionKey: z.string().optional(),
    runId: z.string().optional(),
    delta: z.unknown().optional(),
    text: z.unknown().optional(),
    thinking: z.unknown().optional(),
    toolCall: z.unknown().optional(),
    message: z.unknown().optional(),
  })
  .passthrough()

/** Final assistant message payload. */
export const ChatFinalPayloadSchema = z
  .object({
    state: z.literal('final'),
    sessionKey: z.string().optional(),
    runId: z.string().optional(),
    message: z
      .object({
        id: z.unknown().optional(),
        role: z.unknown().optional(),
        content: z.unknown().optional(),
        timestamp: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

/** Agent assistant stream — partial or cumulative text from a (sub)agent. */
export const AgentAssistantPayloadSchema = z
  .object({
    stream: z.literal('assistant'),
    sessionKey: z.string().optional(),
    runId: z.string().optional(),
    data: z
      .object({
        text: z.unknown().optional(),
        delta: z.unknown().optional(),
        content: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
