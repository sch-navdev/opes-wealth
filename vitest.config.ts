import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests cover pure logic under src/lib (no DOM, no network, no database).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
