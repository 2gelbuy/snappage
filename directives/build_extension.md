# Build Full-Page Screenshot Extension

## Goal
Create a Chrome extension that captures full-page screenshots (including scrollable content).

## Inputs
- User clicks extension icon or presses hotkey

## Tools Used
- `tools/capture_screenshot.js` (content script)
- `tools/stitch_images.js` (image processing)

## Outputs
- PNG file saved to Downloads or clipboard

## Edge Cases
- Lazy-loaded content (may need scroll-wait)
- Fixed/sticky headers (duplicate in stitched image)
- Pages with iframes
- Very long pages (memory limits)

## Notes
- MV3 compatible
- No external dependencies if possible
