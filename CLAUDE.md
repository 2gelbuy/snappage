# Local Claude Instructions

<!-- root-claude-rules -->
@/home/tugelbay/Projects/CLAUDE.md

Root Claude rules apply first. These local notes only add project-specific context.

---

# SnapPage — Full Page Screenshot Chrome Extension

> Part of Mirana Apps portfolio. Parent: /home/tugelbay/Projects/MiranaApps/CLAUDE.md
> CWS knowledge: /mnt/c/Brain/Knowledge/cws-unified.md

## This Extension

- **CWS ID:** mpgnpajldjibfcaiainoilfdbpconncg
- **Niche:** Full page screenshots (capture, edit, download)
- **USP:** Lightweight (34KB), free editor+blur, smart naming, sticky element handling
- **Landing:** konabayev.com/snappage/

## Tech Stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Framework    | WXT 0.20.13 (Manifest V3)                     |
| Language     | TypeScript 5.0 (strict, 0 errors)             |
| Build        | Vite + WXT bundler                            |
| Dependencies | jsPDF 4.2.1, Tesseract.js 7.0.0 (OCR planned) |

## Architecture

- 3 capture modes: Full Page, Visible Area, Selection
- Scroll + captureVisibleTab + canvas tile stitching
- Sticky element handling (display:none during capture)
- Tile overlap 200px (prevents subpixel gaps)
- Capture delay 350ms (wait for lazy-loaded content)
- Direct chrome.downloads (editor tab approach abandoned)
- Green theme icons (differentiates from GoFullPage blue, FireShot red)
- Build output: 34.12 KB total, 16.59 KB zipped

## Key Files

- `src/entrypoints/background.ts` (521 lines) — capture orchestrator
- `src/entrypoints/popup/main.ts` (282 lines) — mode selector, format/quality controls
- `src/utils/messages.ts` — typed message definitions (discriminated unions)
- `src/utils/constants.ts` — MAX_PAGE_HEIGHT=30000px
- `src/utils/sanitize.ts` — filename sanitization, path traversal prevention

## Known Issues

- PDF export broken (jsPDF html() imports html2canvas which fails in extension context)
- Editor code exists but bypassed (774 lines dead code, should remove)
- 0 tests (Playwright installed but not configured)
- No GitHub Actions CI (release.yml exists but never triggered)

## CWS Status

- Uploaded, needs screenshots + dashboard submit
- Privacy policy, landing page, uninstall page NOT yet created on konabayev.com

## Competitors (from STRATEGY.md)

- GoFullPage: 10M users (charges $1/mo for editor)
- FireShot: 3M users (charges $40+ for PDF)
- Awesome Screenshot: 3M users (cloud-based, privacy concern)

## CWS Publish via API (NEVER manual dashboard)

Upload + publish = 2 API calls. See /mnt/c/Brain/Knowledge/cws-unified.md for commands.
Credentials: /home/tugelbay/Projects/MiranaApps/.env.shared

## Session Context

Read `AI_STATUS.md` before starting any work. Keep it updated.
