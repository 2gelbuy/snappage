// Pure helpers for the optional URL + date band stamped on top of a capture.
// Rendering lives in the background script; everything here is testable
// without a canvas.

const pad = (n: number) => String(n).padStart(2, "0");

/** Local capture date, e.g. "2026-11-17"; shared by the stamp and file name. */
export function formatCaptureDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local capture time with its UTC offset, e.g. "2026-11-17 14:03 UTC+05:00". */
export function formatCaptureTime(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${formatCaptureDate(date)} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())} ` +
    `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export interface StampLayout {
  /** Factor applied to the source image so the result fits maxDim. */
  readonly scale: number;
  readonly width: number;
  readonly imageHeight: number;
  readonly bandHeight: number;
  /** Text lines in the band: 1 (URL and time side by side) or 2 (stacked). */
  readonly lines: 1 | 2;
  readonly fontSize: number;
  readonly padding: number;
  readonly height: number;
}

/**
 * Size of the stamped output. The band scales with image width so it reads the
 * same on a small selection and a retina full page; the whole output is
 * shrunk when the extra band would push a side past maxDim. A two-line band
 * stacks the time under the URL for captures too narrow to fit both.
 */
export function stampLayout(
  imageWidth: number,
  imageHeight: number,
  maxDim: number,
  lines: 1 | 2 = 1,
): StampLayout {
  const line = (w: number) => Math.min(72, Math.max(28, Math.round(w * 0.022)));
  const band = (w: number) =>
    lines === 1 ? line(w) : Math.round(line(w) * 1.75);
  let scale = Math.min(
    1,
    maxDim / imageWidth,
    maxDim / (imageHeight + band(imageWidth)),
  );
  let width = Math.max(1, Math.round(imageWidth * scale));
  let bandHeight = band(width);
  let imageH = Math.max(1, Math.round(imageHeight * scale));
  if (imageH + bandHeight > maxDim) {
    // The band was sized from the unscaled width; shrink once more to fit.
    scale = Math.min(scale, (maxDim - bandHeight) / imageHeight);
    width = Math.max(1, Math.round(imageWidth * scale));
    bandHeight = band(width);
    imageH = Math.max(
      1,
      Math.min(maxDim - bandHeight, Math.round(imageHeight * scale)),
    );
  }
  const lineHeight = line(width);
  return {
    scale,
    width,
    imageHeight: imageH,
    bandHeight,
    lines,
    fontSize: Math.round(lineHeight * 0.46),
    padding: Math.round(lineHeight * 0.45),
    height: imageH + bandHeight,
  };
}

/**
 * Whether the time fits to the right of the URL while leaving the URL room for
 * about eight characters; otherwise the band stacks them on two lines.
 */
export function timeFitsBeside(
  width: number,
  timeWidth: number,
  padding: number,
  fontSize: number,
): boolean {
  return width >= timeWidth + padding * 3 + fontSize * 8;
}

/**
 * Longest prefix of text (with an ellipsis) whose measured width fits maxWidth.
 * Returns an empty string when not even the ellipsis fits.
 */
export function fitText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string {
  if (measure(text) <= maxWidth) return text;
  const ellipsis = "…";
  if (measure(ellipsis) > maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + ellipsis) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

/** The address shown on the stamp, with any user:password credentials removed. */
export function stampUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    return u.href;
  } catch {
    return raw;
  }
}
