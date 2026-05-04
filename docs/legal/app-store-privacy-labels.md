# App Store Connect — Privacy Nutrition Label Reference

*Use this document when completing the Privacy section in App Store Connect (App Information → App Privacy). The selections here must remain consistent with the Privacy Policy at `docs/legal/privacy-policy.md`. Review this file whenever data practices change.*

*Last reviewed: May 1, 2026*

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
| Notes | A Supabase UUID is assigned when a user signs in. RevenueCat also assigns an anonymous app user ID (not linked to name/email on RevenueCat's side, but linked to the Supabase account on our side). Select "User ID" → linked → App Functionality. |

### Device ID
| Field | Value |
|-------|-------|
| Collected? | **No** |
| Notes | The Ed25519 device keypair never leaves the device. No device identifier is transmitted to our servers. Select "Not Collected." |

---

## Purchases

### Purchase History
| Field | Value |
|-------|-------|
| Collected? | **Yes — conditionally** |
| Linked to identity? | **Yes** |
| Used for tracking? | No |
| Purpose(s) | App Functionality |
| Notes | Entitlement tier (free/pro/founder) is stored in the Supabase `entitlements` table, linked to the Supabase user ID. Select "Purchase History" → linked → App Functionality. |

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

## Summary table for App Store Connect

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
