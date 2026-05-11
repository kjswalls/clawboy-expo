# ClawBoy — China App Store Readiness Overview

*Status: Pre-launch research track*
*Strategy: Launch U.S. first; pursue China App Store listing after completing all items in this document.*
*Last updated: May 10, 2026*

---

## Precedent: ClawPilot in the China App Store

**ClawPilot** (`apps.apple.com/cn/app/clawpilot/id6759454716`) is a direct OpenClaw thin-client app that is currently live in the China App Store. It was developed and published by **Yang Hangbin** (杨航彬), a single Chinese-citizen developer operating under `codeaddict.cn`. The same developer also operates **PocketClaw** (`apps.apple.com/app/id6759418062`), a relay-based OpenClaw variant.

ClawPilot's China listing proves several things that our initial worst-case analysis did not assume:

| Assumption we made | ClawPilot reality |
|---|---|
| Custom gateway URL must be hidden in CN build | ClawPilot explicitly advertises "直连自建服务器" (direct connection to self-hosted server) and survived review |
| Need WFOE or publishing agency | Single Chinese citizen filed 备案 under own 身份证 — no company required |
| Need CAC GenAI algorithm filing | No visible filing; thin-client framing appears to satisfy reviewers (risk remains — see below) |
| Need real-name account auth | No account at all — app collects only anonymous Identifiers + Diagnostics |
| Need PIPL localization of Supabase | No PII collected — zero PIPL obligation |

**Risk calibration note:** ClawPilot has 11 App Store ratings as of May 2026. Small, low-visibility apps receive less regulator scrutiny than large ones. This precedent is *defensible*, not *safe*. PRC enforcement is retroactive and discretionary. The lighter path is viable for launch but may need hardening as user count grows. The full compliance research in `02-generative-ai.md` and `04-content-moderation.md` remains valid for Phase 2.

---

## Strategic Context

ClawBoy is currently available in the U.S. App Store. Mainland China (China App Store, also called "中国区") requires a separate compliance track. This directory documents what is needed, in what order, and what architectural choices affect future optionality.

**Key constraint**: Sunday Softworks (Kirby Walls) is a California sole proprietorship with no Chinese business entity. The lightest path — an individual Chinese-citizen co-publisher — requires a trusted person in China willing to publish under their own name.

---

## Decision Required — Entity / Partner

Before any other China work can complete, this gate must be passed:

| Option | Pros | Cons | Estimated timeline |
|--------|------|------|--------------------|
| **Individual CN dev partner** ★ recommended | Lowest cost, fastest, proven by ClawPilot. Person files 备案 under own 身份证, no company needed. | Heavy trust burden — they are legal publisher of record. Revenue routes through their Apple Developer account. Exit risk if relationship sours. | Weeks once person identified |
| **Publishing partner** (AppInChina, GMP-Pacific, Genie, etc.) | They handle compliance; experience with foreign devs | Revenue share 15–30%, less control | 2–4 months |
| **Joint venture / known contact with company** | Trust + legal structure | More complex than pure individual partner | Varies |
| **Form WFOE** (Wholly Foreign-Owned Enterprise in China) | Full control, own ICP, direct compliance | Very expensive ($10K–$30K+), 3–6 months, requires local registered address + legal rep | 6–12 months total |

**Current status**: Exploring via personal contacts in China. No partner signed.

**Decision owner**: Kirby Walls
**Target decision date**: TBD

---

## The Six Blockers

