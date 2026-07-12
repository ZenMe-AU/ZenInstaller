import { test, expect, type Browser, type Page, type TestInfo, Locator } from "@playwright/test";
import {
  restoreSessionStorage,
  storageStateFile,
} from "./authState";
import fs from "fs";

const ACCESS_PASS_URL = "http://localhost:5173/accessPass.html";

// different sizes for different screens
const viewports = {
  Desktop: { width: 1920, height: 1080 },
  Laptop: { width: 1366, height: 768 },
  Mobile: { width: 414, height: 896 },
  Tablet: { width: 768, height: 1024 },
} as const;

function sensitiveTextMasks(page: Page): Locator[] {
  return [
    page.getByTestId("azure-account-username"),
    page.getByText(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i),
  ];
}

async function expectPageSnapshot(
  page: Page,
  testInfo: TestInfo,
  snapshotName: string,
  options?: {mask?: Locator[];}
) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  await page
    .locator("body")
    .evaluate(async () => {await document.fonts?.ready;})
    .catch(() => undefined);

  await page.waitForTimeout(300).catch(() => undefined);

  const expectedSnapshotPath = testInfo.snapshotPath(snapshotName);

  if (!fs.existsSync(expectedSnapshotPath)) {
    console.log("");
    console.log(" Snapshot baseline missing");
    console.log(`   Test: ${testInfo.title}`);
    console.log(`   Snapshot: ${snapshotName}`);
    console.log(`   Expected path: ${expectedSnapshotPath}`);
    console.log(
      "   Playwright will write the actual screenshot now. Run with --update-snapshots to approve it as the baseline.",
    );
    console.log("");
  }

  await expect(page).toHaveScreenshot(snapshotName, {
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    mask: options?.mask ?? [],
    maskColor: "rgb(0, 0, 0)",
  });
}


  for (const [viewportName, viewport] of Object.entries(viewports)) {
    test.describe(`Access Pass - ${viewportName}`, () => {
      test.use({
        viewport,
        deviceScaleFactor: 1,
      });

      test.beforeEach(async ({ page }, testInfo) => {
        await page.goto(ACCESS_PASS_URL);

        await expectPageSnapshot(page, testInfo,"initial-before-test.png",);
      });

      /*
        Signed-out state
        - Azure Login card is visible
        - Connect Azure button is enabled
        - Azure Access Pass card is visible
        - Access Pass card explains that Azure Login must be completed first
      */
      test("Successfully Loads the Access Pass Page", async ({ page }, testInfo) => {

        await expect(page).toHaveTitle(/ZenInstaller Access Pass/);
        await expect(page.getByText("Access Pass").first()).toBeVisible();

        await expect(page).toHaveTitle(/ZenInstaller Access Pass/);
        await expect(page.getByText("Access Pass").first()).toBeVisible();

        await expect(
          page.getByText(`The ZenInstaller is used to deploy Zenblox to your environment. 
            It requires a Github repository in your own account, an Azure, and AWS subscription in your name. 
            ZenInstaller will guide you through each step of the process starting from nothing.`),
        ).toBeVisible();

        // first card
        await expect(
          page.getByText(/Azure Login/i).first(),
        ).toBeVisible();

        await expect(
        page.getByRole("button", { name: /Connect Azure/i }),
      ).toBeVisible();

        // second card
        await expect(
          page.getByText(/Azure Access Pass/i).first(),
        ).toBeVisible();

        await expect(
        page.getByText(/Complete the Azure Login card first. Access pass creation will unlock after Azure sign-in and tenant confirmation./i),
        ).toBeVisible();

        await expectPageSnapshot(page, testInfo,"end-of-test.png",);
    });

    /*
      Navigation state
      - ZenInstaller link navigates home
      - Header still renders correctly on each viewport
    */
    test('ZenInstaller Link Redirects to Home Page', async ({ page, context }, testInfo) => {

      const navLink = page.getByRole('link', { name: 'ZenInstaller' });
      await expect(navLink).toBeVisible();

      const [newPage] = await Promise.all([
      page.waitForURL("http://localhost:5173/"),
      navLink.click(),
      ]);

      await expect(page).toHaveURL(/http:\/\/localhost:5173\/$/);
      await expectPageSnapshot(page, testInfo,"end-of-test.png",);
    });


    /*
    Help documentation state
    - Help link opens a new page
    */
    test("Azure Account Help Link Opens in a New Tab", async ({ page, context }, testInfo) => {

      const docsLink = page.getByRole("link", {
        name: /How to Create a Free Azure Account/i,
      });

      await expect(docsLink).toHaveAttribute("target", "_blank");

      const [newPage] = await Promise.all([
        context.waitForEvent("page"),
        docsLink.click(),
      ]);

      await newPage.waitForLoadState("domcontentloaded");
      await expect(newPage).toHaveURL(/./);
      await expectPageSnapshot(page, testInfo,"end-of-test.png",);

      await newPage.close();
    });


/*
  Connecting and Authenticating Microsoft Azure Account Test
    1. Signed-out user sees Access Pass intro
    2. Azure Login card is available
    3. Azure Access Pass card is locked
    4. User clicks Connect Azure
    5. Microsoft authentication begins
    6. Saved authenticated state is loaded
    7. User is shown as signed in
    8. Access Pass controls become available
*/
    test("Connecting and Authenticating Azure Account", async ({
      page,
      browser,
      browserName,
    }, testInfo) => {
      test.skip(
        browserName !== "chromium",
        "Microsoft authentication journey is only tested in Chromium.",
      );

    await test.step("Signed-out Access Pass Page Shows Azure Login Prerequisite", async () => {
      await expect(page).toHaveTitle(/ZenInstaller Access Pass/);

      await expect(page.getByText("Access Pass").first()).toBeVisible();

      await expect(
        page.getByText(
          /The ZenInstaller is used to deploy Zenblox to your environment/i,
        ),
      ).toBeVisible();

      await expect(page.getByText(/Azure Login/i).first()).toBeVisible();

      await expect(
        page.getByRole("button", { name: /Connect Azure/i }),
      ).toBeVisible();

      await expect(page.getByText(/Azure Access Pass/i).first()).toBeVisible();

      await expect(
        page.getByText(/Complete the Azure Login card first/i),
      ).toBeVisible();

    });

    await test.step("Clicking Connect Azure starts Microsoft Authentication", async () => {
      const popupPromise = page
        .waitForEvent("popup", { timeout: 10_000 })
        .catch(() => null);

      await page.getByRole("button", { name: /Connect Azure/i }).click();

      const popup = await popupPromise;

      if (popup) {
        await popup.waitForLoadState("domcontentloaded").catch(() => undefined);

        await expect(popup).toHaveURL(
          /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
        );

        await expectPageSnapshot(
          popup,
          testInfo,
          "microsoft-login-started-popup.png",
        );

        await popup.close();
      } else {
        await expect(page).toHaveURL(
          /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
        );

        await expectPageSnapshot(page, testInfo,"microsoft-login-started-redirect.png",);
      }
    });

    await test.step("Saved Microsoft Session Loads Authenticated Access Pass State", async () => {
      const context = await browser.newContext({
        storageState: storageStateFile,
        viewport: {
          width: 1280,
          height: 720,
        },
        deviceScaleFactor: 1,
      });

      const authenticatedPage = await context.newPage();

      try {
        await restoreSessionStorage(authenticatedPage);

        await authenticatedPage.goto(ACCESS_PASS_URL);

        await expect(
          authenticatedPage
            .getByText(/signed in as Name\.A\.LastName@brandedkeys\.com/i)
            .first(),
        ).toBeVisible();

        await expect(
          authenticatedPage
            .getByText(/Personal Microsoft account detected|Select Entra user/i)
            .first(),
        ).toBeVisible();

        // Verify the username locator is present on the authenticated page
        await expect(authenticatedPage.getByTestId("azure-account-username")).toBeVisible();
        const authenticatedUsername = await authenticatedPage.getByTestId("azure-account-username").innerText();
        console.log("authenticated username:", authenticatedUsername);

        await expectPageSnapshot(authenticatedPage, testInfo, "authenticated-after-azure-connect.png", { mask: sensitiveTextMasks(authenticatedPage) });
      } finally {
        await context.close();
      }
    });
  });

    /*
      Access Pass Authentication Tests
        1. Authenticated user can change tenant ID and load Entra tenant
        2. authenticated user can select an Entra user for access pass creation
        3. authenticated user can create a Temporary Access Pass for an Entra user
    */

});
  }



  
