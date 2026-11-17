import { FILENAME_MAX_LENGTH, FILENAME_SANITIZE_REGEX } from "./constants";
import { formatCaptureDate } from "./stamp";

export function sanitizeFilename(raw: string): string {
  return (
    raw
      .replace(FILENAME_SANITIZE_REGEX, "")
      .replace(/\s+/g, "_")
      .slice(0, FILENAME_MAX_LENGTH)
      .trim() || "screenshot"
  );
}

export function buildFilename(
  domain: string,
  title: string,
  format: "png" | "jpeg",
  capturedAt: Date = new Date(),
): string {
  // Same local date as the optional stamp for the same capture.
  const date = formatCaptureDate(capturedAt);
  const cleanDomain = sanitizeFilename(domain);
  const cleanTitle = sanitizeFilename(title).slice(0, 80);
  const ext = format === "jpeg" ? "jpg" : "png";
  return `${cleanDomain}_${cleanTitle}_${date}.${ext}`;
}
