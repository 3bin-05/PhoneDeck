# Phone Deck — Antigravity Project Rules

These rules are persistent and mandatory across all development tasks in this repository.

1. **Source of Truth**: Always read `plan.md` first. If any instruction or task conflicts with `plan.md`, flag the conflict to the user rather than silently making an assumption.
2. **Strict Performance & Optimization Budgets** (plan.md section 10):
   - **Telemetry throughput**: typical 100–300 B/s, **hard ceiling 1 KB/s** on active page; `< 0.2 KB/s` when dimmed.
   - **Agent CPU**: `< 1%` when client connected, `~0%` when no client connected (sampler thread parks).
   - **Agent RAM**: `< 60 MB`.
   - **Display frame time**: `< 8 ms` at 30 fps cap.
   - **Cold reconnect**: `< 2 s` on same Wi-Fi.
   - **No history streaming**: downsample using LTTB to $\le 300$ points per series.
3. **Architecture & Boundary Enforcements**:
   - **All networking lives in the Rust core**: The WebView UI never touches raw sockets, HTTP endpoints, or self-signed certs directly. Rust owns the pinned-TLS WebSocket connection and delta decoding, pushing batched updates to the UI via Tauri Channels.
   - **Native Android code lives in ONE Kotlin plugin**: All Android system features (`FLAG_KEEP_SCREEN_ON`, `WifiLock`, `MulticastLock`, `NsdManager`, thermal status, battery care, vibration, APK installer) are implemented in a single unified Tauri Kotlin plugin.
4. **Security & Secrets**:
   - Never log secret keys, pairing tokens, or device keys.
   - Localhost-only endpoints must reject foreign `Host` and `Origin` headers.
   - Device keys are HMAC challenge-response authenticated and never sent over the wire after pairing.
5. **Engineering Practices**:
   - Make small, focused commits per task.
   - **Ask before adding any dependency** not listed in `plan.md`.
   - Use the shared `protocol` crate as the single contract for field IDs, MessagePack serialization, and TypeScript type generation.
