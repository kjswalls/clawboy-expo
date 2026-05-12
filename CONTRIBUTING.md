# Contributing to ClawBoy

Thank you for your interest in contributing. ClawBoy connects to personal OpenClaw gateways that may have access to sensitive data — please read [SECURITY.md](SECURITY.md) before contributing anything security-related.

## Code Style

- **TypeScript strict mode** — no implicit `any`, no type assertions unless unavoidable.
- **Named exports everywhere** — the only exception is Expo Router screen files under `app/`, which must use default exports.
- **`const` over `let`**, never `var`.
- **Explicit return types** on all hooks and utility functions.
- **Small, focused components** — no component file over ~300 lines. If it's growing, split it.
- **Domain-specific hooks, not god-objects** — each hook owns exactly one concern. `useConnection` does not know about sessions. `useChat` does not know about agents.
- **No module-level mutable globals** — timers, caches, and counters belong inside React lifecycle (hooks and refs).
- **No non-serializable values in state** — the WebSocket `client` instance lives in a `useRef`, never in context state.
- **Expo APIs only** — no `document`, `window`, or web-only DOM APIs.

## Tests

All contributions must pass the test suite before pushing:

```bash
npm test
```

Tests use **Jest** and **React Native Testing Library**. New behaviour should come with a test. For hooks, use `renderHook`. For components, use snapshot tests as a baseline, but prefer behaviour tests when possible.

## Pull Request Process

1. **Branch from `main`** — branch names like `feat/thing`, `fix/thing`, `chore/thing` work well.
2. **One concern per PR** — don't bundle unrelated changes. Reviewers thank you.
3. **Describe what and why** in the PR description — not just what the diff does, but why the change is needed.
4. **Run `npm test` before opening** — don't submit PRs that fail the test suite.
5. **Security-sensitive changes** — if your change touches auth, token storage, WebSocket handshake, or device identity, read [SECURITY.md](SECURITY.md) first and call it out explicitly in the PR description.

## Security-Related Contributions

**Never post gateway URLs, tokens, device keypairs, or connection credentials in GitHub issues or PRs.** See [SECURITY.md](SECURITY.md) for the responsible disclosure process for security vulnerabilities.
