# Blocker 6 — PIPL Data Localization (个人信息保护法)

*Status: Option C (minimize collection) is the recommended primary path — matches ClawPilot precedent*
*Last updated: May 10, 2026*

---

## What is this?

China's **Personal Information Protection Law (PIPL / 个人信息保护法)** took effect November 1, 2021. It is functionally stricter than GDPR on cross-border data transfer.

**Current architecture:** Account data (email, Supabase UUID, entitlements, server profile pointers) is stored on Supabase's EU region (`esgqjzzhytxdkdwkguws.supabase.co` — Frankfurt). This is outside mainland China.

**PIPL problem:** Exporting personal data of PRC residents to non-PRC jurisdictions without a legal basis is a violation. The law provides three legal bases for cross-border transfer:
1. **CAC Security Assessment** (required if: >1M users' data, or data is deemed "important data")
2. **Standard Contract** (SCCs equivalent — filed with CAC; feasible for small operators)
3. **Personal Information Protection Certification** (issued by CAC-authorized body)

**Practical status:** For very small operators (pre-launch, <10K PRC users), CAC enforcement has focused on large platforms. However, launching an app in China without any PIPL mechanism in place is a compliance gap that will need to be closed before significant scale.

---

## What data is affected?

| Data | Where stored now | PIPL-sensitive? |
|------|-----------------|-----------------|
| Email address | Supabase EU | Yes (contact info, PII) |
| Supabase UUID | Supabase EU | Yes (unique identifier) |
| Entitlement tier | Supabase EU | Marginal (not sensitive on its own, but linked to UUID) |
| Server profile pointers (gateway URL + label) | Supabase EU | Marginal (not typically PII, but linked) |
| Cosmetic unlocks / achievements | Supabase EU | Low sensitivity |
| Phone number (if real-name auth added) | Supabase EU | **Yes — highly sensitive under PIPL** |
| WeChat OpenID (if WeChat auth added) | Supabase EU | Yes (unique identifier) |

Chat content, gateway credentials, and the Ed25519 keypair are **never on our servers** — no PIPL issue there.

---

## Options for PIPL compliance

### Option A: Standard Contract filing (SCCs-equivalent)

For operators not meeting the "major operator" threshold (<1M PRC users, no "important data"), PIPL's Standard Contract is the practical path:

1. Execute the CAC Standard Contract with Supabase Inc. (Supabase is our data processor).
2. File the contract with the CAC (Cyberspace Administration of China) at [https://picp.cac.gov.cn](https://picp.cac.gov.cn) — the PIPL Standard Contract Filing System.
3. Ensure the contract covers: data categories, transfer purpose, data subject rights, return/deletion on request.

**Requirements:**
- PRC entity (the entity is the "personal information handler" required to file)
- Contract executed with Supabase Inc. (Supabase as the overseas recipient)
- Data Protection Impact Assessment (DPIA) of the transfer

**Pros:** No infra changes; Supabase EU can remain the storage backend.
**Cons:** Requires PRC entity; DPIA overhead; must keep contract and filing current as PRC user count grows.

### Option B: PRC-region database (data localization)

Stand up a Supabase-compatible database inside mainland China. PRC user data never leaves China.

**Candidate platforms:**

| Platform | Notes |
|---|---|
| **Tencent Cloud PostgreSQL** | Managed PostgreSQL in Beijing/Shanghai; Supabase schema compatible; RLS via PostgreSQL |
| **Alibaba Cloud PolarDB-PG** | PostgreSQL-compatible managed DB; strong in China |
| **Supabase on Tencent Cloud** | Supabase has a reseller/partner arrangement; self-hosted Supabase stack possible on Tencent Cloud VMs |
| **Fly.io (HKG region)** | Hong Kong is not mainland China — does not satisfy PRC data localization for mainland users, but is fine for HK/TW/SG |

**Implementation:**
- Deploy a Supabase-compatible GoTrue (auth) + PostgreSQL (data) stack on Tencent Cloud or Aliyun.
- The EAS CN build sets `EXPO_PUBLIC_SUPABASE_URL` to the PRC-region endpoint.
- Schema is identical to the EU Supabase — migration scripts are portable.
- PRC users create accounts on the PRC backend. Global users remain on the EU backend.

**Pros:** Cleanest PIPL compliance; no ongoing CAC filing; faster latency for PRC users.
**Cons:** Ongoing server cost ($100–300/month minimum); two separate Supabase instances; need PRC ICP for the server; account portability between PRC and global is difficult (separate UUIDs).

### Option C: Minimize PRC user data collection ★ recommended primary path

**Precedent:** ClawPilot (`apps.apple.com/cn/app/clawpilot/id6759454716`) is live in the China App Store with **no account system at all**. Its Apple privacy label reads "未与你关联的数据" (data not linked to your identity) — only anonymous Identifiers and Diagnostics. Zero PIPL obligation, zero localization work, and it is currently shipping.

The least data you collect from PRC users, the lower the PIPL exposure. For the initial CN build:
- Do not offer sign-in — no Supabase, no Apple/Google/email auth in CN build.
- Entitlements managed locally via RevenueCat receipt verification only. RevenueCat can validate StoreKit receipts and return entitlement status without a Supabase account being linked. Purchase restoration works via Apple's receipt — same as ClawPilot's ¥28 buyout model.
- No account, no email, no UUID → nothing to localize → zero PIPL filing obligation.
- The `ALLOW_THIRD_PARTY_SIGNIN = false` feature flag (already in `src/constants/featureFlags.ts`) hides all sign-in UI in CN build.

**Pros:** Zero PIPL exposure; zero infrastructure work; fastest path to CN launch; matches live competitive precedent.
**Cons:** No cross-device sync; no purchase restoration via account (Apple receipt only); limits premium account-dependent features for CN users.

---

## The `EXPO_PUBLIC_SUPABASE_URL` is already env-driven

In `app.json`:
```json
"extra": {
  "supabaseUrl": "https://esgqjzzhytxdkdwkguws.supabase.co"
}
```

The EAS CN build profile would override:
```json
"extra": {
  "supabaseUrl": "https://[cn-region-supabase-compatible-url]"
}
```

No code changes are needed for this swap — `supabaseUrl` is already read from `Constants.expoConfig.extra.supabaseUrl` in the Supabase client initialization. The URL is never hard-coded in application logic. This was confirmed as part of this plan's review.

---

## Recommended path

**Primary path — Option C (no account, match ClawPilot model):** Strip Supabase sign-in from the CN build entirely. Collect only Apple-provided Identifiers and standard Diagnostics. Zero cross-border PII transfer means zero PIPL filing obligation. RevenueCat receipt verification still works for purchase restoration without a Supabase account. This is the fastest, lowest-risk path and has direct precedent in the same app category.

**Phase 2 (when CN revenue justifies account features):** Option B (PRC-region Supabase-compatible stack on Tencent Cloud). Enables full account sync, achievements, and premium features for PRC users. Requires PRC entity + ongoing infra cost.

**Option A (Standard Contract)** is a viable bridge between Phase 1 and Phase 2 if users need some account functionality before the PRC backend is ready — but only after PRC entity is secured.

---

## PIPL user rights obligations (all paths)

Regardless of storage location, PIPL grants PRC users:
- Right to access their personal data
- Right to correct inaccurate data
- Right to delete personal data
- Right to withdraw consent
- Right to explanation of automated decisions

These are already substantially covered by ClawBoy's existing privacy policy (§8 "Your rights") and the Settings → Account → Delete Account path. The CN privacy policy should explicitly cite PIPL and the relevant article numbers.

---

## Action Items

- [x] **Decision made: Option C for initial CN launch** — match ClawPilot's no-account model. Zero PIPL obligation.
- [ ] Verify RevenueCat can validate receipts and return entitlement tier without a linked Supabase user (anonymous mode). Confirm `ALLOW_THIRD_PARTY_SIGNIN = false` (already set by feature flag in CN build) fully suppresses all sign-in UI.
- [ ] Write CN-specific app privacy label for App Store Connect: "数据未关联身份" (data not linked to identity) — Identifiers and Diagnostics only, matching ClawPilot's label.
- [ ] Write CN-specific privacy policy addendum (brief — minimal since no PII collected) citing PIPL and identifying the data handler (the individual CN dev partner).
- [ ] Confirm `EXPO_PUBLIC_SUPABASE_URL` is never hard-coded in non-`app.json` config files. (Checked — it is not.)
- [ ] Phase 2: evaluate Tencent Cloud PostgreSQL vs. self-hosted Supabase on Tencent Cloud VMs when account features needed for CN users.

---

## References

- ClawPilot China listing (precedent — no-account model): [https://apps.apple.com/cn/app/clawpilot/id6759454716](https://apps.apple.com/cn/app/clawpilot/id6759454716)
- PIPL full text (Chinese): [http://www.npc.gov.cn/npc/c30834/202108/a8c4e3672c74491a80b53a172bb753fe.shtml](http://www.npc.gov.cn/npc/c30834/202108/a8c4e3672c74491a80b53a172bb753fe.shtml)
- CAC PIPL Standard Contract Filing System: [https://picp.cac.gov.cn](https://picp.cac.gov.cn)
- CAC Standard Contract template (2023): [https://www.cac.gov.cn/2023-02/24/c_1679305244164672.htm](https://www.cac.gov.cn/2023-02/24/c_1679305244164672.htm)
- Tencent Cloud PostgreSQL: [https://cloud.tencent.com/product/postgres](https://cloud.tencent.com/product/postgres)
- Alibaba Cloud PolarDB-PG: [https://www.alibabacloud.com/product/polardb](https://www.alibabacloud.com/product/polardb)
