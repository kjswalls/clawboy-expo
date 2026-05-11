# Blocker 5 — Real-Name Authentication (网络实名制)

*Status: Architectural seam ready; implementation deferred*
*Last updated: May 10, 2026*

---

## What is this?

Under China's **Cybersecurity Law** (Article 24), **Internet Information Service Management Provisions**, and the **Generative AI Interim Measures**, any service providing interactive online content to PRC users must:

1. Require users to register with their real identity (real name + government-issued ID number or phone number linked to real ID via carrier verification).
2. Not allow anonymous use of content generation features.

**Real-name registration (实名制)** means:

- The user's account is linked to their national ID card number (居民身份证) or passport.
- This linkage must be verified, not just self-declared.
- Phone numbers in China are carrier-linked to real ID (SIM card registration since 2017 requires real ID).
- Therefore: **phone + SMS OTP verification is legally sufficient** as a proxy for real-name verification, because carriers are legally required to hold verified ID for each number.

---

## Current auth providers and their status

| Provider | Real-name compliant in China? | Notes |
|---|---|---|
| Sign in with Apple | **No** — Apple ID is not linked to Chinese government ID | Apple sign-in is also problematic: Apple's iCloud China is operated by GCBD, but Apple ID itself is not real-ID linked |
| Sign in with Google | **No** — Google is blocked in China; also not real-ID linked | Google sign-in is also unavailable without VPN |
| Magic link (email) | **No** — email addresses are not real-ID verified | |
| Phone + SMS OTP | **Yes** — if the phone number is a Chinese carrier number (real-ID linked per 2017 SIM law) | |
| WeChat binding | **Yes** — WeChat accounts require real-name verification since 2019 | Also solves the "no Google" problem |
| Alipay binding | **Yes** — Alipay requires real-name for any transaction | Most adults in China have a verified Alipay account |

For the CN build: **phone+SMS and/or WeChat/Alipay binding must replace or supplement Apple/Google/email sign-in.**

---

## Recommended implementation for CN build

### Primary: Phone + SMS OTP with carrier verification

This is the most universal option — every adult in China has a carrier-registered phone number.

**Implementation stack:**

**Option 1: Aliyun (Alibaba Cloud) SMS + Number Auth SDK**

Aliyun's 号码认证服务 (Number Authentication Service) provides:
- SMS OTP delivery
- One-tap carrier verification (no OTP needed on same-carrier device — the carrier confirms identity via a background check)
- Real-name status API (the carrier confirms the number is registered to a real person without exposing the ID number to us)

**iOS SDK:** `AlibabaCloud/AliAuthenticationKit` — [https://help.aliyun.com/product/71812.html](https://help.aliyun.com/product/71812.html)

**Expo / React Native:** No official Expo module. Would need a custom native module (similar in pattern to `expo-pinned-websocket`). Rough effort: 1–2 weeks for a working Expo module wrapper.

**Option 2: Tencent Cloud SMS + Real-Name Check**

Tencent's 腾讯云短信 (Tencent Cloud SMS) provides SMS OTP. Separately, Tencent provides 腾讯云实名认证 for identity verification.

Same integration pattern as Aliyun but backed by Tencent infrastructure. Many Chinese apps use Tencent for this as it integrates smoothly with WeChat.

### Secondary: WeChat Login (微信登录)

WeChat is used by ~1.3B people, including the vast majority of mainland Chinese adults. WeChat accounts are real-name verified since 2019 for users who have made any financial transaction (essentially everyone).

**WeChat Open Platform:** [https://open.weixin.qq.com](https://open.weixin.qq.com)

**Implementation:**
- Register app on WeChat Open Platform (requires PRC entity approval — same entity needed for 备案)
- Obtain `appid` + `appsecret`
- iOS integration via WeChatSDK (objective-c/swift)
- React Native: `react-native-wechat-lib` or a custom Expo module
- The auth flow returns an OpenID + UnionID (cross-app user ID). Map to Supabase user via a Supabase edge function webhook.

**Effort:** 1–2 weeks with native module work.

### Auth provider abstraction (already in place)

The current `SignInSheet.tsx` renders Apple/Google/magic-link options. The `useAccount` hook treats the provider as opaque — it only cares about the resulting Supabase session, not which provider was used.

For the CN build, `SignInSheet.tsx` should be gated:

```typescript
// Simplified — actual implementation would use APP_REGION flag
const showAppleSignIn = ALLOW_THIRD_PARTY_SIGNIN && Platform.OS === 'ios';
const showGoogleSignIn = ALLOW_THIRD_PARTY_SIGNIN;
const showPhoneSignIn = REQUIRE_REAL_NAME_AUTH; // true in CN build
const showWeChatSignIn = REQUIRE_REAL_NAME_AUTH; // true in CN build
```

The `REQUIRE_REAL_NAME_AUTH` flag is defined in `src/constants/featureFlags.ts` and is `false` for the global build.

---

## Supabase integration

Supabase supports:
- **Phone auth (SMS OTP):** Built-in via `supabase.auth.signInWithOtp({ phone: '+86...' })`. Supabase routes SMS via Twilio, MessageBird, or Vonage — all of which have Chinese carrier delivery issues. **For China, configure Supabase to use Aliyun SMS or Tencent Cloud SMS** as the SMS provider. Supabase supports custom SMS providers via hooks (Edge Functions).
- **Custom OAuth provider:** Supabase allows custom OAuth providers. WeChat can be integrated as a custom provider.

Both paths keep Supabase as the identity layer — the CN build uses different auth methods but the same Supabase account table schema.

---

## Data handling note

Real-name verification in China typically means we receive (or pass through to Supabase):
- Phone number (linked to real ID by carrier — we don't receive the ID number)
- WeChat OpenID / UnionID (pseudonymous but real-ID-backed on WeChat's side)

We do not need to store the ID card number ourselves. The carrier / WeChat holds the real-ID linkage; we hold only the phone number or OpenID. This is the standard practice and is compliant.

However: phone numbers are PII under PIPL. The PRC-region Supabase instance must store this data (see `06-pipl-data-localization.md`).

---

## Action Items

- [ ] Decide: Phone+SMS (Aliyun or Tencent) + WeChat, or Phone+SMS only for initial CN launch.
- [ ] Register ClawBoy on WeChat Open Platform (requires PRC entity — blocks on entity decision).
- [ ] Evaluate `react-native-wechat-lib` vs. custom Expo native module for WeChat sign-in.
- [ ] Scope Aliyun Number Auth Service integration as Expo native module.
- [ ] Add `showPhoneSignIn` / `showWeChatSignIn` render branches to `SignInSheet.tsx` behind `REQUIRE_REAL_NAME_AUTH` flag.
- [ ] Configure Supabase Edge Function to route SMS through Aliyun/Tencent for PRC phone numbers.

---

## References

- Cybersecurity Law Article 24 (实名制): [http://www.npc.gov.cn/npc/c30834/201611/270b43e8b35e4f7ea98502b6f0e26f8a.shtml](http://www.npc.gov.cn/npc/c30834/201611/270b43e8b35e4f7ea98502b6f0e26f8a.shtml)
- Aliyun Number Authentication Service: [https://help.aliyun.com/product/71812.html](https://help.aliyun.com/product/71812.html)
- Tencent Cloud SMS: [https://cloud.tencent.com/product/sms](https://cloud.tencent.com/product/sms)
- WeChat Open Platform: [https://open.weixin.qq.com](https://open.weixin.qq.com)
- Supabase Phone Auth: [https://supabase.com/docs/guides/auth/phone-login](https://supabase.com/docs/guides/auth/phone-login)
