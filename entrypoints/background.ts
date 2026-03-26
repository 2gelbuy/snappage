import type { CaptureMode, ImageFormat } from "../utils/messages";
import { buildFilename } from "../utils/sanitize";
import { MAX_PAGE_HEIGHT, MAX_CAPTURE_TILES } from "../utils/constants";

// GoFullPage-style overlap: prevents gaps from subpixel/rounding errors
const SCROLL_PAD = 200;
const CAPTURE_WAIT = 350;

export default defineBackground(() => {
  // Set uninstall URL for feedback collection
  chrome.runtime.setUninstallURL("https://konabayev.com/snappage/uninstall/");

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "START_CAPTURE") {
      handleCapture(message)
        .then((res) => {
          try {
            sendResponse(res);
          } catch {
            /* popup may have closed */
          }
        })
        .catch((err) => {
          try {
            sendResponse({
              type: "CAPTURE_ERROR",
              error: err instanceof Error ? err.message : String(err),
            });
          } catch {
            /* popup may have closed */
          }
        });
      return true;
    }
  });

  async function handleCapture(msg: {
    mode: CaptureMode;
    format: ImageFormat;
    quality: number;
    outputFormat?: string;
  }): Promise<{ type: string; [key: string]: unknown }> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) throw new Error("No active tab found");

    const url = tab.url || "";
    if (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:")
    ) {
      throw new Error(
        "Cannot capture this page. Chrome blocks screenshots on internal pages.",
      );
    }

    if (msg.mode === "visible-area") {
      return captureAndSave(tab, msg.format, msg.quality);
    }
    if (msg.mode === "selection") {
      return captureSelection(tab, msg.format, msg.quality);
    }
    return captureFullPage(tab, msg.format, msg.quality);
  }

  // === Capture visible area and download directly ===
  async function captureAndSave(
    tab: chrome.tabs.Tab,
    format: ImageFormat,
    quality: number,
  ): Promise<{ type: string; filename: string }> {
    const dataUrl = await safeCaptureVisibleTab(format, quality);
    const host = await getTabHostname(tab.id!);
    const filename = buildFilename(host, tab.title || "screenshot", format);
    await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
    return { type: "CAPTURE_COMPLETE", filename };
  }

  // === Selection capture ===
  async function captureSelection(
    tab: chrome.tabs.Tab,
    format: ImageFormat,
    quality: number,
  ): Promise<{ type: string; filename: string }> {
    const tabId = tab.id!;

    const rect = await new Promise<{
      x: number;
      y: number;
      w: number;
      h: number;
      dpr: number;
    }>((resolve, reject) => {
      const listener = (message: any, sender: chrome.runtime.MessageSender) => {
        if (sender.tab?.id !== tabId) return;
        if (message.type === "SELECTION_DONE") {
          chrome.runtime.onMessage.removeListener(listener);
          resolve(message.rect);
        }
        if (message.type === "SELECTION_CANCEL") {
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error("Selection cancelled"));
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      chrome.scripting
        .executeScript({
          target: { tabId },
          func: injectSelectionOverlay,
        })
        .catch(reject);
    });

    const dataUrl = await safeCaptureVisibleTab(format, quality);

    // Crop to selection
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const dpr = rect.dpr;
    const sx = Math.round(rect.x * dpr);
    const sy = Math.round(rect.y * dpr);
    const sw = Math.round(rect.w * dpr);
    const sh = Math.round(rect.h * dpr);

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    bitmap.close();

    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const croppedBlob = await canvas.convertToBlob({
      type: mime,
      quality: format === "jpeg" ? quality / 100 : undefined,
    });
    const croppedDataUrl = await blobToDataUrl(croppedBlob);

    const host = await getTabHostname(tabId);
    const filename = buildFilename(host, tab.title || "screenshot", format);
    await chrome.downloads.download({
      url: croppedDataUrl,
      filename,
      saveAs: true,
    });
    return { type: "CAPTURE_COMPLETE", filename };
  }

  // === Selection overlay (injected into page) ===
  function injectSelectionOverlay() {
    document.getElementById("__ss-select-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "__ss-select-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "rgba(0,0,0,0.3)",
      cursor: "crosshair",
    });

    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "absolute",
      border: "2px solid #3b82f6",
      background: "rgba(59,130,246,0.1)",
      display: "none",
    });
    overlay.appendChild(box);

    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1e293b",
      color: "#fff",
      padding: "8px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      fontFamily: "system-ui, sans-serif",
      zIndex: "1",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    });
    hint.textContent = "Draw a rectangle to select area. Press Esc to cancel.";
    overlay.appendChild(hint);

    let startX = 0,
      startY = 0,
      drawing = false;

    overlay.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      drawing = true;
      box.style.display = "block";
      box.style.left = startX + "px";
      box.style.top = startY + "px";
      box.style.width = "0";
      box.style.height = "0";
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!drawing) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = w + "px";
      box.style.height = h + "px";
    });

    overlay.addEventListener("mouseup", (e) => {
      if (!drawing) return;
      drawing = false;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      overlay.remove();

      if (w < 10 || h < 10) {
        chrome.runtime.sendMessage({ type: "SELECTION_CANCEL" });
        return;
      }
      chrome.runtime.sendMessage({
        type: "SELECTION_DONE",
        rect: { x, y, w, h, dpr: window.devicePixelRatio || 1 },
      });
    });

    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", esc);
        chrome.runtime.sendMessage({ type: "SELECTION_CANCEL" });
      }
    });

    document.body.appendChild(overlay);
  }

  // === Full page capture ===
  async function captureFullPage(
    tab: chrome.tabs.Tab,
    format: ImageFormat,
    quality: number,
  ): Promise<{ type: string; filename: string }> {
    const tabId = tab.id!;

    const [infoResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const originalScrollY = window.scrollY;
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        return {
          totalWidth: Math.max(
            document.documentElement.scrollWidth,
            document.body?.scrollWidth || 0,
          ),
          totalHeight: Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight || 0,
          ),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
          originalScrollY,
        };
      },
    });

    const info = infoResult.result as {
      totalWidth: number;
      totalHeight: number;
      viewportWidth: number;
      viewportHeight: number;
      devicePixelRatio: number;
      originalScrollY: number;
    };

    if (!info || info.viewportHeight <= 0)
      throw new Error("Could not read page dimensions");
    if (info.totalHeight > MAX_PAGE_HEIGHT)
      throw new Error(
        `Page too tall (${info.totalHeight}px, max ${MAX_PAGE_HEIGHT}px)`,
      );

    // Single viewport — just capture and save
    if (info.totalHeight <= info.viewportHeight) {
      return captureAndSave(tab, format, quality);
    }

    // Build scroll positions with overlap
    const yStep =
      info.viewportHeight - (info.viewportHeight > SCROLL_PAD ? SCROLL_PAD : 0);
    const scrollPositions: number[] = [];
    let yPos = info.totalHeight - info.viewportHeight;
    while (yPos > -yStep) {
      scrollPositions.push(Math.max(0, yPos));
      yPos -= yStep;
    }
    scrollPositions.reverse();

    if (scrollPositions.length > MAX_CAPTURE_TILES) {
      throw new Error(`Too many tiles needed (${scrollPositions.length})`);
    }

    // Prepare page (hide fixed elements, force instant scroll)
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectPrepare,
    });

    const captures: Array<{
      dataUrl: string;
      scrollX: number;
      scrollY: number;
    }> = [];

    try {
      for (const targetY of scrollPositions) {
        const [scrollResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: (y: number) => {
            window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
            return { scrollX: window.scrollX, scrollY: window.scrollY };
          },
          args: [targetY],
        });

        const pos = scrollResult.result as { scrollX: number; scrollY: number };
        await sleep(CAPTURE_WAIT);

        const dataUrl = await safeCaptureVisibleTab(format, quality);
        captures.push({ dataUrl, scrollX: pos.scrollX, scrollY: pos.scrollY });
      }

      // Stitch tiles
      const stitched = await stitchTiles(captures, info, format, quality);

      const host = await getTabHostname(tabId);
      const filename = buildFilename(host, tab.title || "screenshot", format);
      await chrome.downloads.download({
        url: stitched,
        filename,
        saveAs: true,
      });
      return { type: "CAPTURE_COMPLETE", filename };
    } finally {
      // Restore page
      await chrome.scripting
        .executeScript({
          target: { tabId },
          func: (origY: number) => {
            const w = window as any;
            (w.__ssHidden || []).forEach(
              ({ el, css }: { el: HTMLElement; css: string }) => {
                el.style.cssText = css;
              },
            );
            const sb = w.__ssScrollBehavior;
            if (sb) {
              document.documentElement.style.scrollBehavior = sb.html;
              document.body && (document.body.style.scrollBehavior = sb.body);
            }
            window.scrollTo({
              top: origY,
              behavior: "instant" as ScrollBehavior,
            });
            delete w.__ssHidden;
            delete w.__ssScrollBehavior;
            delete w.__ssScrollY;
          },
          args: [info.originalScrollY],
        })
        .catch(() => {});
    }
  }

  // --- captureVisibleTab with retry ---
  async function safeCaptureVisibleTab(
    format: "png" | "jpeg",
    quality: number,
    retries = 3,
  ): Promise<string> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab({
          format,
          quality: format === "jpeg" ? quality : undefined,
        });
        if (!dataUrl) throw new Error("captureVisibleTab returned empty");
        return dataUrl;
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(200);
      }
    }
    throw new Error("captureVisibleTab failed after retries");
  }

  // --- Stitch tiles ---
  async function stitchTiles(
    captures: Array<{ dataUrl: string; scrollX: number; scrollY: number }>,
    info: {
      viewportWidth: number;
      viewportHeight: number;
      totalWidth: number;
      totalHeight: number;
      devicePixelRatio: number;
    },
    format: ImageFormat,
    quality: number,
  ): Promise<string> {
    const firstBlob = await (await fetch(captures[0].dataUrl)).blob();
    const firstBitmap = await createImageBitmap(firstBlob);
    const scale = firstBitmap.width / info.viewportWidth;
    firstBitmap.close();

    const canvasW = Math.round(info.totalWidth * scale);
    const canvasH = Math.round(info.totalHeight * scale);
    const canvas = new OffscreenCanvas(canvasW, canvasH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context failed");

    for (const capture of captures) {
      const blob = await (await fetch(capture.dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      ctx.drawImage(
        bitmap,
        Math.round(capture.scrollX * scale),
        Math.round(capture.scrollY * scale),
      );
      bitmap.close();
    }

    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const blob = await canvas.convertToBlob({
      type: mime,
      quality: format === "jpeg" ? quality / 100 : undefined,
    });
    return blobToDataUrl(blob);
  }

  // === Hide fixed/sticky elements ===
  function injectPrepare() {
    const w = window as any;
    w.__ssScrollY = window.scrollY;
    w.__ssScrollBehavior = {
      html: document.documentElement.style.scrollBehavior,
      body: document.body?.style.scrollBehavior || "",
    };
    document.documentElement.style.setProperty(
      "scroll-behavior",
      "auto",
      "important",
    );
    document.body?.style.setProperty("scroll-behavior", "auto", "important");
    document.documentElement.style.setProperty(
      "overflow-y",
      "scroll",
      "important",
    );
    document.documentElement.style.setProperty(
      "scrollbar-width",
      "none",
      "important",
    );

    const sel =
      'header,nav,footer,[style*="position: fixed"],[style*="position:fixed"],[style*="position: sticky"],[style*="position:sticky"],.fixed,.sticky,.navbar,.toolbar,.cookie-banner,.cookie-consent,[class*="fixed"],[class*="sticky"],[class*="header"],[class*="navbar"],[class*="banner"],[class*="toast"]';
    const hidden: Array<{ el: HTMLElement; css: string }> = [];

    try {
      document.querySelectorAll(sel).forEach((el) => {
        const s = getComputedStyle(el);
        if (s.position === "fixed" || s.position === "sticky") {
          const h = el as HTMLElement;
          hidden.push({ el: h, css: h.style.cssText });
          h.style.setProperty("display", "none", "important");
        }
      });
    } catch {
      /* ignore */
    }

    w.__ssHidden = hidden;
  }

  async function getTabHostname(tabId: number): Promise<string> {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.location.hostname,
      });
      return result?.result || "screenshot";
    } catch {
      return "screenshot";
    }
  }

  async function blobToDataUrl(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    return `data:${blob.type};base64,${btoa(parts.join(""))}`;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
});
