# Blocker 3 — Custom Gateway URL Pattern (Apple China Review Risk)

*Status: Medium risk — precedent exists; policy decision needed for CN build*
*Last updated: May 10, 2026*

---

## What is this?

Apple's China App Store review has historically applied additional scrutiny to apps that let users enter arbitrary backend URLs, because this pattern overlaps with VPN clients and proxy/circumvention tools — all heavily restricted in mainland China.

ClawBoy's core UX — "enter your gateway URL and token" — shares surface similarities with this pattern.

**However:** ClawPilot (`apps.apple.com/cn/app/clawpilot/id6759454716`), a direct OpenClaw thin-client app with an identical "enter your gateway URL" flow, is currently live in the China App Store. It explicitly advertises "直连自建服务器" (direct connection to self-hosted server). This is concrete evidence that the custom-gateway-URL pattern can survive China review when the app is clearly framed as a self-hosted developer tool, not a VPN or proxy.

This changes the risk classification of this blocker from **high** to **medium**. The risk is not zero — Apple's China review is opaque and can change retroactively — but it is no longer a presumptive blocker.

---

## The two paths

### Path A: Keep custom gateway URL (ClawPilot pattern) ★ recommended for initial CN launch

Leave `ALLOW_CUSTOM_GATEWAY_URLS = true` in the CN build. Users enter their own gateway URL exactly as in the global build.

**Risk:** Medium. ClawPilot demonstrates survival; Apple review is not deterministic.

**Mitigations to apply in the CN build:**
1. **In-app framing:** All UI copy referring to the gateway should use "你自己的服务器" / "self-hosted server" language, never "connect to any AI service" or "AI proxy."
2. **App description on China storefront:** Describe as a "self-hosted server management tool" (自建服务器管理工具) matching ClawPilot's language.
3. **Review notes:** State clearly "This app connects only to servers configured by the user. No content is relayed through or processed by the app publisher. The gateway is the user's own server."
4. **Category:** File under 工具 (Tools), same as ClawPilot — not AI or Entertainment.

**What to do if rejected on this basis:**
- First: resubmit with strengthened review notes emphasizing self-hosted server nature.
- Second: appeal citing that apps with identical architecture (ClawPilot ID: 6759454716) are live in the China storefront.
- Third: escalate to Path B.

### Path B: Restrict to vendored gateways only (lower risk, larger UX cost)

Set `ALLOW_CUSTOM_GATEWAY_URLS = APP_REGION !== 'cn'` (the flag is already wired this way in `src/constants/featureFlags.ts`). In the CN build, the URL input is hidden; only pre-approved partner gateway(s) are offered via a picker.

**Risk:** Lower — removes the "arbitrary URL" surface entirely.

**Cost:** Eliminates the "bring your own gateway" value prop in China. Users are locked into a partner gateway. Requires a working partner gateway (see `02-generative-ai.md`) before this path is viable.

**When to use Path B:** Only if Path A is rejected by Apple after a resubmission attempt, or if a compliant partner gateway is already available and preferred for other compliance reasons (content moderation, CAC model registration).

---

## The architectural guardrail (unchanged)

The `ALLOW_CUSTOM_GATEWAY_URLS` feature flag in `src/constants/featureFlags.ts` is already the right seam regardless of which path is chosen:

```typescript
// Path A (recommended): leave true in CN build
export const ALLOW_CUSTOM_GATEWAY_URLS: boolean = APP_REGION !== 'cn'; // set to true for CN

// Path B (fallback): flag activates vendored-gateway mode
export const ALLOW_CUSTOM_GATEWAY_URLS: boolean = APP_REGION !== 'cn'; // keeps false for CN
```

For Phase 1 (Path A), this flag stays `true` in the CN build — just set `APP_REGION !== 'cn'` to always return `true`, or simplify to `export const ALLOW_CUSTOM_GATEWAY_URLS = true`. The flag remains useful for future escalation to Path B without a code refactor.

---

## Files affected when implementing CN build (Path A — minimal change)

| File | Change |
|------|--------|
| `src/constants/featureFlags.ts` | Keep `ALLOW_CUSTOM_GATEWAY_URLS = true` for CN build in Phase 1 |
| `src/i18n/locales/zh-CN/common.json` | Audit all gateway-related copy to use 自建服务器 framing |
| App Store Connect (CN listing) | Description, keywords, review notes use self-hosted server language |

No structural onboarding or UI changes needed for Path A.

## Files affected when implementing CN build (Path B — if Path A rejected)

| File | Change |
|------|--------|
| `src/components/settings/AddServerSheet.tsx` | Gate URL input field on `ALLOW_CUSTOM_GATEWAY_URLS` |
| `src/components/onboarding/OnboardingScreen.tsx` | Skip "enter URL" step for CN; show gateway picker |
| `src/hooks/useServerConfig.tsx` | Pre-populate CN gateway profiles on first launch |
| `src/types/index.ts` | Add `'cn-managed'` to `ServerProfile.kind` |
| `src/constants/featureFlags.ts` | `ALLOW_CUSTOM_GATEWAY_URLS = false` for CN build |

---

## Action Items

- [ ] **Phase 1:** Proceed with Path A (custom URL kept). Audit zh-CN locale strings for gateway framing.
- [ ] Prepare CN App Store review notes emphasizing self-hosted server nature (add to `docs/legal/app-review-notes.md` CN section when written).
- [ ] Monitor ClawPilot's China listing — if it gets pulled, escalate to Path B immediately.
- [ ] If Apple rejects the CN submission citing Guideline 4.7 or 5.4: attempt Path A resubmission with stronger framing before switching to Path B.
- [ ] If Path B becomes necessary: add `'cn-managed'` kind to `ServerProfile` type and implement gateway picker UI.

---

## References

- ClawPilot China listing (precedent): [https://apps.apple.com/cn/app/clawpilot/id6759454716](https://apps.apple.com/cn/app/clawpilot/id6759454716)
- Apple Guideline 4.7: [https://developer.apple.com/app-store/review/guidelines/#third-party-software](https://developer.apple.com/app-store/review/guidelines/#third-party-software)
- Apple Guideline 5.4 (VPN): [https://developer.apple.com/app-store/review/guidelines/#vpn-apps](https://developer.apple.com/app-store/review/guidelines/#vpn-apps)
