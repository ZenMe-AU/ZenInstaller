import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "web",
          include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          globals: true,
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "functions",
          include: ["backend/src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
          environment: "node",
          globals: true,
          passWithNoTests: true,
        },
      },
    ],
    passWithNoTests: true,
  },
});
