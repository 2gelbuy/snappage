export const MAX_PAGE_HEIGHT = 30000;
export const MAX_CAPTURE_TILES = 100;
// Largest single canvas side (in device pixels) we will allocate. Browsers cap
// canvas dimensions around 16384px; a tall page at devicePixelRatio > 1 blows
// past that (e.g. 20000px × DPR 2 = 40000px) and produces a blank/broken image.
// We downscale the stitched output to stay within this bound instead.
export const MAX_CANVAS_DIM = 16384;
export const SCROLL_SETTLE_DELAY = 300;
export const CAPTURE_DELAY = 150;
export const FILENAME_MAX_LENGTH = 200;
export const FILENAME_SANITIZE_REGEX = /[^a-zA-Z0-9._\-\s]/g;
