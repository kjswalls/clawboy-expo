# Blocker 4 — Content Moderation

*Status: Decision required; no-op architectural seam already in codebase*
*Last updated: May 10, 2026*

---

## What is this?

Under the **Generative AI Service Management Interim Measures** (2023) and the **Cybersecurity Law**, entities offering generative AI services to PRC users must implement real-time content moderation. Specifically:

- All AI-generated text output must be screened for the "七不准" (seven prohibited categories):
  1. Content violating the socialist core values system
  2. Endangering national security / splitting the country / undermining national unity
  3. Inciting ethnic hatred or discrimination
  4. Unlawful information harmful to public order or public morals
  5. Defamatory, fraudulent, or privacy-violating content
  6. Copyright-infringing content
  7. Other content prohibited by laws and administrative regulations

- The **service provider** (in this case, whoever is deemed the "provider" for PRC purposes) bears the compliance obligation, not the model developer or the end user.

---

## The philosophical tension

ClawBoy's entire design is "we never see your content." The gateway processes messages on the user's server; we only relay WebSocket frames. This architecture is:

- **Correct for privacy** (our commitment in `docs/legal/privacy-policy.md`)
- **Incompatible with PRC real-time content moderation** as typically implemented

There is no way to do both simultaneously in a single build. A China build must make an explicit choice.

---

## Three viable paths

### Path A: Partner gateway responsible for moderation (recommended)

The partner gateway operator (from `02-generative-ai.md`) implements content moderation on the server side. The gateway runs content through a CAC-approved moderation SDK or API before sending the response to ClawBoy.

**How it works:**
- The gateway uses a domestic moderation API (Alibaba Green, Tencent Cloud Tianyu, Baidu Content Censor, or IFLY SafeCheck).
- Blocked content returns an error event or a sanitized replacement.
- ClawBoy's client code does not change — it just renders what the gateway sends.
- The partner is the legally responsible party for moderation compliance.

**Pros:**
- ClawBoy client stays zero-knowledge.
- Partner assumes legal compliance burden.
- Consistent with "thin client" architecture.

**Cons:**
- Dependent on partner implementing moderation correctly.
- We cannot independently verify the partner complies.
- If the partner fails a regulator audit, we are co-listed and potentially implicated.

**Contractual protection needed:** The publishing partner agreement must contain a clause that the partner is solely responsible for content compliance, indemnifying Sunday Softworks against PRC content regulation failures.

### Path B: On-device moderation SDK (CN build only)

The CN build bundles a PRC-approved content safety SDK that intercepts streaming text before rendering and filters or replaces prohibited content on-device.

**How it works:**
- A PRC-licensed content moderation SDK (e.g., Alibaba Green SDK, IFLY SafeCheck SDK) is included as a CN-only dependency.
- In `src/hooks/useChat.ts`, the `onMessageSegment` hook seam (already present, no-op in global build) calls the SDK's `filter()` function on each text chunk.
- Blocked chunks are replaced with a placeholder (e.g., "[内容已过滤]").

**Pros:**
- We maintain direct control over compliance.
- Does not require partner gateway to implement moderation.

**Cons:**
- Violates our "we never see your content" privacy promise — the SDK processes chat content.
- Most PRC moderation SDKs transmit text to the vendor's cloud API for real-time assessment. This means user chat content goes to Alibaba/Tencent/etc. servers.
- Latency: moderation API adds 50–200ms per chunk, degrading streaming UX.
- SDK maintenance: must keep the SDK and its content rules updated as PRC policy changes.
- The CN build's privacy policy must explicitly disclose this data flow.

**Verdict:** Use only if Path A is unavailable. Disclose fully in CN privacy policy.

### Path C: Moderation proxy (Sunday Softworks operates PRC infra)

All CN user traffic routes through a PRC-hosted proxy operated by Sunday Softworks. The proxy runs moderation before forwarding to the user's gateway.

**How it works:**
- A Tencent Cloud / Aliyun server in mainland China acts as a WebSocket proxy.
- Every message (inbound and outbound) passes through a moderation layer.
- ClawBoy CN build connects to this proxy endpoint; the proxy forwards to the actual gateway.

**Pros:**
- We control the compliance layer end-to-end.

**Cons:**
- Destroys the "direct device-to-gateway, no intermediary" architecture.
- We see all user content — catastrophic privacy regression.
- Requires ongoing PRC server operation (~$200–500/month minimum), network reliability engineering, incident response.
- The proxy itself must be registered and compliant.
- Worst TCO and worst privacy profile of the three paths.

**Verdict:** Do not pursue unless both Path A and Path B are ruled out.

---

## The architectural seam

The `onMessageSegment` hook is already placed in `src/hooks/useChat.ts`. In the global build it is a no-op pass-through:

```typescript
// In onStreamChunk, just before appending text to the batch:
const filteredText = await onMessageSegment(text, { sessionKey: sk, role: 'assistant' });
if (!filteredText) return; // segment was blocked
```

Where `onMessageSegment` is:

```typescript
// Global build (region.ts: APP_REGION === 'global'):
export const onMessageSegment = async (text: string, _ctx: MessageSegmentContext): Promise<string | null> => text;

// CN build (injected via featureFlags or a DI mechanism):
export const onMessageSegment = async (text: string, ctx: MessageSegmentContext): Promise<string | null> => {
  return await cnContentFilter(text, ctx); // calls moderation SDK or proxy
};
```

The seam is designed for minimal performance impact in the global build — a direct function call that returns the string unchanged. For the CN build, the filter is injected without changing any other streaming code.

---

## AI-generated content labeling (separate from moderation)

The Generative AI Interim Measures also require AI-generated content to be visibly labeled. For the CN build, `MessageBubble.tsx` should display a small "AI生成" badge on assistant messages. This is a UI-only change, independent of which moderation path is chosen.

---

## Action Items

- [ ] **Decide: Path A vs. Path B** (Path A strongly recommended).
- [ ] If Path A: write content moderation obligation into publishing partner contract.
- [ ] If Path B: evaluate Alibaba Green SDK, IFLY SafeCheck SDK, and Tencent Tianyu SDK for: iOS compatibility, latency at p50/p99, data retention policies, pricing.
- [ ] Add "AI生成" label to `MessageBubble.tsx` behind `APP_REGION === 'cn'` flag (required regardless of moderation path).
- [ ] Draft CN-specific addendum to privacy policy disclosing whichever moderation path is chosen.

---

## References

- Generative AI Interim Measures (CAC, 2023): [https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)
- Alibaba Green (阿里云内容安全): [https://www.aliyun.com/product/lvwang](https://www.aliyun.com/product/lvwang)
- Tencent Tianyu (腾讯云天御): [https://cloud.tencent.com/product/tms](https://cloud.tencent.com/product/tms)
- Baidu Content Censor: [https://ai.baidu.com/tech/textcensoring](https://ai.baidu.com/tech/textcensoring)
