# EVE Desktop Pet App

王澳楠 EVE Q版桌宠 — Tauri 2 + TypeScript + Preact

## Prerequisites

- Node.js 18+
- Rust stable (`rustup default stable`)
- Windows: WebView2 (usually preinstalled on Win10+)
- macOS: Xcode Command Line Tools

## Development

```bash
cd app
npm install
npm run tauri:dev
```

## Build

```bash
cd app
npm install
npm run tauri:build
```

Outputs:
- Windows: `src-tauri/target/release/bundle/msi/` or `nsis/`
- macOS: `src-tauri/target/release/bundle/dmg/`

## Usage

1. Launch the app — a transparent pet window appears on desktop
2. **Click** — waving animation
3. **Double-click** — open chat window
4. **Drag** — move pet; release triggers jump animation
5. **Screen edges** — pet walks along left/right edges
6. **Tray icon** — show/hide pet, chat, settings, quit
7. Configure API Key in Settings (OpenAI-compatible endpoint)

## Project Structure

- `src/pet/` — Canvas renderer & state machine
- `src/chat/` — OpenAI-compatible streaming client
- `src/ui/` — Chat & Settings (Preact)
- `src-tauri/` — Rust backend (tray, edge walk, SQLite, keychain)
- `public/assets/` — spritesheet, skins, manifests

## Bundle Size

Release excludes `qa/` dev assets. Runtime assets ~3.5 MB + Tauri binary ~8–15 MB.
