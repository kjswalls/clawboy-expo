# ClawBoy Privacy Policy

**Effective date:** May 1, 2026
**Last updated:** May 1, 2026

---

## Plain-language summary

ClawBoy is a **thin client**. It connects your device directly to the OpenClaw gateway you configure. Your conversations, agent instructions, and tool outputs travel between your device and your gateway — they never pass through our servers, and we never see them.

The app stores credentials and cryptographic keys exclusively in your device's hardware-backed secure enclave (iOS Keychain / Android Keystore). We cannot read them. The optional account system (sign-in) lets you save preferences and unlock purchases across devices; if you never sign in, none of that data ever leaves your device.

The only data we receive from you is what you explicitly send us: in-app feedback reports, and (if you sign in) your email address and account preferences.

---

## 1. Who we are

ClawBoy is developed and published by **Sunday Softworks (Kirby Walls)** ("Sunday Softworks", "we", "us", "our"). To contact us about privacy, see Section 13.

---

## 2. Data we process

### 2.1 Stored only on your device

The following data never leaves your device and is never transmitted to our servers:

| Data | Where stored | Why |
|------|-------------|-----|
| Gateway authentication tokens | iOS Keychain / Android Keystore (via `expo-secure-store`) | Authenticate to your OpenClaw gateway |
| Ed25519 device private key | iOS Keychain / Android Keystore | Cryptographic device identity for gateway pairing |
| Chat-cache encryption key | iOS Keychain / Android Keystore | Encrypts cached messages at rest |
| Gateway URLs and server profile names | App local storage (AsyncStorage) | Display your saved connections |
| Theme, UI, and app preferences | App local storage (AsyncStorage) | Persist your settings |
| Recent message cache (last ~20 messages per server) | App local storage, AES-256-GCM encrypted with the key above | Instant display on cold start |

The Ed25519 private key is generated on your device when you first launch the app. It never leaves the device. Only the cryptographic signatures it produces are transmitted — and only to your own gateway, in response to its connection challenge.

### 2.2 Stored on our servers (only if you sign in)

Signing in is **optional**. If you never tap "Sign In", none of the data in this section is collected. If you do sign in (via Apple, Google, or magic link email), we store:

| Data | What it is | Why |
|------|-----------|-----|
| Email address | The email associated with your sign-in method | Account identity and recovery |
| Account preferences | Display name, selected cosmetic theme/icon | Sync across devices |
| Server profile pointers | Gateway URL + label only — **no tokens, no credentials** | Remember your servers across installs |
| Entitlement tier | `free`, `pro`, or `founder` | Determine feature access |
| Cosmetic unlocks | Which cosmetic packs you've unlocked | Restore purchases across devices |
| Achievement progress | Milestone completion records | Display achievements in-app |

**What we do not store, even if you sign in:**

- Gateway authentication tokens or API keys — these are always device-local only.
- The content of any conversation, message, or agent output.
- Your Ed25519 private key or any cryptographic secret.

Account data is hosted in the European Union on **Supabase Inc.** infrastructure. You can permanently delete your account and all associated data from Settings → Account → Delete Account, or by emailing privacy@sundaysoftworks.com.

### 2.3 Purchases

If you purchase a Pro subscription or Founder tier through the app:

- **Apple** processes the transaction and receipt via StoreKit. Apple's [Privacy Policy](https://www.apple.com/legal/privacy/) governs Apple's data handling.
- **RevenueCat Inc.** receives an anonymous app user ID (not your name or email) and the purchase receipt to verify and track entitlements. RevenueCat's [Privacy Policy](https://www.revenuecat.com/privacy) governs RevenueCat's handling.
- We receive an entitlement tier update (e.g. `founder`) via a webhook from RevenueCat. This updates the `entitlements` row associated with your account if you are signed in.

We do not receive your payment card details, billing address, or full Apple ID.

### 2.4 Bug reports and feedback

Nothing is sent to us automatically in the background. The only time we receive information from you is when you explicitly tap **"Report a bug / Request a feature"** in Settings.

When you submit a report, the following are sent to a Cloudflare Worker we operate (`clawboy-feedback-worker.sundaysoftworks.workers.dev`) and then filed as a **public** GitHub issue:

- Your written message.
- Diagnostics you choose to include: app version, build number, OS version, device model, locale.
- Any screenshots you explicitly attach.

**Screenshots and issue text are published publicly on GitHub.** Do not include screenshots of sensitive content (gateway credentials, personal information, private conversations).

Diagnostics never include your gateway URL, gateway tokens, or any message contents.

### 2.5 Over-the-air updates

The app periodically checks for JavaScript bundle updates from **Expo's update servers** (`u.expo.dev`). This request includes standard metadata (app version, runtime version, platform). Bundles are verified with code-signing before they execute. This is the only routine outbound network request the app makes that is not directed to your own gateway.

### 2.6 OS permissions

The app requests the following permissions, which are used only for the stated purpose:

| Permission | Platform | Purpose |
|-----------|---------|---------|
| Microphone | iOS + Android | Record voice notes you send to your gateway |
| Speech recognition | iOS | On-device transcription of voice notes |
| Camera | iOS + Android | Capture photos/videos to attach to messages |
| Photo library (read) | iOS + Android | Attach images/videos from your library to messages |
| Photo library (write) | iOS + Android | Save media received from your agents to your library |
| Notifications | iOS + Android | Push notifications (future feature; not yet active) |

