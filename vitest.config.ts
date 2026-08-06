import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["extension/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": "/extension/src",
    },
  },
});
