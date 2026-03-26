import "./style.css";
import type { CaptureMode, ImageFormat } from "../../utils/messages";

// --- DOM ---
const captureBtn = document.getElementById("capture") as HTMLButtonElement;
const progressContainer = document.getElementById("progress") as HTMLDivElement;
const progressFill = document.getElementById("progress-fill") as HTMLDivElement;
const progressText = document.getElementById("progress-text") as HTMLDivElement;
const progressPct = document.getElementById("progress-pct") as HTMLSpanElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const formatSelect = document.getElementById("format") as HTMLSelectElement;
const qualitySelect = document.getElementById("quality") as HTMLSelectElement;
const modeTabs = document.querySelectorAll<HTMLButtonElement>(
  ".mode-tab:not([disabled])",
);
const quickActions = document.getElementById("quick-actions") as HTMLDivElement;
const tipBanner = document.getElementById("tip") as HTMLDivElement;
const actionCopy = document.getElementById("action-copy") as HTMLButtonElement;
const actionOpen = document.getElementById("action-open") as HTMLButtonElement;
const actionAgain = document.getElementById(
  "action-again",
) as HTMLButtonElement;

let currentMode: CaptureMode = "full-page";
let lastCaptureFilename = "";

// --- Global error handler ---
window.addEventListener("error", (e) => {
  console.error("[SnapPage] Error:", e.error);
  setError("Unexpected error: " + (e.error?.message || e.message));
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[SnapPage] Unhandled rejection:", e.reason);
  setError("Unexpected error: " + (e.reason?.message || String(e.reason)));
});

// --- Settings ---
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get([
      "mode",
      "format",
      "quality",
      "tipDismissed",
    ]);
    if (
      data.mode === "full-page" ||
      data.mode === "visible-area" ||
      data.mode === "selection"
    ) {
      currentMode = data.mode;
      modeTabs.forEach((tab) => {
        const isActive = tab.dataset.mode === currentMode;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });
    }
    if (data.format) formatSelect.value = data.format as string;
    if (data.quality) qualitySelect.value = data.quality as string;
    if (data.tipDismissed) tipBanner.classList.add("hidden");
  } catch {
    /* first run */
  }
}

function saveSettings() {
  chrome.storage.local
    .set({
      mode: currentMode,
      format: formatSelect.value,
      quality: qualitySelect.value,
    })
    .catch(() => {});
}

// --- Mode Tabs ---
modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    modeTabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    currentMode = tab.dataset.mode as CaptureMode;
    saveSettings();
  });
});

formatSelect.addEventListener("change", saveSettings);
qualitySelect.addEventListener("change", saveSettings);

// === UI States ===
function setLoading() {
  captureBtn.disabled = true;
  captureBtn.classList.add("loading");
  captureBtn.setAttribute("aria-disabled", "true");
  progressContainer.classList.add("visible");
  progressFill.style.width = "0%";
  progressText.textContent = "Capturing...";
  progressPct.textContent = "";
  hideStatus();
  quickActions.style.display = "none";
  tipBanner.classList.add("hidden");
  chrome.storage.local.set({ tipDismissed: true }).catch(() => {});
}

