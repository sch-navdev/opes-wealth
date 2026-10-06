// Setup for the "components" Vitest project (jsdom): adds the jest-dom matchers
// (`toBeChecked`, `toHaveAttribute`, ...) and unmounts rendered trees after each test.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
