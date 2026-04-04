import { defineConfig } from "wxt";

export default defineConfig({
  vite: () => ({
    build: {
      rollupOptions: {
        external: ["html2canvas"],
      },
    },
    resolve: {
      alias: {
        // Stub out html2canvas — jsPDF imports it for .html() method we don't use
        html2canvas: "data:text/javascript,export default null",
      },
    },
  }),
  modules: ["@wxt-dev/auto-icons"],
  autoIcons: {
    baseIconPath: "assets/icons/icon.svg",
    sizes: [16, 32, 48, 128],
    developmentIndicator: false,
  },
  manifest: {
    permissions: [
      "activeTab",
      "scripting",
      "downloads",
      "tabs",
      "storage",
    ],
    action: {
      default_title: "SnapPage — Screenshot",
    },
    name: "SnapPage - Full Page Screenshot, Capture & Save",
    description:
      "Capture full-page screenshots in one click. Full page, visible area & selection modes. Smart naming, 100% private.",
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Alt+Shift+S",
        },
        description: "Capture full page screenshot",
      },
    },
  },
});
