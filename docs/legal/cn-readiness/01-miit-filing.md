# Blocker 1 — MIIT / ICP App Filing (APP备案)

*Status: Blocked pending entity/partner decision*
*Last updated: May 10, 2026*

---

## What is this?

Since September 1, 2023, every mobile app distributed in mainland China (including the China App Store) must have a registered 备案 (bèi'àn) number issued by the Ministry of Industry and Information Technology (MIIT / 工业和信息化部). Without this filing, Apple China will pull the app or refuse to list it.

This is separate from and in addition to:
- ICP 经营许可证 (required for internet services operating commercially in China — may apply if we monetize in China)
- Network Security License (for sensitive data industries — likely not applicable)
- The algorithm and generative AI filings covered in `02-generative-ai.md`

---

## Who can file?

The filing must be made by a **PRC-resident individual or entity**. Importantly, MIIT's APP备案 system accepts filings from **individual Chinese citizens** (自然人) as well as companies. This is the key insight from ClawPilot's successful China listing.

### Option D: Individual CN dev partner ★ recommended for initial launch

A trusted Chinese citizen publishes the app under their own name and files 备案 using their 居民身份证 (national ID card). No company formation required.

**Precedent:** ClawPilot (`apps.apple.com/cn/app/clawpilot/id6759454716`) is live in the China App Store published by **Yang Hangbin** (杨航彬), an individual developer, with no company listed. This proves individual-dev 备案 works for an OpenClaw thin-client app.

**Pros:**
- Lowest cost — zero entity formation fee
- Fastest — weeks once the person is identified, not months
- Proven by direct precedent in the same app category
- No ongoing compliance overhead of running a Chinese company

**Cons:**
- Heavy trust burden — they are the legal publisher of record in China; Apple's App Store Connect account must be theirs or authorized to them
- Revenue routing — IAP revenue flows through their Apple Developer account initially; a written revenue-sharing agreement is essential
- Exit risk — if the relationship sours, switching publisher requires a new App Store listing with a new app ID (loss of ratings/reviews)
- They bear legal liability for any PRC compliance issues

**Contractual protections required (written agreement before listing):**
- You retain all IP
- They cannot publish updates without your signed approval
- Revenue remittance schedule and method
- Dispute resolution and exit procedure (IP reversion to you on termination)
- Their liability limited to their own acts; your indemnity for product liability

**Individual 备案 document checklist:**

| Document | Notes |
|---|---|
| 居民身份证 (National ID card) | Front and back. Person must be PRC citizen with valid ID. |
| App name | Exact name in Chinese (ClawBoy → "ClawBoy 小龙虾助手" or similar) |
| App description | Functional description in Mandarin, ≤200 characters |
| App icon | 512×512 px PNG |
| Screenshots | At least 3 screenshots of main functionality |
| Bundle identifier / App Store ID | `com.sundaysoftworks.clawboy` |
| Server location attestation | Describe backend: "App connects to user's own self-hosted server. No server operated by the publisher." |
| App category | 工具 (Tools) — same as ClawPilot |
| Contact information | Partner's phone number and email |

### Option A: Publish under a Chinese publishing partner

A Chinese app publishing company holds the ICP qualification and files on our behalf as the nominal publisher.

**Known agents / platforms with a track record of foreign app distribution:**

| Company | Services | Typical revenue share | Notes |
|---|---|---|---|
| AppInChina | App filing, distribution to Huawei/Xiaomi/etc., Apple China 备案 | ~20–25% of China revenue | English-friendly, has helped foreign devs |
| GMP-Pacific | Full publishing, marketing, localization | ~25–30% | Focuses on mid-size apps/games |
| Genie (基尼网络) | Filing-only or full-service | Varies | Smaller, faster turnaround claim |
| TechNode Global | Consulting, introductions | Fee-based | Does not publish directly |

> **Important**: When using a publishing partner, they become the 备案主体 (filing entity). From Apple's perspective, they are the publisher. Vet carefully — a bad partner can publish malicious updates or pull the app without your consent. Always contract for: app binary approval rights, no unauthorized updates, reversion of IP on termination.

### Option B: Form a WFOE in China

A Wholly Foreign-Owned Enterprise is a Chinese legal entity 100% owned by a foreign company or individual.

**Realistic cost:** $8,000–$25,000 USD setup. Ongoing accounting/compliance: $2,000–$5,000/year.

**Realistic timeline:** 3–6 months for entity formation; 备案 can be filed concurrently after license obtained.

**Service providers:** Dezan Shira & Associates, China Briefing, Horizons (formerly Global PEO Services).

---

## What does the 备案 filing require?

The filing through the MIIT 备案 system (beian.miit.gov.cn / APP备案系统):

**Filing portal:** [https://beian.miit.gov.cn](https://beian.miit.gov.cn) (Chinese language, requires PRC login)

**Timeline once filer is ready:** 3–20 business days for 备案 approval.

---

## Apple's specific requirement

Apple requires the 备案 number to be registered in App Store Connect before the app can appear in the China storefront:

1. The filing entity must match the App Store Connect developer account (or be authorized).
2. The 备案 number format is `粤ICP备XXXXXXXX号` (province prefix + ICP + number, or APP备XXXXXXXX号 for app-specific filings).
3. Enter the number in App Store Connect → App Information → ICP Filing Number.

Apple has stated it will **remove existing apps** that do not have a filing number. There is no grandfather clause.

---

## Recommended path for ClawBoy

**Option D first** — ClawPilot demonstrates that a trusted individual Chinese-citizen co-publisher is the fastest and lowest-cost path for an app of this type. The trust requirement is high but manageable with a clear written agreement.

1. **Identify a trusted individual** among personal contacts in China who is willing to publish under their own name. This is the single gate.

2. **Draft and sign a written co-publishing agreement** before any Apple account activity. Cover: IP ownership, update approval rights, revenue split, exit procedure.

3. **If no suitable individual contact**, fall back to **Option A** (AppInChina as the most English-friendly commercial option).

4. **Do not form a WFOE** unless China revenue materially justifies it (typically ≥ $50K/year China-specific revenue). The overhead is not proportionate for an initial launch.

---

## Action Items

- [ ] List personal contacts in China willing and able to be a co-publisher (individual, PRC citizen, active Apple Developer account or willing to create one).
- [ ] Draft a one-page ClawBoy brief in Mandarin to share with candidates.
- [ ] Prepare written co-publishing agreement template (consult a lawyer familiar with China/US cross-border agreements).
- [ ] Request AppInChina's current terms sheet as a benchmark if individual path stalls.
- [ ] Once partner identified: collect ID documents, begin 备案 filing.
- [ ] Record the 备案 number in `00-overview.md` when obtained.

---

## References

- MIIT APP备案管理办法: [https://www.miit.gov.cn](https://www.miit.gov.cn)
- Apple's ICP filing requirement notice (2023): [https://developer.apple.com/support/china-app-store/](https://developer.apple.com/support/china-app-store/)
- ClawPilot China listing (precedent): [https://apps.apple.com/cn/app/clawpilot/id6759454716](https://apps.apple.com/cn/app/clawpilot/id6759454716)
- AppInChina service overview: [https://appinchina.co](https://appinchina.co)
