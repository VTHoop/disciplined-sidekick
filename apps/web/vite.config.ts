import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      manifest: {
        name: "Disciplined Sidekick",
        short_name: "Sidekick",
        start_url: "/",
        display: "standalone",
        theme_color: "#2f7d4f",
        background_color: "#ffffff",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // API calls must reach the server, never the SPA shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    name: "web",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
