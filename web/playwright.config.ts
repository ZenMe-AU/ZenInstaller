/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";

const signedOutTests = [
  /access-pass-render\.spec\.ts/,
  /azure-help-link\.spec\.ts/,
  /zeninstaller-link\.spec\.ts/,
];

const authenticatedTests = [
  /authenticated-page-load\.spec\.ts/,
  /azure-connection\.spec\.ts/,
  /entra-user-action\.spec\.ts/,
  /tenant-outcome\.spec\.ts/,
  /access-pass-creation\.spec\.ts/,
];

export default defineConfig({
  testDir: "./playwright-tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 60_000,
  expect: {
    timeout: 10_000,

      toHaveScreenshot: {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0.02,

        pathTemplate: "{testDir}/snapshots/{arg}{ext}"
    },
  },

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    /**
     * Manual setup project.
     *
     * This is the only project that runs azure-passkey.setup.ts.
     * It opens the browser, lets you complete Microsoft passkey login manually,
     * then saves the authenticated browser state.
     */
    {
      name: "azure-passkey-setup",
      testMatch: /azure-passkey\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    /**
     * Normal signed-out Access Pass tests in Chromium.
     *
     * This ignores authenticated tests and setup tests.
     */
    {
      name: "chromium",
      testMatch: signedOutTests,
      fullyParallel: true,
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    /**
     * Normal signed-out Access Pass tests in Chromium.
     *
     * This ignores authenticated tests and setup tests.
     */
    {
      name: "chromium-authenticated",
      testMatch: authenticatedTests,
      // no parallel tests to avoid MSAL timeout when two test using same account
      fullyParallel: false,
      workers: 1,
      retries: 1,
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["azure-passkey-setup"],
    },


    /**
     * Normal signed-out Access Pass tests in Firefox.
     */
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
       dependencies: ["azure-passkey-setup"],
    },

    /**
     * Normal signed-out Access Pass tests in WebKit.
     */
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
      },
       dependencies: ["azure-passkey-setup"],
    },
  ],

  /**
   * Optional:
   * Uncomment this if you want Playwright to start Vite automatically.
   *
   * If you prefer to run `pnpm dev` yourself, leave this commented out.
   */
  // webServer: {
  //   command: "pnpm dev -- --host 127.0.0.1 --port 5173",
  //   url: "http://127.0.0.1:5173",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});

