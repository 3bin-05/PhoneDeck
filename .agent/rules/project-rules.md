# Phone Deck Rules

- Always read `plan.md` first before making any architectural or design decisions.
- Strictly adhere to performance and bandwidth budgets from `plan.md` Section 10.
- All networking (WSS server/client, pinned TLS, delta decoding) resides exclusively in the Rust core; the WebView UI must never establish raw network connections.
- Native Android logic is centralized in ONE Kotlin plugin.
- Zero credential/key leaks in logs.
- Keep commits small, clean, and task-scoped.
- Ask for user confirmation before adding dependencies outside `plan.md`.
