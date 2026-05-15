# App Store Connect — Privacy Nutrition Label Reference

*Use this document when completing the Privacy section in App Store Connect (App Information → App Privacy). The selections here must remain consistent with the Privacy Policy at `docs/legal/privacy-policy.md` and with the bundled iOS `PrivacyInfo.xcprivacy` (declared via `expo.ios.privacyManifests` in `app.json`). Review this file whenever data practices change.*

*Last reviewed: May 13, 2026*

---

## Build variants

| Variant | When | RevenueCat / StoreKit | `PrivacyInfo.xcprivacy` collected types |
|---------|------|----------------------|----------------------------------------|
| **Launch (IAP deferred)** | `PURCHASES_ENABLED === false` in [`src/constants/featureFlags.ts`](../../src/constants/featureFlags.ts) — current App Store launch | Not initialized; no purchases or RC user id | Email Address, User ID only |
| **IAP-enabled** | After `PURCHASES_ENABLED` is set `true` and production keys ship | Active | Add **Purchase History** (see [IAP post-launch checklist](iap-post-launch-checklist.md)) |

---

## App Store Connect — launch submission (IAP off)

Complete these steps in **App Store Connect → App Information → App Privacy** before submitting the first public build that does **not** ship in-app purchases:

1. For **Purchase History** (under Purchases): select **Data Not Collected** (or the equivalent that indicates this data type is not collected by this app version).
2. For **Email Address**: collected **only** when the user signs in → **Yes**, linked to the user, not used for tracking, purpose **App Functionality**.
3. For **User ID** (Supabase account id when signed in): **Yes**, linked, not used for tracking, purpose **App Functionality**.
4. Confirm **all other** Apple categories remain **Not Collected** per the per-category tables below (launch column).

After enabling IAP in a future binary, update the questionnaire again and align `app.json` → `expo.ios.privacyManifests` per [`docs/legal/iap-post-launch-checklist.md`](iap-post-launch-checklist.md).

---

## How to read this document

For each Apple category, this file records:

- **Collected?** — whether the app collects this data type at all.
- **Linked to identity?** — whether Apple should ask "linked to user identity" (i.e. associated with a name, email, account, or device ID).
- **Tracking?** — whether it is used to track users across apps/websites (always No for ClawBoy).
- **Purpose(s)** — the App Store Connect purpose label(s) to select.
- **Notes** — any nuance or conditions.

---

## Contact Info

### Email Address
| Field | Value |
|-------|-------|
| Collected? | **Yes — conditionally** |
| Linked to identity? | **Yes** |
| Used for tracking? | No |
| Purpose(s) | App Functionality |
| Notes | Collected only when the user signs in (Apple, Google, or magic link). If the user never signs in, no email is collected. Select "Email Address" and mark as linked. |

### Name, Phone Number, Physical Address, Other Contact Info
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Health & Fitness
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Financial Info
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | Apple processes payment; we do not receive card details or billing address. Select "Not Collected." |

---

## Location

### Precise Location, Coarse Location
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Sensitive Info
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Contacts
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## User Content

### Other User Content (messages, gateway instructions, agent outputs)
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | Conversations travel directly between the device and the user's own gateway. They never pass through our servers. Select "Not Collected." |

### Audio Data (voice recordings)
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | Voice is recorded on-device and transmitted directly to the user's gateway. We never receive or store audio. Select "Not Collected." |

### Photos or Videos
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | Images/video are transmitted directly to the user's gateway or saved to their own photo library. The only exception is optional bug-report screenshots, which are published to a public GitHub issue at the user's explicit request. These are not linked to identity and are user-initiated, not background collection. You may select "Not Collected" or select "Photos or Videos" → "Other Purposes" with "Not Linked to Identity." Use judgment based on Apple's latest guidance. |

---

## Browsing History
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Search History
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Identifiers

