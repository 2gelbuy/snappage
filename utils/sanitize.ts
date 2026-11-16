import { FILENAME_MAX_LENGTH, FILENAME_SANITIZE_REGEX } from "./constants";

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
): string {
  // Local date, so the file name matches the date on the optional stamp.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const cleanDomain = sanitizeFilename(domain);
  const cleanTitle = sanitizeFilename(title).slice(0, 80);
  const ext = format === "jpeg" ? "jpg" : "png";
  return `${cleanDomain}_${cleanTitle}_${date}.${ext}`;
}
