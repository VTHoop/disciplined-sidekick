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
        name: "Trivet",
        short_name: "Trivet",
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
    include: ["src/**/*.test.ts"],
  },
});