### User ID
| Field | Value |
|-------|-------|
| Collected? | **Yes — conditionally** |
| Linked to identity? | **Yes** |
| Used for tracking? | No |
| Purpose(s) | App Functionality |
| Notes | **Launch (IAP off):** A Supabase UUID is assigned when the user signs in. `PurchasesProvider` does not call `configurePurchases()`, so RevenueCat does not run and no RevenueCat app user id exists in that build. Select "User ID" → linked → App Functionality. **IAP-enabled:** RevenueCat also assigns an anonymous app user ID (not your name or email on RevenueCat's side); we alias it to the Supabase user id on sign-in. |

### Device ID
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | The Ed25519 device keypair never leaves the device. No device identifier is transmitted to our servers. Select "Not Collected." |

---

## Purchases

### Purchase History
| Field | Launch (IAP off) | IAP-enabled (future) |
|-------|------------------|------------------------|
| Collected? | **No** | **Yes — conditionally** |
| Linked to identity? | — | **Yes** |
| Used for tracking? | — | No |
| Purpose(s) | — | App Functionality |
| Notes | No StoreKit purchases and no RevenueCat in production while `PURCHASES_ENABLED` is `false`. Answer **Data Not Collected** in Connect for this type for the launch app version. Reassess after IAP ships. | Entitlement tier (free/pro/founder) is synced with Supabase (e.g. via RevenueCat webhook). Select "Purchase History" → linked → App Functionality. |

---

## Usage Data

### Product Interaction, Advertising Data, Other Usage Data
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | No analytics SDK, no behavioral tracking, no telemetry. Select "Not Collected." |

---

## Diagnostics

### Crash Data
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | No crash reporter (no Sentry, Crashlytics, Bugsnag). Select "Not Collected." |

### Performance Data
| Field | Value |
|-------|-------|
| Collected? | **No** |

### Other Diagnostic Data
| Field | Value |
|-------|-------|
| Collected? | **No — background collection only** |
| Notes | App version, OS version, device model, and locale are optionally included in explicit user-initiated bug reports. This is not background diagnostic data collection; it is user-submitted support data. Apple's definition of "diagnostic data" refers to automatic/background collection. Select "Not Collected." If Apple's guidance changes, reassess. |

---

## Other Data
| Field | Value |
|-------|-------|
| Collected? | **No** |

---

## Summary tables for App Store Connect

### Launch (IAP deferred)

| Category | Collected? | Linked? | Tracking? | Purpose |
|----------|-----------|---------|-----------|---------|
| Email Address | Yes (if signed in) | Yes | No | App Functionality |
| User ID | Yes (if signed in) | Yes | No | App Functionality |
| Purchase History | **No** | — | — | — |
| All other categories | **No** | — | — | — |

### IAP-enabled (future submission)

| Category | Collected? | Linked? | Tracking? | Purpose |
|----------|-----------|---------|-----------|---------|
| Email Address | Yes (if signed in) | Yes | No | App Functionality |
| User ID | Yes (if signed in) | Yes | No | App Functionality |
| Purchase History | Yes (if signed in + purchased) | Yes | No | App Functionality |
| All other categories | **No** | — | — | — |

---

## Notes for future updates

- If push notifications are added (see `docs/plans/push-notifications.md`): add **Device ID** (push token) → linked → App Functionality.
- If an on-device analytics / achievements system is added: reassess **Usage Data** and **Other Data**.
- If crash reporting is ever added: add **Crash Data** under Diagnostics.
- Re-review the Photos / Video entry if Apple updates its guidance on user-initiated screenshot submissions.
- When enabling IAP: follow [`docs/legal/iap-post-launch-checklist.md`](iap-post-launch-checklist.md).

---

## Post-archive verification

After a **Release** archive in Xcode, open **Window → Organizer → Archives → your archive → Generate Privacy Report** (or the equivalent in your Xcode version). Confirm aggregated third-party manifests do not contradict the Connect answers for that build. Repeat when adding or upgrading native SDKs (especially RevenueCat) after IAP is enabled.