We do not receive or store any audio, images, or video. This content is handled locally on your device and sent directly to your gateway when you choose to attach or send it.

---

## 3. What we do not collect

- Off-device analytics, behavioral tracking, or usage statistics of any kind.
- Crash reports (no Sentry, Crashlytics, Bugsnag, or equivalent).
- Advertising SDKs or device fingerprinting.
- The contents of your conversations, messages, or agent outputs.
- Your gateway URL or gateway tokens (beyond the device-local storage described in §2.1).
- Your Ed25519 device private key.
- Background location.
- Contacts or calendar data.

---

## 4. Sub-processors

When you use features that involve our servers, the following third parties process data on our behalf:

| Sub-processor | Role | Location | Privacy Policy |
|--------------|------|----------|---------------|
| Supabase Inc. | Account data hosting (EU region) | USA / EU | [supabase.com/privacy](https://supabase.com/privacy) |
| RevenueCat Inc. | Purchase receipt validation and entitlement management | USA | [revenuecat.com/privacy](https://www.revenuecat.com/privacy) |
| Cloudflare Inc. | Feedback relay Worker | USA | [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/) |
| 650 Industries Inc. (Expo) | OTA update delivery | USA | [expo.dev/privacy](https://expo.dev/privacy) |
| GitHub Inc. (Microsoft) | Public issue filing for bug reports | USA | [docs.github.com/en/site-policy/privacy-policies](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| Apple Inc. | Sign in with Apple; purchase processing | USA | [apple.com/legal/privacy](https://www.apple.com/legal/privacy/) |
| Google LLC | Sign in with Google | USA | [policies.google.com/privacy](https://policies.google.com/privacy) |

The core chat functionality — connecting to your gateway, sending and receiving messages — uses no sub-processors. That traffic goes directly from your device to the server you configured.

---

## 5. Children's privacy

ClawBoy is not directed to children under 13 years of age (or under 16 in the European Economic Area and United Kingdom). We do not knowingly collect personal information from children under these ages. If we learn that we have inadvertently done so, we will promptly delete it. Contact us at privacy@sundaysoftworks.com if you believe we have collected data from a child.

---

## 6. International data transfers

Sunday Softworks (Kirby Walls) is based in the State of California. The sub-processors listed in Section 4 are predominantly US-based. If you are in the EU/EEA or UK, your data may be transferred to and processed in the United States. Supabase stores account data in the EU region. RevenueCat, Cloudflare, Expo, GitHub, Apple, and Google operate under Standard Contractual Clauses or equivalent transfer mechanisms.

---

## 7. Data retention

| Data | Retention period |
|------|-----------------|
| Device-local data (§2.1) | Until you delete the app or clear app data |
| Account data (§2.2) | Until you delete your account (Settings → Account → Delete Account) or email privacy@sundaysoftworks.com |
| Purchase records | As required by Apple and RevenueCat for refund and dispute purposes |
| Feedback reports | Retained in our GitHub repository indefinitely as public issues; contact privacy@sundaysoftworks.com to request removal |
| OTA update request metadata | Standard server logs; retained per Expo's policy |

---

## 8. Your rights

Depending on where you live, you may have the following rights regarding your personal data:

- **Access**: Request a copy of the personal data we hold about you.
- **Correction**: Ask us to correct inaccurate data.
- **Deletion**: Request that we delete your account and associated data. You can do this directly in-app (Settings → Account → Delete Account) or by emailing privacy@sundaysoftworks.com.
- **Portability**: Request your data in a machine-readable format.
- **Objection / restriction**: Object to certain processing or request that we restrict it.
- **Withdrawal of consent**: Where processing is based on consent, you can withdraw it at any time (e.g. by signing out and deleting your account).

To exercise any of these rights, email privacy@sundaysoftworks.com. We will respond within 30 days (or the period required by applicable law).

---

## 9. Security

We take the following measures to protect your data:

- All gateway connections default to encrypted TLS (`wss://`). The app warns you before saving an insecure (`ws://` or `http://`) URL.
- Credentials and cryptographic keys are stored in the hardware-backed iOS Keychain or Android Keystore and are never written to plain app storage.
- The local message cache is encrypted with AES-256-GCM.
- TOFU (Trust-On-First-Use) SPKI certificate pinning is available. After your first connection, ClawBoy records your gateway's certificate public key; you can promote it to an enforced pin in Settings → Connection → Pinned Keys. Once pinned, the app blocks any connection whose certificate does not match — before any credentials are sent.
- Our Supabase account database uses Row Level Security; each row is restricted to the authenticated user who owns it.

No method of electronic transmission or storage is 100% secure. While we implement commercially reasonable safeguards, we cannot guarantee absolute security.

---

## 10. Changes to this policy

If we make material changes, we will update the "Last updated" date at the top of this document and include a note in the in-app changelog. Continued use of the app after changes take effect constitutes acceptance of the revised policy.

---

## 11. Contact

For privacy questions, rights requests, or concerns:

**Sunday Softworks (Kirby Walls)**
Email: privacy@sundaysoftworks.com

