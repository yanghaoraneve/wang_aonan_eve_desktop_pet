# Wang Aonan EVE Desktop Pet

This repository contains the generated desktop pet resources for a chibi Wang Aonan EVE character, plus a cross-platform desktop pet application.

## Desktop App

See [`app/README.md`](app/README.md) for the Tauri 2 desktop pet (Windows + macOS):

- Transparent always-on-top pet window with sprite animations
- OpenAI-compatible Agent chat with streaming and multi-turn memory
- System tray, edge walking, dress-up skins, autostart

```bash
cd app
npm install
npm run tauri:dev
```

## Asset Resources

- `codex-pet/`
  - `pet.json`: Codex custom pet manifest.
  - `spritesheet.webp`: final 9-row animated pet atlas.
- `qa/`
  - `contact-sheet.png`: visual overview of all animation states.
  - `validation.json`: atlas validation output.
  - `previews/*.gif`: per-state animation previews.
- `dressup-assets/`
  - `manifest.json`: dress-up skin metadata.
  - `animated-manifest.json`: full animated outfit atlas metadata.
  - `animated/*/spritesheet.webp`: three complete hatch-pet animated outfits.
  - `skins/*.png`: transparent outfit/skin PNGs.
  - `previews/skins-contact-sheet-v1.png`: dress-up skin preview sheet.

## Pet Atlas

The Codex pet atlas is `1536x1872`, made from `192x208` cells:

1. idle
2. running-right
3. running-left
4. waving
5. jumping
6. failed
7. waiting
8. running
9. review

The latest validation reports RGBA WebP output with no transparent RGB residue and no validation errors.
