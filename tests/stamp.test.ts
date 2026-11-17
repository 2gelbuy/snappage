import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitText,
  formatCaptureDate,
  formatCaptureTime,
  stampLayout,
  stampUrl,
  timeFitsBeside,
} from "../utils/stamp.ts";

test("capture time is local time with its UTC offset", () => {
  const d = new Date(2026, 10, 17, 9, 5);
  const text = formatCaptureTime(d);
  assert.match(text, /^2026-11-17 09:05 UTC[+-]\d{2}:\d{2}$/);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offset) % 60).padStart(2, "0");
  assert.ok(text.endsWith(`UTC${sign}${hh}:${mm}`));
});

test("band scales with width and stays within bounds", () => {
  const small = stampLayout(300, 200, 16384);
  assert.equal(small.scale, 1);
  assert.equal(small.bandHeight, 28);
  assert.equal(small.height, 228);

  const retina = stampLayout(2880, 1800, 16384);
  assert.equal(retina.bandHeight, 63);
  assert.equal(retina.width, 2880);
  assert.equal(retina.height, 1800 + 63);

  const huge = stampLayout(8000, 2000, 16384);
  assert.equal(huge.bandHeight, 72);
});

test("output never exceeds the canvas limit, even for a page already at it", () => {
  for (const [w, h] of [
    [2560, 16384],
    [1280, 16380],
    [16384, 900],
    [600, 30000],
  ]) {
    const l = stampLayout(w, h, 16384);
    assert.ok(l.height <= 16384, `height ${l.height} for ${w}x${h}`);
    assert.ok(l.width <= 16384, `width ${l.width} for ${w}x${h}`);
    assert.equal(l.height, l.imageHeight + l.bandHeight);
    assert.ok(l.scale <= 1 && l.scale > 0);
  }
});

test("long URLs are cut with an ellipsis to fit", () => {
  const measure = (s: string) => s.length * 10;
  assert.equal(fitText("https://a.com/", 500, measure), "https://a.com/");
  const cut = fitText("https://example.com/a/very/long/path", 120, measure);
  assert.equal(cut, "https://exa…");
  assert.ok(measure(cut) <= 120);
  assert.equal(fitText("https://example.com", 5, measure), "");
});

test("stamped URL drops credentials but keeps path, query and hash", () => {
  const withLogin = new URL("https://example.com/p?q=1#top");
  withLogin.username = "user";
  withLogin.password = "pw";
  assert.ok(withLogin.href.includes("@"));
  assert.equal(stampUrl(withLogin.href), "https://example.com/p?q=1#top");
  assert.equal(stampUrl("not a url"), "not a url");
});

test("narrow captures stack the time under the URL instead of dropping it", () => {
  // A 100px selection on a 2x screen: 200px wide, time about 165px.
  const one = stampLayout(200, 150, 16384);
  assert.equal(one.lines, 1);
  assert.equal(
    timeFitsBeside(one.width, 165, one.padding, one.fontSize),
    false,
  );
  const two = stampLayout(200, 150, 16384, 2);
  assert.equal(two.lines, 2);
  assert.equal(two.fontSize, one.fontSize);
  assert.ok(two.bandHeight > one.bandHeight);
  assert.equal(two.height, 150 + two.bandHeight);
  // Retina full page keeps a single line.
  const wide = stampLayout(2880, 1800, 16384);
  assert.equal(
    timeFitsBeside(wide.width, 800, wide.padding, wide.fontSize),
    true,
  );
  // Two lines still respect the canvas limit.
  const tall = stampLayout(1280, 16380, 16384, 2);
  assert.ok(tall.height <= 16384);
});

test("capture date matches the date on the stamp, also at midnight", () => {
  const at = new Date(2026, 11, 31, 23, 59);
  assert.equal(formatCaptureDate(at), "2026-12-31");
  assert.ok(formatCaptureTime(at).startsWith(`${formatCaptureDate(at)} 23:59`));
});
