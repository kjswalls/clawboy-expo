# Measurement Playbook

How we learn about ClawBoy's audience and usage **without** breaking our no-telemetry posture.

## Privacy guarantee — read this first

ClawBoy ships zero analytics SDKs, zero crash reporters, zero third-party telemetry. This is a code-backed promise, not marketing:

- `app.json` sets `NSPrivacyTracking: false` in the iOS privacy manifest.
- [PrivacySecurityCard.tsx:61](../src/components/settings/about/PrivacySecurityCard.tsx#L61): "No off-device analytics, telemetry, or behavioral tracking."
- [ThreatModelCard.tsx:22](../src/components/settings/about/ThreatModelCard.tsx#L22): "No analytics SDKs, no crash reporters, no third-party telemetry of any kind."
- [ThreatModelCard.tsx:63-64](../src/components/settings/about/ThreatModelCard.tsx#L63-L64): we promise not to upload crash reports / analytics without opt-in, and not to ship ad / analytics / fingerprinting SDKs.
- [SECURITY.md](../SECURITY.md): "Auth tokens and device keys are stored in `expo-secure-store` exclusively — never `AsyncStorage`, never console.log, never analytics."

**This doc is about data the platforms give us and data users hand us deliberately.** It is not a license to add tracking. If you find yourself wanting a metric this doc says we can't get, the right move is to talk to a user, not to add an SDK. See the [decision log](#decision-log) at the bottom before re-litigating.

---

## At a glance

| Source | What you learn | Free? | Code change required? |
|---|---|---|---|
| App Store Connect | iOS downloads, sessions, retention, crashes, reviews | Yes | No |
| Google Play Console | Android installs, vitals, reviews | Yes | No |
| RevenueCat | Trials, conversions, MRR, churn | Yes (existing) | No |
| Supabase | Signups, account-level activity | Yes (existing) | No |
| In-app feedback → GitHub Issues | Free-text bug reports, feature requests | Yes (existing) | No |
| Store reviews + community | Qualitative "what people like" | Yes | No |

---

## 1. App Store Connect (iOS)

URL: https://appstoreconnect.apple.com → your app → **Analytics** (and **App Analytics** for the deeper view).

**Tabs and what they cover:**

- **Acquisition** — impressions, product page views, conversion rate, source type (App Store search vs. browse vs. external referrer vs. web referrer). The single most useful number for "how many people are finding us."
- **Engagement** — sessions, active devices, daily / weekly / monthly active devices, retention curves (D1 / D7 / D30 by acquisition cohort).
- **Quality** — crashes and hangs. Important caveat: Apple only shows crash data from users who left "Share with App Developers" enabled in iOS Settings → Privacy & Security → Analytics & Improvements. Numbers undercount by a lot.
- **Sales and Trends** (separate top-level area) — proceeds, refunds, units. Overlaps with RevenueCat; RevenueCat is friendlier.
- **Ratings and Reviews** — per-version, per-country. Primary qualitative signal. Reply to reviews from here.

**Cadence:** weekly skim for downloads + reviews, monthly deep-dive for retention curves.

**What it won't tell you:** which screens users visit, where they drop off, per-feature engagement. Apple aggregates everything; there's no event funnel.

---

## 2. Google Play Console (Android)

URL: https://play.google.com/console → your app.

**Sections:**

- **Statistics** — installs, uninstalls, active devices, retention, by country / device / OS.
- **Android vitals** — crashes, ANRs, slow rendering, excessive wakeups, frozen frames. More complete than Apple's crash data because Play collects vitals by default for most users.
- **Ratings** + **Reviews** — per-version, with reply.
- **Acquisition reports** → traffic sources, conversion funnel (store listing visitor → installer).

**Cadence:** same as iOS — weekly skim, monthly deep-dive.

**What it won't tell you:** same blind spot as iOS (no in-app event funnel).

---

## 3. RevenueCat

URL: https://app.revenuecat.com. Already wired via `react-native-purchases`.

**Useful views:**

- **Charts** → MRR, ARR, active subscriptions, trials started, trial conversions, refunds, churn rate.
- **Cohorts** → retention of paying users by signup month — answers "do people who pay in month X still pay in month X+3?"
- **Customers** → per-anonymous-user purchase history. For support questions, not for behavioral analysis.

**Cadence:** weekly for the revenue trend chart, monthly for cohort retention.

**What it won't tell you:** anything about free-tier users. RevenueCat only sees identities that touched a purchase flow.

---

## 4. Supabase

URL: the Supabase project dashboard (project ref: `esgqjzzhytxdkdwkguws`).

**Useful views:**

- **Authentication → Users** → signups over time, total registered accounts, sign-in method breakdown.
- **Database → SQL editor** → ad-hoc counts. Examples:
  - DAU: `select count(*) from auth.users where last_sign_in_at >= now() - interval '1 day';`
  - Signup velocity by week: `select date_trunc('week', created_at) as wk, count(*) from auth.users group by wk order by wk;`
- **Logs → API / Auth / Postgres** → error rates, abuse signals, rate-limit hits.

**Cadence:** monthly, or when investigating a spike or a user-reported outage.

**Privacy framing:** aggregate counts derived from auth events are not "tracking" in the App Store Connect or App Tracking Transparency sense — they're a byproduct of the account system, which exists for entitlements. **Do not** add behavioral logging columns (last_screen, feature_used, etc.) to user tables. If we ever need that, it's an opt-in toggle conversation, not a quiet schema change.

**What it won't tell you:** anything that happens inside the app between sign-in events.

---

## 5. User-initiated feedback

Existing pipeline: [submitFeedback.ts](../src/lib/feedback/submitFeedback.ts) → [feedback-worker](../infra/feedback-worker/) → GitHub Issues.

- **What we receive:** only what the user typed, plus context (last crash, app version, device) they explicitly consented to attach.
- **Where it lands:** GitHub Issues on the app repo. Triage weekly.
- **Suggested workflow:** label inbound feedback with `source:in-app-feedback` so it's distinguishable from external issue filings.
- **Idea backlog (not implemented):** periodic opt-in NPS prompt, structured feature-request form, native rating prompt via `expo-store-review`. Track in GitHub if/when prioritized — do not silently add.

---

## 6. External qualitative channels

- **App Store + Play Store reviews** — covered above; treat as the primary "what they like / hate" surface.
- **GitHub Issues / Discussions** on the public repo.
- **Community channels** (Discord, etc.) — add links here when they exist.

---

## What we deliberately cannot answer

This list is here so we don't quietly drift. The privacy posture costs us:

- Which screens users visit most
- Where users drop off in onboarding
- Per-feature engagement / "what they like" beyond reviews and feedback
- Session length, time-in-app, time-of-day patterns
- A/B test outcomes
- Cohort behavior beyond paying users (RevenueCat) and signed-in users (Supabase)

This is the price of the claim. The path to changing it is intentionally high-friction:

1. Rewrite [PrivacySecurityCard.tsx](../src/components/settings/about/PrivacySecurityCard.tsx) and [ThreatModelCard.tsx](../src/components/settings/about/ThreatModelCard.tsx) — these are user-facing promises.
2. Update [SECURITY.md](../SECURITY.md).
3. Update `app.json` privacy manifest if any tracking domain is introduced.
4. Add an opt-in toggle in Settings, default **off**, with clear copy.
5. Update the App Store / Play Store privacy nutrition labels.
6. Pick a privacy-respecting backend (self-hosted PostHog or Plausible, never a third-party SaaS that re-sells data).
7. Log a [decision-log entry](#decision-log) explaining why the previous answer changed.

If a metric you want isn't worth all seven of those steps, it isn't worth adding.

---

## Decision log

Append-only record of measurement-related decisions. Use this instead of re-debating in Slack / PR threads.

**Template:**

```
### YYYY-MM-DD — short title
Question: <what came up>
Decision: <what we chose>
Why: <constraints, who pushed back, what trade-off we accepted>
Revisit when: <signal that would reopen this>
```

**Entries:**

### 2026-05-26 — Initial playbook
Question: How do we learn about downloads and usage after the App Store launch, given our no-telemetry stance?
Decision: Platform dashboards + existing in-app feedback only. No analytics SDK, no behavioral logging added to Supabase.
Why: Public privacy claims in PrivacySecurityCard / ThreatModelCard / SECURITY.md are explicit and code-backed; breaking them would cost more reputation than we'd gain from behavioral data at current scale.
Revisit when: We need to make a real product-direction call that platform aggregates + reviews + feedback can't inform — e.g. a feature that's clearly underused but we can't tell whether it's discoverability vs. desirability.
