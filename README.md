# Phone Deck

Turn an old Android phone into a Steam-Deck-style companion screen for your PC. Live stats, AI-agent "done, go review" alerts, one-tap shortcuts, and a live wallpaper. 100% local over your Wi-Fi, featherweight on bandwidth and battery.

## Architecture

- **Agent (`apps/agent`)**: Windows-first desktop application (Tauri 2) with system tray, visual layout editor, settings, and QR pairing generator.
- **Display (`apps/display`)**: Android application (Tauri 2) running full-screen on an Android phone as a companion dashboard.
- **Core Crates (`crates/`)**:
  - `protocol`: Shared MessagePack envelope, integer field-ID dictionary, delta encoder/decoder.
  - `deck-cli`: `phonedeck` CLI for agent hooks and approvals (`phonedeck notify`, `phonedeck ask`).
  - `deck-mock`: Mock agent streaming simulated telemetry for browser-first UI development.
  - `deck-sim`: Headless phone simulator enforcing performance and telemetry budgets in CI.
- **Packages (`packages/`)**:
  - `ui-kit`: Void design tokens, hairline dividers, tabular numerals.
  - `theme-engine`: JSON theme schema and validation (Void, Paper, Neon Grid).
  - `widgets`: Widget runtime contract and `widgets.json` catalog.
  - `wallpaper`: Live wallpaper engine, performance governor, and presets.

---

## Getting Started

### Prerequisites

- **Rust** (stable MSVC): `rustc`, `cargo`
- **Node.js** (v20+) & **pnpm**: `pnpm install`
- **MSVC Build Tools**: Visual Studio C++ Build Tools on Windows
- **Android SDK & NDK** (for building Android Display APK):
  - `ANDROID_HOME` pointing to Android SDK
  - `NDK_HOME` pointing to Android NDK
  - JDK 17 with `JAVA_HOME` set
  - Rust targets: `rustup target add aarch64-linux-android armv7-linux-androideabi`

### Installation

```bash
# Install workspace dependencies
pnpm install

# Build all Rust crates and Tauri backends
cargo build --workspace
```

---

## Running Development Servers

### 1. Agent Desktop UI
Starts Vite dev server for the desktop Agent application:
```bash
pnpm dev
# Or with Tauri desktop shell:
pnpm --filter @phone-deck/agent tauri dev
```

### 2. Display Phone Dashboard UI
Starts Vite dev server for the Display UI in a desktop browser at landscape phone viewport (~780x360 CSS px):
```bash
pnpm dev:display
```

---

## Building Releases

### Agent Desktop App (Windows)
```bash
pnpm --filter @phone-deck/agent tauri build
```

### Display Android APK
Initialize Android target (run once):
```bash
pnpm --filter @phone-deck/display tauri android init
```
Build debug APK:
```bash
pnpm --filter @phone-deck/display tauri android build --debug
```

---

## Optimization Budgets (plan.md Section 10)

- **Telemetry Active Page**: 100–300 B/s (Hard ceiling: 1.0 KB/s)
- **Telemetry Dimmed**: < 0.2 KB/s
- **Agent CPU**: < 1% connected, ~0% idle
- **Agent RAM**: < 60 MB
- **Display Frame Time**: < 8 ms at 30 fps cap
- **Cold Reconnect**: < 2 s on same Wi-Fi
