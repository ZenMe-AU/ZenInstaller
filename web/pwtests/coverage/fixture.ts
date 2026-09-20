import { test as base, type Page, type TestInfo } from "@playwright/test";
export * from "@playwright/test";

// Start before navigation, and persist the executed source alongside V8 ranges.
export async function startCoverage(page: Page, testInfo: TestInfo) {
  if (!testInfo.config.metadata.coverage) return async () => {};
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  return async () => {
    if (page.isClosed()) throw new Error("Close covered pages only after stopping coverage.");
    const entries = await page.coverage.stopJSCoverage();
    const origin = new URL(testInfo.project.use.baseURL ?? "http://localhost:5173").origin;
    await testInfo.attach("v8-coverage", {
      body: JSON.stringify(entries.filter(({ url }) => {
        try { return new URL(url).origin === origin; } catch { return false; }
      })),
      contentType: "application/json",
    });
  };
}

export const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    if (testInfo.config.metadata.coverage && browserName !== "chromium") {
      throw new Error("Playwright V8 coverage requires Chromium.");
    }
    const stop = await startCoverage(page, testInfo);
    try { await use(page); } finally { await stop(); }
  },
});