function setSuccess(filename: string) {
  lastCaptureFilename = filename;
  captureBtn.disabled = false;
  captureBtn.classList.remove("loading");
  captureBtn.removeAttribute("aria-disabled");
  progressContainer.classList.remove("visible");

  statusEl.className = "status visible success";
  statusEl.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3.5 3.5 6.5-8"/></svg>
    <span class="status-text">Saved to Downloads!</span>
  `;
  quickActions.style.display = "none";
  setTimeout(hideStatus, 4000);

  // Review prompt after 5 captures
  trackCapture();
}

async function trackCapture() {
  try {
    const data = await chrome.storage.local.get([
      "captureCount",
      "reviewDismissed",
    ]);
    if (data.reviewDismissed) return;
    const count = (Number(data.captureCount) || 0) + 1;
    await chrome.storage.local.set({ captureCount: count });
    if (count === 5) {
      setTimeout(() => showReviewPrompt(), 2000);
    }
  } catch {
    /* ignore */
  }
}

function showReviewPrompt() {
  const banner = document.createElement("div");
  banner.className = "status visible success";
  banner.style.cssText =
    "margin-top:8px;flex-direction:column;align-items:flex-start;gap:6px;";
  banner.innerHTML = `
    <span style="font-weight:600">Enjoying SnapPage?</span>
    <span style="font-size:11px;color:var(--text-secondary)">A 5-star review helps us stay free and reach more users.</span>
    <div style="display:flex;gap:6px;margin-top:2px">
      <a href="https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews" target="_blank"
         style="padding:4px 12px;background:var(--primary);color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer">Leave a Review</a>
      <button id="dismiss-review" style="padding:4px 12px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text-secondary);cursor:pointer">Maybe Later</button>
    </div>
  `;
  document.querySelector(".main")?.appendChild(banner);
  document.getElementById("dismiss-review")?.addEventListener("click", () => {
    banner.remove();
    chrome.storage.local.set({ reviewDismissed: true }).catch(() => {});
  });
}

function setError(error: string) {
  captureBtn.disabled = false;
  captureBtn.classList.remove("loading");
  captureBtn.removeAttribute("aria-disabled");
  progressContainer.classList.remove("visible");

  const isRestricted =
    error.includes("internal page") ||
    error.includes("Cannot access") ||
    error.includes("Cannot capture");
  statusEl.className = "status visible error";
  statusEl.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11v.5"/></svg>
    <span class="status-text">${esc(error)}</span>
  `;

  if (isRestricted) {
    statusEl.innerHTML += `<div class="restricted-help" style="margin-top:6px">Chrome blocks screenshots on internal pages (chrome://, extensions, Web Store). Open any regular website and try again.</div>`;
  }

  quickActions.style.display = "none";
}

function hideStatus() {
  statusEl.className = "status";
  statusEl.innerHTML = "";
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// === CAPTURE — sends message to background service worker ===

async function startCapture() {
  if (captureBtn.disabled) return;
  setLoading();

  try {
    const format = formatSelect.value as ImageFormat;
    const quality = parseInt(qualitySelect.value, 10);

    // Selection mode: close popup immediately so user can see the page
    if (currentMode === "selection") {
      chrome.runtime.sendMessage({
        type: "START_CAPTURE",
        mode: currentMode,
        format,
        quality,
      });
      window.close();
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "START_CAPTURE",
      mode: currentMode,
      format,
      quality,
    });

    if (!response) {
      setError("No response from background. Try reloading the extension.");
      return;
    }

    if (response.type === "CAPTURE_COMPLETE") {
      setSuccess(response.filename);
    } else if (response.type === "CAPTURE_ERROR") {
      setError(response.error);
    } else {
      setError("Unexpected response: " + JSON.stringify(response));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Cannot access") ||
      msg.includes("Cannot capture") ||
      msg.includes("extension page") ||
      msg.includes("is not allowed")
    ) {
      setError(
        "Cannot capture this page. Chrome blocks screenshots on internal pages. Open a regular website and try again.",
      );
    } else {
      setError(msg);
    }
  }
}

// === Quick Actions ===
actionAgain.addEventListener("click", () => {
  hideStatus();
  quickActions.style.display = "none";
  startCapture();
});

actionCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lastCaptureFilename);
    actionCopy.textContent = "Copied!";
    setTimeout(() => {
      actionCopy.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 11V3a1 1 0 011-1h8"/></svg> Copy`;
    }, 1500);
  } catch {
    /* no clipboard */
  }
});

actionOpen.addEventListener("click", () =>
  chrome.downloads.showDefaultFolder(),
);

// === Init ===
captureBtn.addEventListener("click", startCapture);
loadSettings();
