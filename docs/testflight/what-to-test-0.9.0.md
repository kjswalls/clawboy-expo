# TestFlight — What to Test (v0.9.0)

Paste into **App Store Connect → TestFlight → build → What to Test**.

---

**Build focus:** pre-1.0 OpenClaw gateway client. Smoke gateway connect, chat streaming, session switch mid-stream, device pairing, and Settings sub-screens.

**Please verify**

1. **Gateway** — Add server profile, connect over `wss://`, send message, confirm streaming reply + thinking/tool cards expand/collapse.
2. **Sessions** — Create session, switch sessions, reset session; sidebar shows skeleton then list; force airplane mode briefly → reconnect banner/behavior.
3. **Sign-in (optional)** — Apple / Google / magic link if you use cloud account; Sign in with Apple shows localized button on zh-Hans device.
4. **Voice / TTS** — Toggle TTS prefs in Settings → Voice; no audio stuck after leaving chat.
5. **Interactive options** — If gateway sends choice card, pagination + Send/Clear match main input styling.
6. **Purchases (sandbox)** — Founders / tip flows still behave (RevenueCat test keys in this build).
7. **About** — Changelog loads; **Open Source Licenses** link: after website publish, should open `https://sundaysoftworks.com/clawboy/licenses` (upload `docs/legal/open-source-licenses.md` there if link 404s).

**Known:** Release audit X7 = NO-GO for full App Store until blockers cleared; this build is for **internal / TestFlight** validation only.

---

After testers confirm this build: consider expiring older TestFlight train **1.0.0 (1)** if still listed, so **0.9.0** is clearly current.
