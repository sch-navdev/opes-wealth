import { defineConfig } from "vitest/config";
import path from "node:path";

// Two projects so component tests never slow or change the pure-logic tests:
//  - unit: pure logic under src/lib (node env; no DOM, network or database)
//  - components: React components (jsdom env + Testing Library + jest-dom matchers)
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
