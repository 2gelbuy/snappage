# Full Page Screenshot Master

Capture entire web pages as a single screenshot. 100% private -- nothing leaves your browser.

## Features

- Full-page capture (scrolls and stitches automatically)
- Visible area capture
- Smart auto-naming: `{domain}_{title}_{date}.png`
- Auto-hides sticky headers/footers during capture
- PNG and JPG format with quality control
- Dark mode support
- Keyboard shortcut: `Alt+Shift+S`
- Lightweight: 34 KB total, 16 KB zip

## Development

```bash
npm install
npm run dev          # development with HMR
npm run build        # production build
npm run zip          # create Chrome Web Store zip
npm run compile      # TypeScript type check
```

## Load in Chrome

1. `npm run build`
2. Open `chrome://extensions`
3. Enable Developer Mode
4. Click "Load unpacked"
5. Select `.output/chrome-mv3/`

## Architecture

```
entrypoints/
  background.ts              # Capture orchestrator (service worker)
  popup/                     # Extension popup UI
    index.html / main.ts / style.css
  offscreen/                 # Canvas stitching (offscreen document)
    index.html / main.ts
utils/
  messages.ts                # Typed message definitions
  constants.ts               # Shared constants
  sanitize.ts                # Filename sanitization
assets/icons/
  icon.svg                   # Source icon (auto-generates PNG sizes)
```

## Capture Flow

```
Popup -> START_CAPTURE -> Background Service Worker
  1. Inject scroll measurement script (programmatic)
  2. Hide sticky/fixed elements
  3. Loop: scroll -> captureVisibleTab -> collect tiles
  4. Send tiles to Offscreen Document
  5. Canvas stitch at device pixel ratio
  6. Download final image
  7. Restore page state
```

## Security

- Manifest V3 with explicit CSP
- `activeTab` + `scripting` (minimal permissions)
- Sender ID validation on all messages
- Filename sanitization (path traversal prevention)
- 30,000px max page height (memory protection)
- Dev-only logging (no console.log in production)
