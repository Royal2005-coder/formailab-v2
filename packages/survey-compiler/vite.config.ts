/// <reference types="vitest" />
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        server: resolve(__dirname, "src/server.ts"),
        expression: resolve(__dirname, "src/expression/index.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["csv-parse/sync", "node:crypto", "xlsx", "zod"],
    },
    emptyOutDir: false,
  },
  test: {
    environment: "node",
    globals: true,
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
    },
  },
});