| # | Blocker | Can be done without PRC entity? | Blocks China launch? | Deep-dive |
|---|---------|--------------------------------|----------------------|-----------|
| 1 | MIIT / ICP app filing | No — requires PRC-resident entity or partner | Yes — no filing = forced takedown | [01-miit-filing.md](01-miit-filing.md) |
| 2 | CAC Generative AI + algorithm filing | No — requires PRC entity; model must be registered | Yes (legally) — though thin-client framing is currently unenforced against small apps | [02-generative-ai.md](02-generative-ai.md) |
| 3 | Custom gateway URL (Apple China review pattern) | Yes (architectural only) | **Medium risk** — ClawPilot's CN listing shows custom gateway URL survives review when framed as self-hosted developer tool | [03-gateway-policy.md](03-gateway-policy.md) |
| 4 | Content moderation (real-time, AI output) | Partially (gateway-side path) | Yes (legally) — though thin-client framing is currently tolerated at small scale | [04-content-moderation.md](04-content-moderation.md) |
| 5 | Real-name authentication | Yes (technical work) | Moot if no account system in CN build (see Blocker 6 / Option C) | [05-real-name-auth.md](05-real-name-auth.md) |
| 6 | PIPL data localization (Supabase EU → PRC) | Yes (technical work) | **Eliminated** if CN build collects no PII (Option C — match ClawPilot's no-account model) | [06-pipl-data-localization.md](06-pipl-data-localization.md) |

---

## Decision Matrix

For each blocker, the decision needed and current status:

| Blocker | Decision needed | Status |
|---------|----------------|--------|
| Entity/partner | Individual CN dev vs. publishing agency vs. WFOE | **Open** — no partner signed |
| MIIT filing | Which person/entity files | **Blocked** by entity decision |
| GenAI filing | Accept thin-client risk now / escalate in Phase 2 | **Open** — seam in code, risk documented in `02-generative-ai.md` |
| Custom gateway URL | Keep custom URL (ClawPilot pattern, medium risk) vs. restrict to vendored gateways | **Open** — `ALLOW_CUSTOM_GATEWAY_URLS` flag ready in code |
| Content moderation | Accept thin-client risk now / escalate in Phase 2 | **Open** — no-op seam in code, paths in `04-content-moderation.md` |
| Real-name auth | Skip entirely (Option C in `06`) vs. add phone+SMS | **Open** — depends on account strategy |
| PIPL localization | Option C (no PII, no obligation) vs. Standard Contract vs. PRC backend | **Leaning Option C** — match ClawPilot pattern |

---

## Architectural Guardrails (already in codebase)

The following are already implemented as part of this work. They do not change U.S. behavior but leave China doors open:

| Guardrail | File | Notes |
|-----------|------|-------|
| `APP_REGION` build flag | `src/constants/region.ts` | `'global'` for U.S. build. CN build sets `'cn'`. |
| Region-gated feature flags | `src/constants/featureFlags.ts` | `ALLOW_CUSTOM_GATEWAY_URLS`, `ALLOW_THIRD_PARTY_SIGNIN`, `ENABLE_CONTENT_MODERATION`, `REQUIRE_REAL_NAME_AUTH` |
| `GatewayPolicy` type on `ServerProfile` | `src/types/index.ts` | `allowedModelPatterns`, `requireServerSideContentFilter`, `region` — decorative in global build |
| `onMessageSegment` seam | `src/hooks/useChat.ts` | No-op pass-through in global build; CN build can insert content filter |

---

## Recommended Sequence

### Phase 1 — Lightest viable CN launch (ClawPilot pattern)

1. **Identify individual CN dev partner** — trusted person willing to publish under their 身份证. This is the single gate. See `01-miit-filing.md` Option D.
2. **File MIIT 备案** via that individual (weeks, not months). See `01-miit-filing.md`.
3. **Build CN EAS profile** using `EXPO_PUBLIC_REGION=cn` — strips account system, no Supabase sign-in, no PII collected. Custom gateway URL kept (same as ClawPilot). See `06-pipl-data-localization.md` Option C.
4. **Frame gateway in Chinese review notes** as "self-hosted developer tool / 自建服务器" — consistent with how ClawPilot describes it.
5. **Submit CN build to Apple** after 备案 number confirmed in writing.

### Phase 2 — Hardening as scale grows

6. **Address GenAI algorithm filing** — if CAC enforcement increases or user count crosses 100K. See `02-generative-ai.md`.
7. **Add content moderation** — partner gateway path preferred. See `04-content-moderation.md`.
8. **Add account system** (real-name auth + PRC-region backend) if premium features needed for CN users. See `05-real-name-auth.md` + `06-pipl-data-localization.md` Option B.

---

## Regulatory References

| Regulation | Chinese name | Effective | Summary |
|---|---|---|---|
| App Store ICP Filing Requirement | APP备案管理办法 | Sep 1, 2023 | All apps on China App Store must have MIIT 备案 number. |
| Generative AI Service Management Interim Measures | 生成式人工智能服务管理暂行办法 | Aug 15, 2023 | LLM services to PRC public must file with CAC; models must be assessed. |
| Algorithm Recommendation Management Provisions | 互联网信息服务算法推荐管理规定 | Mar 1, 2022 | Recommender/generative algorithms must be filed with MIIT/CAC. |
| Cybersecurity Law | 网络安全法 | Jun 1, 2017 | Requires security assessments, incident reporting, data localization. |
| Personal Information Protection Law (PIPL) | 个人信息保护法 | Nov 1, 2021 | GDPR-equivalent; cross-border transfer rules stricter than EU SCCs. |
| Data Security Law | 数据安全法 | Sep 1, 2021 | Data classification, security obligations, cross-border restrictions. |
| Network Product Security Review | 网络安全审查办法 | Feb 15, 2022 | Applies to operators using foreign tech with large-scale PRC user data (>1M users). Likely does not apply at ClawBoy's current scale. |

---

## How to Use This Directory

Each file `01-*.md` through `06-*.md` is a self-contained deep dive on one blocker. Use them as:
- A brief for conversations with potential Chinese publishing partners.
- A technical spec for the engineering work required per blocker.
- A checklist item tracker — check off sub-items as work completes.

This overview (`00-overview.md`) is the entry point. Update it when decisions are made.
