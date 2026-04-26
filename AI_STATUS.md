# Project Status

> Auto-updated. Read this before starting any work.
> Last updated: 2026-04-26 11:40

## Goal

Build SnapPage as a privacy-first Chrome extension for local full-page, visible-area, and selected-region screenshots. Current priority is Chrome Web Store rejection recovery with truthful MVP scope.

## In Progress

- Chrome Web Store rejection recovery for v0.2.0 is complete.
- v0.2.1 is uploaded and resubmitted to Chrome Web Store review.

## Done

- Project scaffolding with WXT
- Full audit (2026-03-20): Architecture, UI/UX, Security, Market Research
- Competitive landscape research
- Monetization + growth strategy (STRATEGY.md)
- **MVP BUILT:**
  - Full-page capture engine (scroll + captureVisibleTab + offscreen canvas stitch)
  - Visible area capture mode
  - Sticky/fixed element auto-hide during capture
  - Smart auto-naming ({domain}_{title}_{date})
  - Typed message system (discriminated unions)
  - Offscreen document for canvas stitching (DPR-aware)
  - Full popup UI: mode selector, format/quality settings, progress bar, loading/success/error states
  - Design system: CSS custom properties, dark mode, accessibility (aria-live, focus-visible)
  - Keyboard shortcut: Alt+Shift+S
  - Auto-generated icons (16/32/48/128px, green theme)
  - Security: CSP, sender.id validation, filename sanitization, 30K px page height limit
  - Settings persistence (chrome.storage.local)
  - TypeScript: 0 errors, strict mode
  - Chrome build works with Manifest V3
- **v0.2.1 rescue prep (2026-04-26):**
  - Removed unsupported public claims for editor, PDF export, OCR, and auto-redaction from store listing and local privacy policy.
  - Confirmed generated Chrome manifest permissions are `activeTab`, `scripting`, `downloads`, `tabs`, and `storage`; no `unlimitedStorage` in the current build output.
  - Bumped package and popup version to 0.2.1 for a clean resubmission package.
  - Built `.output/snappage-extension-0.2.1-chrome.zip` and submitted it to CWS item `mpgnpajldjibfcaiainoilfdbpconncg`; API status is now `PENDING_REVIEW` for version `0.2.1`.
  - Built `.output/snappage-extension-0.2.1-firefox.zip` plus source package for AMO readiness.

## Next Up

1. Monitor CWS review for v0.2.1; if approved, replace coming-soon CTAs on konabayev.com with the public install link.
2. Add AMO extension slug/JWT config, then submit the prepared Firefox package.
3. Create the first Microsoft Edge Add-ons product in Partner Center to obtain `EDGE_PRODUCT_ID`; API automation can handle updates after that.
4. Build editor/PDF/OCR only after the capture MVP is approved, then update copy and screenshots.

## Key Decisions

- **Framework:** WXT 0.20.20 (Manifest V3)
- **Architecture:** Programmatic injection, offscreen canvas stitching, typed messages
- **Security:** Explicit CSP, sender validation, filename sanitization, 30K px limit, dev-only logging
- **Monetization:** Keep free MVP until approval and traction; revisit paid editor/OCR after core listing is live.
- **Privacy-first:** No analytics, telemetry, remote AI, or screenshot uploads during normal use.
- **Positioning:** "The Privacy-First Smart Screenshot Tool"

<!-- AUTO:GIT_LOG -->

## Recent Commits

```
d8c0fa9 auto: AI_STATUS.md
b32973b auto: AI_STATUS.md
b946ca4 auto: AI_STATUS.md
7b58df6 auto: AI_STATUS.md
70bdacb auto: AI_STATUS.md
0ee5fc7 auto: AI_STATUS.md
d4f1c75 auto: AI_STATUS.md
aa35116 auto: AI_STATUS.md
269fc51 auto: AI_STATUS.md
9af4dbb auto: AI_STATUS.md
```

<!-- /AUTO:GIT_LOG -->

<!-- AUTO:GIT_STATUS -->

## Uncommitted Changes

Branch: `master`
_Clean working tree._

<!-- /AUTO:GIT_STATUS -->
