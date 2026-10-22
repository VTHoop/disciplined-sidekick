import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/web",
      "packages/core",
      {
        test: {
          name: "repo",
          include: [
            "server/**/*.test.ts",
            "scripts/**/*.test.ts",
            "tests/**/*.test.ts",
          ],
        },
      },
    ],
  },
});
