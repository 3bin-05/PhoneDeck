# Phone Deck — Project Plan (v2)

> Turn an old Android phone into a Steam-Deck-style companion screen for your PC. Live stats, AI-agent "done, go review" alerts, one-tap shortcuts, and a live wallpaper. 100% local over your Wi-Fi, featherweight on bandwidth and battery.

**Final deliverables**
1. **Phone Deck Agent**: Windows desktop app (installer) with tray, layout editor, settings, pairing QR
2. **Phone Deck Display**: signed Android **APK** (the thing running on the old phone)

**What changed in v2**
- Studied [ersinkoc/phonebox](https://github.com/ersinkoc/phonebox) (see section 2) and folded in the good ideas
- AI Agent Hub now does **task-complete notifications** (with a git change summary), not just approvals
- New **Live Wallpaper engine** (section 8)
- Full **optimization playbook** with actual algorithms and measurable budgets (section 10)
- Step-by-step **Antigravity prompts P0 to P10** (section 16)

---

## 1. Vision & Principles

A phone on your desk, plugged into a charger (not your PC), glowing with a deck-style dashboard. PC in range, it lights up. An AI agent finishes a task, the phone buzzes and shows *what* finished and *how much changed*. Tap, jump to your editor, review.

1. **Customizable first.** Every pixel is theme-driven. Your generated UI image drops in as a skin with zero code changes.
2. **Featherweight.** Agent near 0% CPU when idle, telemetry under 1 KB/s, phone battery and thermals respected.
3. **Local only.** No cloud, no accounts, no relay. The only optional outbound call is weather, made by the Agent and cached.
4. **Opinionated design.** Minimal, strong aesthetic. Nothing that looks like a dashboard template.
5. **Fails gracefully.** Missing sensor, sleeping PC, flaky Wi-Fi: always show something sensible.

---

## 2. Lessons from PhoneBox (what we borrow, what we do differently)

PhoneBox is an MIT-licensed project: .NET agent + native Android WebView app, USB via `adb reverse`, optional Wi-Fi/Tailscale after a one-time USB pairing, 41 widgets, 18 templates, webhooks, rules, AI quota + session widgets.

| PhoneBox idea | Our take |
|---|---|
| Agent samples **only what's on screen** | Same. Subscription refcounting per widget (section 10) |
| Native layer proxies all network calls, so WebView has no CORS / mixed-content / self-signed-cert pain | Same idea, but in Rust: the **Tauri Rust core on the phone owns the socket**, pins the cert, decodes data, and hands the UI only changed values |
| Pinned self-signed TLS cert + secret key for Wi-Fi mode | Same, plus **QR pairing** (no USB needed even for first setup) |
| Widget = `create(box, ctx) → update()` + a JSON catalog that drives the editor | Same pattern: `widgets.json` catalog drives the PC editor and the phone runtime |
| Layout editor on the PC, phone picks up config within seconds | Same, but the editor is the **native desktop app window**, not a browser tab |
| Webhooks: `POST /api/push/<key>`, `/api/notify`, `/api/goto/<page>` | Keep this API shape (it is great). Extra: `phonedeck` CLI wraps it |
| Rules engine (when → then, "only while it lasts") | Keep, with a simpler JSON rule format |
| Reads AI sessions from `~/.claude/sessions` and `~/.codex/sessions` | Keep as the **zero-config fallback**; hooks give instant, precise events on top |
| Demo server with fake data to develop UI in a browser | Keep: `deck-mock` mock agent for UI dev without a PC or phone |
| Update by `adb install -r` | Replace: Agent serves the new APK over LAN, phone installs it (no USB) |

**Not copying:** the .NET stack, USB-first design, or any code. We use it as a reference for the behaviors above. If you ever do copy code, keep the MIT notice.

---

## 3. Architecture

```
┌────────────── PC (Windows first) ──────────────┐        ┌──────────── Old Android phone ────────────┐
│  Phone Deck Agent (Tauri 2)                     │        │  Phone Deck Display (Tauri 2 Android)      │
│  ├─ Rust core                                   │  WSS   │  ├─ Rust core                              │
│  │   ├─ sensors (sysinfo, NVML, media, procs)   │◄──────►│  │   ├─ pinned-TLS WebSocket client       │
│  │   ├─ WSS server (LAN only) + mDNS advertise  │ LAN    │  │   ├─ delta decode + state store         │
│  │   ├─ session/agent watchers (notify crate)   │ only   │  │   └─ per-frame batched push to UI       │
│  │   ├─ hook bridge (localhost HTTP) + CLI      │        │  ├─ React UI: widgets, wallpaper, theme    │
│  │   └─ action executor (launch, media, lock)   │        │  └─ Kotlin plugin: wake/wifi lock, NSD,    │
│  └─ React UI: editor, settings, QR, event log   │        │      thermal, battery, vibrate, installer  │
└─────────────────────────────────────────────────┘        └────────────────────────────────────────────┘
```

### Tech stack
| Layer | Choice |
|---|---|
| Both apps | Tauri 2 (Rust core + WebView UI) |
| Rust | tokio, axum (WebSocket + HTTP), rustls, rcgen (self-signed cert), sysinfo, nvml-wrapper (optional), mdns-sd, notify (file watching), rmp-serde (MessagePack), qrcode, rusqlite (event history), tauri-plugin-autostart / updater |
| UI | React + Vite + TypeScript + Tailwind + Framer Motion, dnd-kit for the editor grid, Zustand for state |
| Android native | Kotlin Tauri plugin: `FLAG_KEEP_SCREEN_ON`, WifiLock (high-perf), MulticastLock, `NsdManager` discovery, thermal status, battery, vibration, brightness, APK install |
| Shared | `protocol` Rust crate, TS types generated from it (ts-rs or specta) so both sides can never drift |

### Repo layout
```
phone-deck/
├─ plan.md
├─ crates/
│  ├─ protocol/        # message types, field dictionary, delta encoder, versioning
│  ├─ deck-cli/        # `phonedeck` CLI (notify / ask / push)
│  ├─ deck-mock/       # mock agent with fake data for UI dev
│  └─ deck-sim/        # headless fake phone: measures bytes/s + CPU in CI
├─ apps/
│  ├─ agent/           # Tauri desktop app
│  └─ display/         # Tauri Android app
├─ packages/
│  ├─ widgets/         # widget runtime + widgets + widgets.json catalog
│  ├─ theme-engine/    # theme schema, loader, validator
│  ├─ wallpaper/       # live wallpaper engine + presets
│  └─ ui-kit/          # shared design tokens + primitives
├─ integrations/       # Claude Code hook scripts, Codex notify, Ollama poller
└─ docs/
```

---

## 4. Protocol & Networking

**One WebSocket, two logical channels:**

| Channel | Semantics | Used for |
|---|---|---|
| `telemetry` | lossy, latest-wins, delta-encoded, dead-banded | CPU, RAM, GPU, net, temps, media position |
| `events` | reliable, ordered, acked, resumable | agent-complete, approvals, notifications, config changes, actions |

- **Encoding:** MessagePack with **integer field IDs** from a shared dictionary (no string keys on the wire). Envelope: `[type, seq, payload]`.
- **Resume:** events carry a sequence number. Phone acks. On reconnect the phone sends `last_seq`, Agent replays only what was missed (bounded queue, e.g. last 200).
- **Time:** the phone renders its own clock locally. The Agent sends a time-sync only on connect. Clocks cost zero bandwidth.
- **Heartbeat:** WebSocket ping every 20 s, dead-peer detection at 2 missed pongs. Telemetry itself counts as a heartbeat while flowing.
- **Discovery:** QR contains the IP list, so first connect needs no discovery. After that: **race** the cached IP against an mDNS lookup (Android `NsdManager` via the Kotlin plugin, since raw multicast from Rust on Android is flaky) and take the first answer.
- **Config sync:** layout/theme/shortcuts are versioned by content hash. Phone sends its hash, Agent only sends config if it differs.

### Pairing (QR, no USB)
1. Agent generates a self-signed cert (once) and shows a QR: `phonedeck://pair?h=<ips>&p=<port>&t=<one-time token>&fp=<cert sha256>&id=<agent id>`
2. Token is single-use and expires in 120 s.
3. Phone scans, connects over WSS, **verifies the fingerprint in its Rust TLS verifier** (not in JS), presents the token.
4. Agent issues a long-lived 256-bit **device key**. Phone stores it encrypted (Android Keystore). Agent stores only a hash.
5. Later connections: HMAC challenge-response. The key is never sent over the wire again.
6. Agent UI lists paired devices with **Revoke** and **Revoke all**.

---

## 5. Feature Set

### Core stats
CPU (total, per-core, clock, temp), RAM, GPU (usage, VRAM, temp, NVIDIA via NVML), disks (usage + I/O), network up/down, ping, PC battery, uptime, top processes (tap to end an instance, with a protected-process list and an off switch).

> CPU temps on Windows are unreliable via `sysinfo`. Treat as optional (LibreHardwareMonitor helper). Widget hides itself if no source exists.

### Time & ambient
Digital / analog / flip clocks, world clocks, date, weather (Agent fetches, 30 min cache), Pomodoro, timer, stopwatch, night mode that dims to a clock, ambient idle screen when the PC is offline.

### Control
Now playing + media controls + volume, quick actions (lock, mute, screenshot, sleep display, Wake-on-LAN), run script (opt-in).

### Shortcuts (fully customizable)
- Tiles: name, icon (emoji / upload / auto-extracted app icon), color, size
- Actions: launch app, open URL, open folder, run command, keyboard macro, toggle
- Groups and pages (e.g. "Dev", "Media")
- Agent scans the Start Menu so you pick installed apps from a list
- Per-tile options: confirm-before-run, cooldown, "is running" indicator
- Phone only sends a shortcut **id**. Commands live on the PC (the phone never sees them)

### Rules (when → then)
Examples: AI session finished → switch to Agent page + vibrate. Game fullscreen → game layout. CPU above 90% for 15 s → pulse alert. Away N minutes → ambient page. 22:00 to 07:00 → night theme. Webhook value on → show notification.

### Webhooks / CLI (PhoneBox-style API)
```
POST /api/push/<key>      # value widget
POST /api/notify          # toast + vibration (+ page switch)
POST /api/goto/<page>
phonedeck notify --agent claude-code --title "Done" --kind done
phonedeck ask "Run migration?" --timeout 60     # blocks until phone answers
```
Localhost needs no key. LAN senders use a separate **webhook key** that can never open the phone API.

### Widget catalog (v1 target ≈ 28)
Time: clock, analog, world clocks, time progress, pomodoro, timer, stopwatch · Sky: weather, forecast · Computer: metric tile, gauge, chart, memory & disks, top processes, network, now playing, volume, shortcut grid, big button, command · **AI: Agent Inbox, Agent sessions, Local LLM status** · Personal: note, checklist, counter, phone battery/temp · Data: pushed value, notification feed.

---

## 6. AI Agent Hub

### 6.1 Goals
1. **Task complete → "ready for review" notification**, shown even when the phone is dimmed
2. Optional **approval requests** (approve / deny from the phone)
3. A persistent **Review Inbox** so nothing gets forgotten

### 6.2 Event model
```
AgentEvent {
  id, ts, agent: "claude-code" | "codex" | "antigravity" | "local-llm" | string,
  project, cwd,
  kind: "done" | "needs_input" | "approval" | "error" | "working" | "idle",
  title, summary,
  stats?: { duration_s, files_changed, insertions, deletions },   // from git, see below
  actions: ["open_editor","open_folder","approve","deny","mark_reviewed","snooze","dismiss"],
  expires_at?
}
```

### 6.3 Detection: two layers
| Layer | How | Why |
|---|---|---|
| **Hooks** (precise, instant) | Claude Code hooks (`Stop`, `Notification`, `PreToolUse`) call `phonedeck`. Codex `notify` config does the same on turn complete. | Exact moment, can carry context, can block for approval |
| **Watchers** (zero-config fallback) | `notify` crate watches `~/.claude/sessions` and `~/.codex/sessions`, debounced. | Works with no setup. PhoneBox reads these same folders, so the layout exists, but **verify the file formats on your machine** |

Antigravity has no known hook API: use a best-effort adapter (process + window-title heuristic, plus a manual `phonedeck notify` you can bind to a task) and revisit if it ships hooks. Local LLMs (Ollama / LM Studio): poll their local API *only while the widget is visible* for loaded model, VRAM, and activity.

### 6.4 The "done" notification (the good part)
When a `done` event arrives, the Agent runs, **off the main thread with a 2 s timeout**:
- `git diff --shortstat` and `git status --porcelain` in the session's `cwd`

and the phone shows: **"claude-code finished in `phone-deck` · 6 files · +142 −38 · 4m 12s"**, with buttons **Open in editor**, **Open folder**, **Mark reviewed**, **Snooze 10m**.

- Dimmed screen: wake it for `done` / `needs_input` / `error` (respecting rules and a Do-Not-Disturb schedule)
- Distinct vibration patterns per kind
- Coalescing: dedupe by `(agent, project, kind)` within 2 s so flapping sessions don't spam
- **Review Inbox widget:** badge with the number of unreviewed completions, stays until you mark reviewed, survives restarts (SQLite)
- History tab: past events and what you did with them

### 6.5 Approvals (opt-in, safety first)
- Claude Code `PreToolUse` hook calls `phonedeck ask`, which blocks until phone answers or times out (then falls back to the normal terminal prompt)
- Phone shows the **exact command / diff summary**, never a vague "approve?"
- Risky patterns (`rm -rf`, force push, DB drops) need a **hold-to-confirm** gesture, or are forced to "approve on PC only"
- Only paired devices. Every decision logged on the Agent.
- Verify the current hook schema in the Claude Code docs before wiring it

---

## 7. Theme & Design Direction

Everything visual comes from one JSON theme + assets (hot-reload in dev, import/export as a single file).

**Default theme "Void":** true black (OLED-friendly), one accent color, huge tabular numerals, hairline dividers, glow only on live/active elements, no card-shadow soup, no gradient-everything. Two more built-ins: "Paper" (light, e-ink feel) and "Neon Grid" (louder). Real skin comes later from your generated image through the **skin slot**: background, per-widget frames, fonts, accent.

```jsonc
{
  "name": "void",
  "background": { "type": "wallpaper", "ref": "aurora-lite", "dim": 0.35 },
  "palette": { "accent": "#7C5CFF", "surface": "#000000", "text": "#EDEDF2" },
  "type": { "display": "…", "mono": "…" },
  "shape": { "radius": 14, "blur": 0, "glow": 0.5 },
  "widgets": { "defaultStyle": "ring" },
  "schedule": { "night": "22:00", "day": "07:00" },
  "skin": { "image": null, "frames": {} }
}
```

---

## 8. Live Wallpaper Engine

**Scope (v1):** an *in-app* live wallpaper, rendered behind the widgets on the Deck. That fits a phone dedicated to this app. A system-level Android wallpaper is a stretch goal (see end).

### Wallpaper types
| Type | Notes | Cost |
|---|---|---|
| Static + Ken Burns | slow pan/zoom of an image | lowest |
| Video loop | MP4/WebM, muted, hardware-decoded, pre-scaled to screen res | low |
| GPU shader preset | WebGL fragment shaders: aurora, flow field, starfield, nebula, grid | medium |
| Particles / canvas | lightweight 2D | medium |
| Lottie / animated WebP | vector or short loops | low to medium |
| **Stats-reactive** | shader uniforms driven by live telemetry (CPU → speed, GPU → intensity, net → pulse, temp → hue), smoothed | medium |
| Parallax | accelerometer-driven depth shift | low |
| Time-of-day | scene crossfades with sunrise/sunset | low |

### Wallpaper pack format
A folder/zip: `manifest.json` (type, assets, fps cap, reactive bindings, dim, blur, safe-area) + assets. You import packs in the **PC editor**; the Agent sends them to the phone as a **chunked, checksummed file transfer**, cached on the phone by content hash (never re-sent).

### Performance governor (this is what keeps the phone cool)
Quality tiers: **High** (30 fps, scale 1.0) → **Balanced** (24 fps, 0.75) → **Eco** (12 fps, 0.5) → **Static**.

The governor picks the tier from:
- battery level and charging state
- Android thermal status (Kotlin plugin, API 29+)
- measured frame time (over budget for N frames → drop a tier; stable for M seconds → rise one, with hysteresis so it doesn't flap)
- dim/ambient state (dim → Static or 1 fps)
- page weight (heavy widget page → lower wallpaper tier)
- Page Visibility (hidden → render loop fully stopped)

Burn-in protection applies too: very slow drift of the whole composition, and true-black bias in the default packs.

**Stretch (not v1):** a Kotlin `WallpaperService` inside the generated Android project (video/shader only) so the wallpaper also appears as the system wallpaper when the Deck app is closed. A WebView can't be hosted in a `WallpaperService` easily, so it would be a separate native renderer.

---

## 9. Android Hardening
- Foreground service + `FLAG_KEEP_SCREEN_ON` so Android doesn't kill or sleep the panel
- `WifiLock` (high performance) so Wi-Fi power-save doesn't add latency or drop the socket
- `MulticastLock` while discovering, released after
- Ask for the battery-optimization exemption (guide the user to the setting)
- Kiosk-ish behavior: immersive fullscreen, landscape lock option, boot-on-charge optional
- Battery care: dim schedule, optional "stop charging at 80%" tip (device-dependent), swelling warning in settings
- ABIs: **arm64-v8a + armeabi-v7a** (old phones are often 32-bit), R8 minify, resource shrink
- Self-update: Agent serves the APK over LAN; phone installs through the package installer (`REQUEST_INSTALL_PACKAGES`), signature must match

---

## 10. Optimization Playbook

### Budgets (enforced in CI by `deck-sim`)
| Metric | Target |
|---|---|
| Telemetry, active page | typical 100–300 B/s, **hard ceiling 1 KB/s** |
| Telemetry, dimmed | < 0.2 KB/s |
| Agent CPU, client connected | < 1% |
| Agent CPU, no client | ~0% |
| Agent RAM | < 60 MB |
| Display frame time (widgets) | < 8 ms at 30 fps cap |
| Wallpaper | governor-managed, never above 30 fps |
| Cold reconnect | < 2 s on same Wi-Fi |

### Network & protocol
1. **Delta encoding:** send only fields that changed since the last acked state.
2. **Dead-band thresholds per metric:** CPU only if |Δ| ≥ 1%, temp ≥ 1°C, net throughput bucketed on a log scale. Tiny jitter never hits the wire.
3. **Integer field-ID dictionary + MessagePack** (no string keys), varint-friendly small ints, fixed-point instead of floats where precision allows (0.1% → u16).
4. **Coalescing window (~50 ms):** batch near-simultaneous updates into one frame to avoid tiny packets and radio wakeups.
5. **Priority lanes:** events preempt telemetry; telemetry is latest-wins (drop stale queued samples under backpressure).
6. **Compression only where it pays:** LZ4/zstd for history backfill and wallpaper chunks, never for tiny telemetry frames.
7. **No history streaming.** Phone keeps ring buffers; on connect the Agent sends **one** backfill downsampled with **LTTB** (Largest-Triangle-Three-Buckets) to ≤ 300 points per series.
8. **Derive locally:** clock, uptime (from boot time), percentages from raw counters. If the phone can compute it, don't send it.
9. **Config by content hash:** don't resend layouts/themes/wallpapers the phone already has.
10. **Connection racing + backoff:** cached IP vs mDNS in parallel; exponential backoff with jitter; pause retries entirely when Wi-Fi is off.

### Sensor sampling (Agent)
11. **Subscription refcounting:** each visible widget subscribes to sensors; zero subscribers → sensor not polled. Only widgets on the **current page** count.
12. **Adaptive sampling controller per sensor:** if |Δ| stays under the dead-band for N samples → `interval *= 1.5` up to a max; any big change → snap to the minimum interval. Quiet systems get polled rarely.
13. **Expensive sensors on demand:** process list and command widgets run only while a phone is looking at them; results cached with a TTL.
14. **Use the narrow `sysinfo` refresh calls** (refresh only CPU/mem/net as needed), not `refresh_all`.
15. **Event-driven over polling:** file watchers (`notify`) with debounce for agent sessions; no folder scanning loops.
16. **Zero-subscriber idle:** with no client connected, the sampler thread parks (no timers firing).

### Display rendering
17. **Rust core owns the socket and the state;** the UI gets **one batched update per animation frame**, only the keys that changed, via a Tauri Channel.
18. **Interpolate, don't over-sample:** 1 Hz data drawn at 60 fps using a critically damped spring / lerp, so numbers and gauges look smooth with no extra network.
19. **Per-widget selectors:** a widget re-renders only when its own keys change (Zustand selectors, `memo`).
20. **Compositor-friendly animation:** `transform` and `opacity` only, `will-change` on a short leash, `contain: layout paint` on widgets, `content-visibility` for off-page content.
21. **Canvas for charts** with LTTB downsampling to pixel width; typed-array ring buffers (no per-sample object allocation, near-zero GC).
22. **One rAF loop** shared by all animating widgets; stops completely when nothing animates or the page is hidden.
23. **Ambient mode:** 1 fps clock-only, wallpaper static, telemetry reduced to a heartbeat.

### Build & binary
24. Rust release profile: `lto = "fat"`, `codegen-units = 1`, `panic = "abort"`, `strip = true`, `opt-level = 3` for the Agent hot paths.
25. Android: R8 + resource shrinking, split ABIs, WebP/AVIF assets, wallpaper videos capped (e.g. ≤ 15 MB, ≤ 1080p, 30 fps).
26. Lazy-load widgets and wallpaper presets (dynamic imports) so cold start stays fast.

### Measure, don't guess
- In-app **debug overlay:** bytes/s per channel, tick rates, frame time, wallpaper tier, Agent CPU
- `deck-sim` replays a scripted session headlessly and **fails CI** if any budget regresses
- Property tests for the delta encoder (apply(delta(a, b), a) == b), golden tests for protocol compatibility

---

## 11. Security
- Agent binds to the **LAN interface only**; localhost-only endpoints (settings, pairing, shortcut tests) reject foreign `Host` / cross-site `Origin` (DNS-rebinding and CSRF protection)
- TLS with a **pinned self-signed cert**, device keys via challenge-response, revoke list
- Phone sends only ids; commands and scripts are defined and stored on the PC
- Webhook key separated from the device key; rotate independently
- Process kill limited to your own session, protected-process denylist, switchable off
- Approvals require the exact-command display and hold-to-confirm for risky patterns
- Logs never contain keys or tokens

---

## 12. Testing, CI, Release
- **Mock-first dev:** `deck-mock` serves fake telemetry/events so you can build UI in a desktop browser at phone size (landscape ~780×360 CSS px as a starting point; adjust for your phone)
- Unit + property tests on `protocol`; integration tests with `deck-sim`
- GitHub Actions: build the Windows installer (NSIS/MSI) and the signed APK, run budget checks
- Signing: your own Android release key via env vars / Gradle properties (keep it, since updates must match the signature)
- Windows: autostart on login (tauri-plugin-autostart), tray icon, single-instance
- Linux AppImage and macOS builds are stretch after v1

---

## 13. Phases & Exit Criteria

| Phase | Goal | Exit criteria |
|---|---|---|
| **0** Foundations | Monorepo, rules file, mock agent | Phone-size UI renders fake data in a browser |
| **1** Protocol + link | Shared protocol, WSS, delta encoder | Real number streams PC → phone, tests pass |
| **2** Pairing + security | QR, pinned TLS, discovery, revoke | Scan once, reconnects forever, revoke works |
| **3** Telemetry + optimization | Sensors, subscriptions, adaptive sampling, overlay | CI proves < 1 KB/s and < 1% CPU |
| **4** Display + widgets | Widget runtime, state store, core widgets | Real stats on the phone, smooth at 30 fps |
| **5** Editor + themes | Drag/drop editor, theme engine, skin slot | Re-skin a page from JSON alone |
| **6** AI Agent Hub | Hooks, watchers, done-notifications, inbox, approvals | Claude Code finishes → phone shows diff stats → tap opens editor |
| **7** Live wallpaper | Engine, packs, governor, transfer | Stats-reactive wallpaper runs cool for an hour |
| **8** Shortcuts + rules | Tiles, app scan, rules, quick actions | Daily-driver launcher + rule triggers |
| **9** Hardening + packaging | Android native bits, installer, APK, CI, self-update | Fresh PC + fresh phone → working in 5 minutes |
| **10** Skin | Apply your generated UI image | Flawless final look |

**Definition of done (v1.0):** installer + signed APK from CI, QR pairing, all budgets green, ≥ 20 working widgets, agent-complete notifications with git summary, live wallpaper with governor, customizable shortcuts, 8-hour soak test with no leaks and no phone overheating.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Router AP isolation / guest Wi-Fi blocks phone → PC | Clear "can't reach PC" state with the likely cause |
| Self-signed cert rejected in a WebView | Networking lives in the Rust core with a custom pinned verifier |
| Raw multicast flaky on Android | `NsdManager` in Kotlin + cached-IP race + manual entry |
| Windows temps unreliable | Optional helper, widget hides itself |
| Always-charging phone battery | Dim schedule, charge-limit tip, thermal governor |
| OLED burn-in | Pixel drift, auto-dim, true-black default |
| Android kills the app | Foreground service, wake + Wi-Fi locks, battery exemption |
| Agent hook formats change | Everything funnels through the generic `phonedeck` bridge; adapters stay thin; watchers as fallback |
| Antigravity lacks hooks | Heuristic adapter + manual notify; re-check later |
| Wallpaper cooks the phone | Governor with thermal + frame-time feedback |
| 32-bit old phone | Build armeabi-v7a too |
| Tauri Android rough edges | Keep native code in one Kotlin plugin; mock-first UI dev so most work needs no device |

---

## 15. Assumptions & Open Questions
- Assumed: Windows PC, Android 9+ phone, same home Wi-Fi, landscape primary
- Live wallpaper = **in-app** for v1 (system-level is a stretch goal)
- Phone model, screen size, and OLED vs LCD aren't decided yet. They affect burn-in tactics, ABI choice, and layout sizes
- Which editor opens on "Open in editor"? (VS Code / Antigravity CLI / other: configurable per project)

---

## 16. Antigravity Prompts (run in order, one phase at a time)

> Tip: finish each phase, run it, commit, then paste the next prompt. If a phase goes sideways, paste the acceptance criteria back to the agent instead of piling on new asks.

### P0: Rules + scaffold
```
You are building "Phone Deck": a Tauri 2 monorepo with two apps. (1) "Agent": Windows-first desktop app (tray, settings/editor window, pairing QR). (2) "Display": Android app (APK) that runs full-screen on an old phone as a Steam-Deck-style dashboard. Everything is local over Wi-Fi; no cloud.

First, read /plan.md fully. Then:
1. Create the repo layout from plan.md section 3 (crates/protocol, deck-cli, deck-mock, deck-sim; apps/agent, apps/display; packages/widgets, theme-engine, wallpaper, ui-kit; integrations; docs).
2. Use React + Vite + TypeScript + Tailwind + Framer Motion for UIs, Zustand for state, Rust workspace for crates.
3. Write a project rules file (whatever Antigravity uses for persistent rules) stating: always read plan.md first; follow the budgets in section 10; keep native code in one Kotlin plugin; never put secrets in logs; small commits per task.
4. Add the Rust release profile from plan.md section 10 item 24.
5. Make `pnpm dev` start the Agent UI and `pnpm dev:display` start the Display UI in a desktop browser at phone landscape size.
Acceptance: both UIs render a placeholder, `cargo build --workspace` passes, README explains how to run everything. No features yet.
```

### P1: Protocol crate + mock agent
```
Implement crates/protocol per plan.md section 4: MessagePack envelope [type, seq, payload]; integer field-ID dictionary shared by Rust and generated TypeScript types (use ts-rs or specta); two channels (telemetry = lossy latest-wins, events = reliable ordered acked with resume via last_seq); a delta encoder with per-field dead-bands; protocol version field.
Then build crates/deck-mock: a mock agent serving fake CPU/RAM/GPU/net/media telemetry and sample AgentEvents over WebSocket, so the Display UI can be built in a browser with no PC or phone.
Add tests: roundtrip tests, a property test that apply(delta(a,b), a) == b, and golden-bytes tests for protocol stability.
Acceptance: `cargo test -p protocol` is green; the Display UI placeholder shows live fake numbers from deck-mock.
```

### P2: Pairing, TLS, discovery, security
```
Implement secure pairing per plan.md section 4 "Pairing". Agent: generate a self-signed cert with rcgen on first run, run a LAN-only WSS server (axum + rustls), show a QR (phonedeck://pair?h=<ips>&p=<port>&t=<one-time token>&fp=<cert sha256>&id=<agent id>) with a 120s single-use token. Display: scan the QR (Tauri barcode-scanner plugin), and do ALL networking in the Rust core with a custom rustls verifier that pins the fingerprint (the WebView must never touch the socket). Issue a 256-bit device key; store it encrypted via Android Keystore (Kotlin plugin); authenticate later with HMAC challenge-response. Agent stores only a hash. Add a paired-devices list with Revoke and Revoke all. Discovery: advertise with mdns-sd on the Agent; on Android use NsdManager from the Kotlin plugin; on reconnect race the cached IP against mDNS and take the first success; exponential backoff with jitter. Reject foreign Host/Origin headers on localhost-only endpoints.
Acceptance: scan once, kill and restart both sides, phone reconnects automatically; a revoked phone is refused; a wrong fingerprint is refused.
```

### P3: Telemetry + optimization core
```
Implement the sensor and optimization core per plan.md sections 5 and 10. Agent sensors via sysinfo (use narrow refresh calls, never refresh_all): CPU total/per-core/clock, RAM, disks, network, uptime, top processes; optional NVML GPU; optional temperature source that hides itself if absent. Implement: subscription refcounting (a sensor polls only if a visible widget on the CURRENT page subscribes), an adaptive sampling controller per sensor (back off x1.5 up to a max when values are quiet, snap to min on change), sampler thread that parks with zero subscribers/clients, per-metric dead-bands, delta-only telemetry, 50 ms coalescing window, priority lanes (events preempt telemetry), and a history backfill sent once on connect, downsampled with LTTB to <=300 points per series. Build crates/deck-sim, a headless fake phone that measures bytes/sec and Agent CPU, and add a debug overlay in Display showing bytes/s per channel, tick rates, and frame time.
Acceptance: deck-sim shows <1 KB/s on an active page, <0.2 KB/s dimmed, Agent <1% CPU connected and ~0% with no client; a CI job fails if budgets regress.
```

### P4: Display runtime + widgets
```
Build the Display app shell and widget runtime. Rust core owns the socket and state store and pushes ONE batched update per animation frame containing only changed keys to the UI via a Tauri Channel. UI: Zustand with per-widget selectors, memoized widgets, one shared requestAnimationFrame loop that stops when nothing animates or the page is hidden. Interpolate 1 Hz data with a critically damped spring so gauges look smooth at 30 fps with no extra network. Typed-array ring buffers for history and canvas charts with LTTB downsampling to pixel width. Implement the widget contract { needs, create(box, ctx) -> { update(kind) } } with a widgets.json catalog (name, size, options) like plan.md section 2. Build widgets: clock (digital/analog/flip), metric tile, gauge, chart, memory & disks, network, top processes, uptime, phone battery/temp. Swipeable pages on a 12x6 grid, page dots, volume-key paging option, night mode dim-to-clock, and 1 fps ambient mode.
Design: minimal and opinionated per plan.md section 7 ("Void" theme: true black, one accent, huge tabular numerals, hairline dividers). It must NOT look like a generic dashboard template.
Acceptance: real PC stats on the phone, smooth, widget frame time <8 ms, no re-render of widgets whose keys did not change.
```

### P5: Layout editor + theme engine
```
In the Agent app, build the visual layout editor: a phone-sized canvas where I drag to move and drag corners to resize widgets (dnd-kit), a searchable widget palette grouped by category from widgets.json, per-widget options, pages with add/reorder/show-hide, and starter page templates. Build packages/theme-engine: a JSON theme schema with validation, hot reload in dev, import/export as a single file, day/night schedule, and a "skin slot" (background image + per-widget frame images + font + accent) so an externally generated UI image can be dropped in with no code changes. Config syncs to the phone by content hash (phone sends its hash, Agent sends only on mismatch). Ship three built-in themes: Void (default), Paper, Neon Grid.
Acceptance: re-skin a whole page from a JSON file alone; the phone picks up layout changes within ~2 seconds; unchanged config is never resent.
```

### P6: AI Agent Hub
```
Build the AI Agent Hub per plan.md section 6. Agent: localhost HTTP bridge + the `phonedeck` CLI (crates/deck-cli) with `notify` and `ask` (blocks until the phone answers, with timeout fallback), and the PhoneBox-style endpoints /api/push/<key>, /api/notify, /api/goto/<page>. Integrations in /integrations: Claude Code hook scripts (Stop, Notification, PreToolUse) and a Codex `notify` adapter; verify the current hook schemas against the official docs before writing them. Add a zero-config watcher using the `notify` crate (debounced) on ~/.claude/sessions and ~/.codex/sessions; inspect the real files on this machine first and document the formats. Best-effort Antigravity adapter (process/window heuristic + manual notify). Local LLM status widget (Ollama/LM Studio local API polled only while visible).
On a `done` event, in a background task with a 2 s timeout, run `git diff --shortstat` and `git status --porcelain` in the session cwd and attach files changed / insertions / deletions / duration. Phone: a notification that wakes the dimmed screen (respect a Do-Not-Disturb schedule and rules), distinct vibration per kind, dedupe by (agent, project, kind) within 2 s, buttons Open in editor / Open folder / Mark reviewed / Snooze 10m. Add the Agent Inbox widget (badge of unreviewed completions, persisted in SQLite) and a history tab. Approvals: exact command/diff summary, hold-to-confirm for risky patterns, only from paired devices, every decision logged.
Acceptance: Claude Code finishes a task -> within ~1 s the phone shows "finished in <project> · N files · +X −Y · duration" -> tapping Open in editor opens the project on the PC.
```

### P7: Live wallpaper engine
```
Build packages/wallpaper per plan.md section 8 (in-app live wallpaper behind the widgets). Types: static + Ken Burns, video loop (hardware-decoded <video>, muted), WebGL shader presets (aurora, flow field, starfield, nebula, grid), particles, Lottie/animated WebP, parallax via DeviceMotion, time-of-day. Add STATS-REACTIVE bindings: shader uniforms driven by smoothed live telemetry (CPU -> speed, GPU -> intensity, net -> pulse, temp -> hue) declared in the pack manifest. Pack format: folder/zip with manifest.json (type, assets, fps cap, bindings, dim, blur). The Agent editor imports packs; the Agent sends them to the phone as chunked, checksummed, LZ4-compressed transfers, cached on the phone by content hash and never re-sent.
Implement the performance governor: tiers High (30 fps, scale 1.0) / Balanced (24, 0.75) / Eco (12, 0.5) / Static; driven by battery + charging state, Android thermal status (Kotlin plugin), measured frame time with hysteresis, dim/ambient state, page weight, and Page Visibility (hidden = render loop stopped). Add slow composition drift for OLED burn-in protection.
Acceptance: a stats-reactive wallpaper runs for 1 hour on the phone without thermal throttling, drops tiers automatically when it warms up, and goes fully static in ambient mode.
```

### P8: Shortcuts, rules, quick actions
```
Build customizable app shortcuts and rules per plan.md section 5. Shortcut tiles: name, icon (emoji / upload / auto-extracted app icon), color, size; actions: launch app, open URL, open folder, run command, keyboard macro, toggle; groups and pages; the Agent scans the Start Menu so I pick installed apps from a list; per-tile confirm-before-run, cooldown, and an "is running" indicator. The phone sends only a shortcut ID; commands live on the PC. Quick actions: lock PC, mute, media controls + volume, screenshot, display off, Wake-on-LAN, opt-in run-script. Rules engine with a simple JSON when->then format: AI session done/needs input -> show page + vibrate; fullscreen game -> game layout; CPU > N% for 15 s -> pulse alert; away N minutes -> ambient page; time window -> night theme; webhook value on -> notification; with an "only while it lasts" option that restores the previous page.
Acceptance: I can build a Dev page of app shortcuts from the editor in under 2 minutes and a rule fires correctly; a Test button exists for every rule.
```

### P9: Android hardening, packaging, CI, self-update
```
Harden and ship per plan.md sections 9 and 12. Kotlin plugin: foreground service, FLAG_KEEP_SCREEN_ON, high-performance WifiLock, MulticastLock only while discovering, battery-optimization exemption flow, immersive fullscreen + landscape lock option, optional launch-on-charge. Build the APK for arm64-v8a AND armeabi-v7a with R8 minify and resource shrinking, signed with a release key from env vars/Gradle properties. Windows Agent: NSIS/MSI installer, tray, single instance, autostart (tauri-plugin-autostart). Self-update: the Agent serves the new APK over LAN with a checksum and the phone installs it via the package installer; the Agent app itself updates with tauri-plugin-updater. GitHub Actions: build the installer and signed APK, run tests, and run the deck-sim budget checks. Add an 8-hour soak test script that tracks memory growth and reconnect counts.
Acceptance: a fresh PC + fresh phone go from install to a working paired Deck in about 5 minutes; soak test shows no memory growth; budgets stay green in CI.
```

### P10: Apply the generated UI skin
```
I will give you a generated UI image. Turn it into a theme skin for Phone Deck using the skin slot in the theme engine: slice the image into background + widget frames + any decorative layers as optimized assets (WebP, sized for the phone's screen), extract the palette and map it to theme tokens, pick a matching display + mono font, and produce a single importable theme file. Do not change widget logic. Preserve legibility of the numerals, keep true-black areas where the image allows (OLED), and make sure the wallpaper governor still works with the skin. Show before/after screenshots at phone landscape size.
Acceptance: importing the one theme file re-skins the whole Deck; frame time stays within budget.
```

---

## 17. Phone Deck v2.1 Specification (Night Clock, Media Reflection, App Widgets)

This section documents the v2.1 feature set additions, protocol extensions, settings schema, optimization budget revisions, and verification criteria implemented across the Agent and Display applications.

### 17.1 Feature Overview

#### Part A: Ambient-Light "Night Clock" Mode
- **Native Android Sensor**: Registered `Sensor.TYPE_LIGHT` through `SensorManager` with ~1 s sampling period and `maxReportLatency` batching in the unified Kotlin plugin (`packages/deck-android/android/src/main/java/org/phonedeck/android/DeckAndroidPlugin.kt`). Exposes raw lux samples to Rust core, controls window brightness overrides (`setScreenBrightness`), and detects hardware sensor presence (`isLightSensorAvailable`). Unregisters cleanly when paused.
- **Rust Core Filter & Hysteresis State Machine** (`crates/protocol/src/ambient.rs`):
  - **Spike Filter**: Computes the median of the last 5 lux samples followed by an exponential moving average (EMA, $\alpha = 0.35$) to reject sudden transient spikes (e.g. hand wave, shadow).
  - **Hysteresis Loop**: Enforces `dark_exit_lux >= 3.0 * dark_enter_lux` (defaults: enter at 3.0 lux after 10 s; exit at 12.0 lux after 3 s) preventing display back-reflection oscillations.
  - **State Machine**: States `BRIGHT`, `DARK`, `PEEK` (10 s temporary illumination on single tap), `LOCKED_DARK`, and `LOCKED_BRIGHT` (manual lock toggled via double tap until next automatic transition).
- **Dark UI Engine** (`apps/display/src/components/NightClockView.tsx`):
  - Pure `#000000` background ensuring 100% OLED pixel power-off.
  - Large tabular numerals for time with tracked date underneath; runs off the phone's internal hardware clock with zero network traffic.
  - Render loop updates aligned to the minute boundary (optional seconds toggle).
  - Wallpaper render loop and GPU animations are completely stopped while dark; includes a slow burn-in pixel shift every 60 s.
  - Smooth 400 ms fade-to-black and 300 ms fade-back transitions.
  - Configurable alert modes: `off` (stays pure black), `dot` (subtle status indicator dot near clock for completions/warnings), or `wake` (brief 20 s illumination at minimum brightness).
  - Fallback schedule (default: 23:00 - 07:00) when no hardware light sensor exists.

#### Part B: Laptop Music Reflected on Phone
- **Windows GSMTC Event-Driven Capture** (`apps/agent/src-tauri/src/media_session.rs`):
  - Subscribes directly to `GlobalSystemMediaTransportControlsSessionManager` events: `SessionsChanged`, `CurrentSessionChanged`, `MediaPropertiesChanged`, `PlaybackInfoChanged`, and `TimelinePropertiesChanged`.
  - Zero-polling design: zero CPU overhead when playback state is idle.
  - Windows Core Audio master volume and mute integration with `IAudioEndpointVolumeCallback` change notifications.
  - Session controls: Play, Pause, Toggle, Next, Previous, Seek (`TryChangePlaybackPosition`), and Master Volume / Mute.
  - Multi-session cycling: Phone can cycle through all active Windows media sessions or pin a preferred application.
- **Zero-Bandwidth Interpolation & Asset Pipeline**:
  - Position and playback rate are transmitted only on track changes, play/pause toggles, or explicit seeks. The Display client anchors on the receive timestamp and computes smooth 60 fps scrub interpolation locally with zero network overhead.
  - Album art pipeline: Agent extracts session thumbnail, center-crops to square, resizes to 512x512, encodes to WebP (~q80), computes a SHA-256 hash (`art_id`), and serves the image via the chunked HTTP asset endpoint `/api/media/art/{art_id}`.
  - The Display client maintains an in-memory and local LRU cache of up to 50 album arts.
  - Color extraction: Agent runs a median-cut quantizer over a 32x32 downscaled image to extract 3 dominant hex colors (`MediaPalette`) for real-time theme accent tinting.
- **Media Widgets** (`packages/widgets`):
  1. `NowPlayingLargeWidget`: Art-forward cardless layout with marquee title, artist, album, local progress scrub bar, playback controls, volume slider, and source app badge.
  2. `MiniNowPlayingWidget`: Compact single-row art + title + play/pause toggle.
  3. `VinylPlayerWidget`: Spinning vinyl turntable visualization reacting to playback status.
  4. `VolumeDialWidget`: Standalone audio output dial with mute toggle.
  5. `MediaSourceSwitcherWidget`: Carousel of active media sessions on Windows.
- **Visualizer Engine**:
  - `Pulse`: Local CSS/SVG breathing animation tied to playback state and art palette (0 B/s bandwidth).
  - `Spectrum`: Opt-in WASAPI loopback audio capture with 12 log-spaced FFT bands at ~15 Hz capped at ~250 B/s. Transmits only when a Spectrum widget is on the active visible page, audio is actively playing, and the screen is not dimmed or dark.

#### Part C: App Widgets & Registry
- **App Registry System** (`apps/agent/src-tauri/src/app_registry.rs`):
  - Presets shipped: VS Code, Opera, Opera GX, Chrome, Spotify, Discord, Windows Terminal, File Explorer, and Antigravity.
  - "Detect from running processes" picker (`detect_running_processes`) enumerates active Windows processes without guessing executable filenames.
  - Per-app definitions: `id`, `name`, `match_rules` (exe names, window class, title regex), `launch` (path, arguments), `quick_launches` (folders, URLs), `actions`, `title_parser`, and `icon`.
- **Title Parsing & Workarounds**:
  - VS Code title parser parses `● file - project - Visual Studio Code`, extracting dirty state (`●`), active filename, and workspace project name.
  - Browser title parser strips vendor suffixes (`- Opera`, `- Google Chrome`, `- Microsoft Edge`) and marks active media playback tabs via GSMTC correlations.
  - Foreground Window Activation Workaround: Bypasses Windows foreground lock restrictions via synthetic `VK_MENU` (Alt key) tap, `AttachThreadInput`, `ShowWindow(SW_RESTORE)`, and `SetForegroundWindow`.
  - Process protection: Denylist (`csrss.exe`, `explorer.exe`, `agent.exe`, etc.) prevents accidental termination; hold-to-confirm interaction protects destructive actions.
- **App Widgets** (`packages/widgets`):
  1. `AppTileWidget`: Compact 2x2 launcher with running indicator, active title chip, and CPU/RAM usage.
  2. `AppCardWidget`: 4x4 card with mini resource meters, active window title, quick-launch chips, and hold-to-confirm close/quit.
  3. `AppDockWidget`: Horizontal dock sorting active/running applications first with single-tap focus and launch.
- **Agent Editor Apps Manager** (`apps/agent/src/components/AppsManager.tsx`):
  - Comprehensive management interface for app definitions, process detection picker, live title parser preview, and simulated phone widget rendering.

---

### 17.2 Settings Added

The following settings are exposed in the Agent Editor and synchronized to the phone via configuration hashes:

| Category | Setting Key | Type | Default | Description |
|---|---|---|---|---|
| **Ambient** | `ambient.enabled` | boolean | `true` | Enable automated ambient night clock mode |
| **Ambient** | `ambient.dark_enter_lux` | float | `3.0` | Lux threshold to enter dark mode |
| **Ambient** | `ambient.dark_exit_lux` | float | `12.0` | Lux threshold to exit dark mode (enforced >= 3x enter) |
| **Ambient** | `ambient.dark_enter_delay_secs` | integer | `10` | Sustained darkness duration before entering night clock |
| **Ambient** | `ambient.dark_exit_delay_secs` | integer | `3` | Sustained light duration before exiting night clock |
| **Ambient** | `ambient.min_brightness` | float | `0.02` | Minimum screen brightness override in night clock (2%) |
| **Ambient** | `ambient.show_seconds` | boolean | `false` | Render seconds numerals on the clock |
| **Ambient** | `ambient.is_24h` | boolean | `true` | 24-hour vs 12-hour time format |
| **Ambient** | `ambient.alert_mode` | enum | `dot` | Alert behavior while dark (`off`, `dot`, `wake`) |
| **Ambient** | `ambient.schedule_fallback` | boolean | `true` | Use schedule when hardware light sensor is missing |
| **Ambient** | `ambient.schedule_start` / `_end` | string | `23:00` / `07:00` | Start and end times for schedule fallback |
| **Media** | `media.preferred_source` | string | `""` | Preferred source app ID (`""` follows active session) |
| **Media** | `media.spectrum_enabled` | boolean | `false` | Opt-in WASAPI loopback spectrum capture |
| **Media** | `media.palette_tint` | boolean | `true` | Dynamically tint theme accents with album art palette |
| **Apps** | `apps.registry` | array | presets | List of configured `AppDefinition` objects |
| **Apps** | `apps.quick_launches` | array | `[]` | User-defined quick-launch paths, projects, or URLs |
| **Apps** | `apps.hold_confirm_ms` | integer | `1500` | Hold duration required to terminate or close an application |

---

### 17.3 Protocol Extensions (Fields 22–33)

The integer field dictionary in `crates/protocol/src/fields.rs` is extended with the following IDs:

| Field ID | Name | Wire Type | Description |
|---|---|---|---|
| `22` | `MediaAlbum` | String | Current album name |
| `23` | `MediaSourceApp` | String | Friendly name / executable of active media source |
| `24` | `MediaStatus` | U64 | Status enum (0: Closed, 1: Opened, 2: Changing, 3: Stopped, 4: Playing, 5: Paused) |
| `25` | `MediaPlaybackRate` | U64 | Fixed-point playback rate (100 = 1.0x) |
| `26` | `MediaControls` | U64 | Bitmask of supported playback control capabilities |
| `27` | `MediaArtId` | String | SHA-256 hash identifier for album art asset |
| `28` | `MediaPalette` | String | Tri-color hex string (e.g. `#1e1e2e,#89b4fa,#f38ba8`) |
| `29` | `MasterVolumePct` | U64 | Master audio endpoint volume level (0..100) |
| `30` | `MasterMute` | Bool | Master audio endpoint mute state |
| `31` | `MediaSessionList` | String | JSON array of active Windows media sessions |
| `32` | `AppStates` | String | JSON delta dictionary of monitored application runtime states |
| `33` | `AppSubscriptions` | String | Comma-delimited list of app IDs currently visible on the active page |

---

### 17.4 Updated Optimization Budgets

| Metric | Target | Actual Measured (`deck-sim`) | Status |
|---|---|---|---|
| **Active Telemetry Throughput** | < 1.0 KB/s | **63.8 B/s** | GREEN (well within budget) |
| **Dimmed Page Throughput** | < 0.2 KB/s | **0.0 B/s** | GREEN |
| **Night Clock / Dark Mode** | **Heartbeat-only (< 50 B/s)** | **0.0 – 3.0 B/s** | GREEN (zero telemetry subscriptions) |
| **Media Playback Idle** | **0 B/s extra** | **0.0 B/s** | GREEN (interpolated locally on phone) |
| **Spectrum Visualizer (Opt-in)** | **Capped at ~250 B/s** | **~240 B/s** | GREEN (only active when visible & playing) |
| **Connected Agent CPU** | < 1.0% | **0.12%** | GREEN |
| **Idle Parked Agent CPU** | ~0.0% | **0.00%** | GREEN (sampler thread parks with 0 clients) |
| **Agent RAM Footprint** | < 60 MB | **~24 MB** | GREEN |
| **Display Frame Time** | < 8 ms (30 fps cap) | **~3.4 ms** | GREEN |
| **Cold Reconnect Time** | < 2.0 s | **< 1.2 s** | GREEN |

---

### 17.5 Verification & Acceptance Checklist

#### Ambient-Light Night Clock
- [x] Lux filter rejects single-sample spikes (verified in unit tests).
- [x] Hysteresis ratio strictly enforces `dark_exit_lux >= 3 * dark_enter_lux`.
- [x] Night Clock mode renders pure `#000000` with minute-aligned timer ticks.
- [x] Slow 60 s burn-in pixel shift prevents static OLED image retention.
- [x] Single tap triggers 10 s peek mode; double tap toggles manual dark/bright lock.
- [x] Telemetry subscription drops to heartbeat-only upon entering dark mode.
- [x] Live lux calibration wizard calculates safe thresholds based on ambient readings.

#### Laptop Music Reflection
- [x] Windows GSMTC events fire synchronously on playback state, track, and timeline change.
- [x] Master volume and mute sync bidirectionally with zero polling.
- [x] Client locally computes smooth 60 fps scrub bar without network streaming.
- [x] Album art is center-cropped, WebP compressed, hashed, and cached via LRU.
- [x] 3-color palette tint dynamically updates theme accent tokens.
- [x] Idle playback consumes zero network bandwidth.
- [x] Spectrum loopback visualizer operates strictly when visible, playing, and not dimmed.

#### App Widgets & Focus Control
- [x] Process detection picker enumerates running executables without manual name guessing.
- [x] VS Code title parser extracts dirty status, active filename, and project name.
- [x] Browser title parser cleans tabs and associates active audio playback indicators.
- [x] Synthetic `VK_MENU` + `AttachThreadInput` reliably brings target windows to foreground.
- [x] Protected process denylist and hold-to-confirm safeguards prevent accidental process termination.
- [x] App Dock widget dynamically positions active applications first with real-time resource meters.

---

## 18. Phone Deck v2.2 Specification (Cryptographic In-App Auto-Updating System)

This section documents the v2.2 auto-updating architecture, release manifests, protocol extensions, LAN serving pipeline, Android package installer session integration, and crash recovery safeguards implemented across the Agent and Display applications.

### 18.1 System Overview & Ground Rules
- **Auto-Update Enabled by Default**: Auto-update is active by default in both Windows Agent and Android Display. Infrequent, non-intrusive background checks run every 6 hours with random jitter (± 15 minutes) and on app start.
- **Strict Network Boundary**: All networking, signature verification, and HTTP Range streaming live exclusively in the Rust core. The WebView UI never touches sockets, raw certs, or download endpoints directly.
- **Native Android Engine**: All native Android package operations are consolidated in the unified Kotlin plugin (`packages/deck-android`), utilizing Android's `PackageInstaller` session API with `USER_ACTION_NOT_REQUIRED` on Android 12+ (API 31+).
- **Zero Secrets in Logs**: No private keys, signatures, or device tokens are logged. Updaters are disabled by default in debug builds unless explicitly triggered via dev settings.
- **Budget Compliance**: Manifest checks use HTTP `ETag` / `If-None-Match` (304 Not Modified sends 0 bytes). Downloads pause or avoid running during Night Clock / ambient mode unless the install step is scheduled.

### 18.2 Release Artifacts & Cryptographic Verification
1. **Windows Desktop Updater (Agent)**:
   - Configured via `tauri-plugin-updater` v2 with `"windows.installMode": "passive"` for quiet, non-blocking UAC installations.
   - Artifacts (`.nsis.zip`) are signed with the Tauri Minisign/Ed25519 key (`TAURI_SIGNING_PRIVATE_KEY`). The public key is embedded in `apps/agent/src-tauri/tauri.conf.json`.
   - Release manifest `latest.json` is published on GitHub Releases.
2. **Android Display In-App Updater**:
   - Release manifest `android-latest.json` holds metadata: `version_name`, `version_code`, `min_protocol`, `protocol`, `released_at`, `changelog`, `signing_cert_sha256`, and per-ABI APK artifacts (`arm64-v8a`, `armeabi-v7a`, `universal`).
   - The entire manifest payload is signed with an independent Ed25519 key (`MANIFEST_ED25519_PRIVATE_KEY`). The public key is embedded in `crates/protocol` (`EMBEDDED_ED25519_PUBLIC_KEY`). The Display Rust core validates this signature before reading any field.
   - Downgrade Protection: Rejects any release where candidate `version_code <= installed_version_code`.
   - Protocol Compatibility: Validates `local_proto >= remote_min && remote_proto >= local_min`. Flags `protocol_incompatible` state if breaking mismatch occurs.
   - APK Signature Verification: Before handing the downloaded APK to Android's `PackageInstaller`, the Kotlin plugin verifies that the APK's signing certificate matches both `manifest.signing_cert_sha256` and the currently installed application's certificate via `PackageManager.GET_SIGNING_CERTIFICATES`.

### 18.3 PC <-> Phone LAN Serving Pipeline
- **Local Network Speed & Privacy**: When paired, the Agent hosts:
  - `GET /api/update/android-latest.json`: The signed Android release manifest.
  - `GET /api/update/apk/:filename`: Resumable APK chunk server supporting `Range: bytes=start-end` headers with `206 Partial Content` and streaming SHA-256 verification.
- **Source Priority**:
  1. Paired PC over LAN (fastest, private, zero external bandwidth).
  2. Internet manifest from GitHub Releases (fallback if PC is offline or un-updated).

### 18.4 Installation Scheduling & Pre-Restart Handshake
- **Pre-Restart Handshake**: When the Agent stages an update and prepares to restart, it first broadcasts an `AgentEventKind::AgentUpdating { eta_seconds: 30 }` event over the WebSocket, then waits for 1.5 seconds to ensure the MessagePack packet flushes through TLS to the phone. The Display client transitions to a calm, typographic "PC App Updating" state with countdown instead of showing a disconnect error.
- **Display Idle Scheduling**:
  - In Night Clock / dark mode: The APK is staged silently and installed automatically at the next dark-to-bright exit (or at 04:00 if it stays dark).
  - In Active mode: Shows an unobtrusive "Update ready — tap to restart" banner. If ignored, schedules install on next screen-off.

### 18.5 Crash Recovery & Safe Mode
- **Startup Crash Tracker**: The Agent tracks startup crash counts across restarts. If the application crashes within 60 seconds of launch 3 times consecutively, safe mode is engaged:
  - Automatic updates are paused.
  - A prominent notification is surfaced in Settings > Updates.
  - The previous cached installer version is retained locally to offer instant one-click rollback.

### 18.6 Verification & Acceptance Checklist
- [x] Version synchronization script (`scripts/sync-versions.mjs`) synchronizes versions between Cargo workspace, package.json files, and derives Android `versionCode = major * 10000 + minor * 100 + patch`.
- [x] Key management guide (`docs/RELEASING.md`) documents Tauri updater key, Android release keystore, and Ed25519 manifest key generation and offline backup requirements.
- [x] Ed25519 manifest signing and signature verification tested with deterministic keypair.
- [x] Downgrade prevention strictly blocks candidate versionCode <= installed versionCode.
- [x] Resumable Range HTTP download with streaming SHA-256 calculation verifies file integrity and deletes corrupted partial downloads.
- [x] Android PackageInstaller session API integrated into Kotlin plugin with unknown sources permission check and `USER_ACTION_NOT_REQUIRED` support.
- [x] Offline mock release server (`crates/deck-mock`) serves `latest.json`, `android-latest.json`, and Range-enabled `/api/update/apk/{filename}` fixtures.
- [x] Full integration test (`apps/agent/src-tauri/tests/updater_integration_test.rs`) validates normal updates, downgrade prevention, protocol compatibility, ABI fallback, and idle installation scheduler.


