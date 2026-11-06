import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// The short commit SHA, shown in client_errors rows. Absent locally and in tests.
const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

export default defineConfig({
  define: appVersion
    ? { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion) }
    : {},
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      // A new deploy waits until the user taps Reload; it is never applied mid-session.
      registerType: "prompt",
      manifest: {
        name: "Disciplined Sidekick",
        short_name: "Sidekick",
        start_url: "/",
        display: "standalone",
        // --color-surface-ground (light) from src/styles/tokens.css; the manifest cannot read CSS.
        theme_color: "#f3f4f0",
        background_color: "#f3f4f0",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // API calls must reach the server, never the SPA shell.
        navigateFallbackDenylist: [/^\/api\//],
        // Precache the self-hosted fonts so a cold start offline uses them.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
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
