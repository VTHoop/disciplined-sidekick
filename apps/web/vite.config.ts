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
        // surface.ground (light) from src/styles/tokens.css; the manifest cannot read CSS.
        theme_color: "#f3f4f0",
        background_color: "#f3f4f0",
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
        // Precache the self-hosted fonts so a cold start offline uses them.
        globPatterns: ["**/*.{js,css,html,woff2}"],
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
