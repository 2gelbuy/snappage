import { chromium } from "playwright";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(__dirname, ".output/chrome-mv3");

async function test() {
  console.log("Launching Chrome with extension...");

  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
  });

  let extensionId;
  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 5000 }));
  extensionId = sw.url().split("/")[2];
  console.log("Extension ID:", extensionId);

  let pass = 0,
    fail = 0;
  function check(name, ok, detail) {
    if (ok) {
      pass++;
      console.log(`  PASS: ${name}`);
    } else {
      fail++;
      console.error(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
    }
  }

  // === POPUP UI ===
  console.log("\n--- Popup UI ---");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForLoadState("domcontentloaded");

  check(
    "Title: SnapPage",
    (await popup.textContent(".header-title")) === "SnapPage",
  );
  check("FREE badge", (await popup.textContent(".header-badge")) === "FREE");
  check("3 capture modes", (await popup.locator(".mode-tab").count()) === 3);
  check("Capture btn enabled", !(await popup.locator("#capture").isDisabled()));
  check(
    "3 format options",
    (await popup.locator("#format option").count()) === 3,
  );
  check(
    "Quality options",
    (await popup.locator("#quality option").count()) >= 3,
  );
  await popup.locator('.mode-tab[data-mode="visible-area"]').click();
  check(
    "Mode switch works",
    (await popup.locator(".mode-tab.active").getAttribute("data-mode")) ===
      "visible-area",
  );
  check(
    "Shortcut shown",
    (await popup.textContent(".shortcut-badge"))?.includes("Alt+Shift+S"),
  );
  check(
    "Version shown",
    (await popup.textContent(".version-tag"))?.includes("v0.2.0"),
  );
  await popup.close();

  // === CAPTURE via background service worker ===
  console.log("\n--- Capture (via service worker) ---");

  // Navigate to example.com and get its tab ID
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://example.com", { waitUntil: "load" });
  await page.waitForTimeout(500);

  // Use the service worker to capture directly — bypasses the popup tab issue
  // The SW has full chrome API access
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await bgPage.waitForLoadState("domcontentloaded");

  // First, get the example.com tab ID from background
  const tabId = await bgPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "*://example.com/*" });
    return tabs[0]?.id;
  });
  check("Found example.com tab", !!tabId, `tabId=${tabId}`);

  if (tabId) {
    // Focus the example.com tab before capture
    await bgPage.evaluate(async (tid) => {
      await chrome.tabs.update(tid, { active: true });
    }, tabId);
    await bgPage.waitForTimeout(500);

    // Now trigger capture — background will query active tab and find example.com
    const captureResult = await bgPage.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Capture timeout")),
          15000,
        );
        chrome.runtime.sendMessage(
          {
            type: "START_CAPTURE",
            mode: "visible-area",
            format: "png",
            quality: 100,
            outputFormat: "png",
          },
          (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError)
              reject(new Error(chrome.runtime.lastError.message));
            else resolve(response);
          },
        );
      });
    });

    check("Capture response received", !!captureResult);
    check(
      "CAPTURE_COMPLETE",
      captureResult?.type === "CAPTURE_COMPLETE",
      `${captureResult?.type}: ${captureResult?.error || ""}`,
    );
    check(
      "Filename has domain",
      captureResult?.filename?.includes("example"),
      `"${captureResult?.filename}"`,
    );

    // Check editor opened
    await bgPage.waitForTimeout(2000);
    const editorPage = context
      .pages()
      .find((p) => p.url().includes("editor.html"));
    check("Editor tab opened", !!editorPage);

    if (editorPage) {
      console.log("\n--- Editor UI ---");
      await editorPage.waitForLoadState("domcontentloaded");
      await editorPage.waitForTimeout(2000);

      const sz = await editorPage.evaluate(() => {
        const c = document.getElementById("editor-canvas");
        return { w: c?.width || 0, h: c?.height || 0 };
      });
      check("Screenshot loaded", sz.w > 0 && sz.h > 0, `${sz.w}x${sz.h}`);
      check("Tools >= 6", (await editorPage.locator(".tool-btn").count()) >= 6);
      check("Save btn", (await editorPage.locator("#btn-save").count()) > 0);
      check("OCR btn", (await editorPage.locator("#btn-ocr").count()) > 0);
      check(
        "Redact btn",
        (await editorPage.locator("#btn-redact").count()) > 0,
      );
      check(
        "Dims shown",
        (await editorPage.textContent("#status-dims"))?.includes("×"),
      );
      check("Editor title", (await editorPage.title()).includes("SnapPage"));

      await editorPage.screenshot({ path: "test-editor.png" });
      console.log("  Saved: test-editor.png");

      // Test full-page capture
      console.log("\n--- Full page capture ---");
      await page.bringToFront();
      await page.waitForTimeout(500);

      // Re-focus example.com
      await bgPage.evaluate(async (tid) => {
        await chrome.tabs.update(tid, { active: true });
      }, tabId);
      await bgPage.waitForTimeout(500);

      const fullResult = await bgPage.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Full capture timeout")),
            20000,
          );
          chrome.runtime.sendMessage(
            {
              type: "START_CAPTURE",
              mode: "full-page",
              format: "png",
              quality: 100,
              outputFormat: "png",
            },
            (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError)
                reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            },
          );
        });
      });
      check(
        "Full-page complete",
        fullResult?.type === "CAPTURE_COMPLETE",
        `${fullResult?.type}: ${fullResult?.error || ""}`,
      );
    }
  }

  await bgPage.close();

  // === SUMMARY ===
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  await context.close();
  process.exit(fail > 0 ? 1 : 0);
}

test().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
