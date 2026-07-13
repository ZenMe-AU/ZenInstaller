import { test, expect, type Browser, type Page, type TestInfo, type Locator } from "@playwright/test";
import {restoreSessionStorage,} from "./authState";
import fs from "fs";
import type { AccessPassUser } from "./accessPassUsers";
import {
  getAccessPassUserAuth,
  loadAccessPassUsers,
} from "./accessPassUsers";

const ACCESS_PASS_URL = "http://localhost:5173/accessPass.html";
const users = loadAccessPassUsers();

// different sizes for different screens
const viewports = {
  Desktop: { width: 1920, height: 1080 },
  // Laptop: { width: 1366, height: 768 },
  Mobile: { width: 414, height: 896 },
  // Tablet: { width: 768, height: 1024 },
} as const;

function sensitiveTextMasks(page: Page): Locator[] {
  return [
    page.getByTestId("txtAzureUsername"),
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

async function openAuthenticatedAccessPassPage(
  browser: Browser,
  user: AccessPassUser,
) {
  const auth = getAccessPassUserAuth(user);

  const context = await browser.newContext({
    storageState: auth.storageStateFile,
    viewport: {
      width: 1920,
      height: 1080,
    },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  await restoreSessionStorage(page, auth.sessionStorageFile);

  await page.goto(ACCESS_PASS_URL);

  return { page, context };
}

async function expectAuthenticatedAccessPassState(
  page: Page,
  user: AccessPassUser,
) {
  await expect(page.getByText("Access Pass").first()).toBeVisible();

  await expect(
    page.getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i")).first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByText(/Azure Login/i).first()).toBeVisible();
  await expect(page.getByText(/Azure Access Pass/i).first()).toBeVisible();
}

function getAzureJourneyUser() {
  const requestedUserId = process.env.ACCESS_PASS_AUTH_USER;

  if (requestedUserId) {
    const requestedUser = users.find((user) => user.id === requestedUserId);

    if (!requestedUser) {
      throw new Error(
        `ACCESS_PASS_AUTH_USER="${requestedUserId}" was not found in access-pass-users.local.json`,
      );
    }

    return requestedUser;
  }

  const firstUser = users[0];

  if (!firstUser) {
    throw new Error(
      "No Access Pass users found. Add at least one user to playwright-tests/data/access-pass-users.local.json",
    );
  }

  return firstUser;
}

async function changeTenantIdIfAvailable(
  page: Page,
  tenantId: string,
) {
  const changeTenantText = page.getByText(/change tenant id/i).first();

  if (await changeTenantText.isVisible().catch(() => false)) {
    await changeTenantText.click();
  }

  const tenantInput = page.getByPlaceholder(
    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  );

  if (!(await tenantInput.isVisible().catch(() => false))) {
    console.log(
      "Tenant ID input is not visible. This account may already be using an Entra tenant.",
    );
    return false;
  }

  await tenantInput.fill("");
  await tenantInput.fill(tenantId);

  const loadTenantButton = page.getByRole("button", {
    name: /load tenant|confirm tenant|save tenant/i,
  });

  await expect(loadTenantButton).toBeEnabled();
  await loadTenantButton.click();

  return true;
}

async function expectTenantLoaded(page: Page) {
  const userSection = page.getByText(/Select Entra user/i).first();
  const errorMessage = page
    .getByText(/timed_out|error|failed|unable|unauthorized|forbidden/i)
    .first();

  await expect(userSection.or(errorMessage)).toBeVisible({
    timeout: 45_000,
  });

  if (await errorMessage.isVisible().catch(() => false)) {
    throw new Error(
      `Tenant/user loading failed. The Access Pass UI showed an error instead of the Entra user list.`,
    );
  }

  await expect(userSection).toBeVisible();
}

export async function selectEntraUser(
  page: Page,
  userEmail: string,
) {
  await expect(page.getByText(/Select Entra user/i).first()).toBeVisible({
    timeout: 45_000,
  });

  const matchingUser = page
    .getByText(new RegExp(escapeRegExp(userEmail), "i"))
    .first();

  if (!(await matchingUser.isVisible().catch(() => false))) {
    const visibleText = await page.locator("body").innerText();

    console.log("");
    console.log("Could not find target Entra user in page:");
    console.log(userEmail);
    console.log("");
    console.log("Visible page text:");
    console.log(visibleText.slice(0, 3000));
    console.log("");

    throw new Error(
      `Target Entra user was not visible in the Access Pass user list: ${userEmail}`,
    );
  }

  await matchingUser.click();
}

async function expectAccessPassCreationReady(page: Page) {
  const createButton = page.getByRole("button", {
    name: /create.*access pass|create temporary access pass|generate access pass/i,
  });

  await expect(createButton).toBeVisible({
    timeout: 45_000,
  });

  await expect(createButton).toBeEnabled();

  return createButton;
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
-----------------------------------------------------------------------------
  START OF THE TESTS
------------------------------------------------------------------------------
*/

  for (const [viewportName, viewport] of Object.entries(viewports)) {
    test.describe(`AP- ${viewportName}`, () => {
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
      test("Renders Access Pass Page", async ({ page }, testInfo) => {

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
    test('ZenInstaller Link Redirects', async ({ page, context }, testInfo) => {

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
    test("Help Link Redirects", async ({ page, context }, testInfo) => {

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
    6. Saved authenticated state is loaded from the selected local user
    7. User is shown as signed in
    8. Access Pass controls become available
*/
test("Connecting Azure", async ({
  page,
  browser,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Microsoft authentication journey is only tested in Chromium.",
  );

  const user = getAzureJourneyUser();
  const auth = getAccessPassUserAuth(user);

  test.skip(
    !auth.exists,
    `Missing auth files for ${user.id}. Run azure-passkey.setup.ts first. Expected files: ${auth.storageStateFile} and ${auth.sessionStorageFile}`,
  );

  await test.step("Signed-out Access Pass page shows Azure Login prerequisite", async () => {
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

    await expectPageSnapshot(
      page,
      testInfo,
      "signed-out-before-connect-azure.png",
    );
  });

  await test.step("Clicking Connect Azure starts Microsoft authentication", async () => {
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

      await expectPageSnapshot(
        page,
        testInfo,
        "microsoft-login-started-redirect.png",
      );
    }
  });

  await test.step(`Saved Microsoft session loads authenticated Access Pass state for ${user.id}`, async () => {
    const context = await browser.newContext({
      storageState: auth.storageStateFile,
      viewport: {
        width: 1920,
        height: 1080,
      },
      deviceScaleFactor: 1,
    });

    const authenticatedPage = await context.newPage();

    try {
      await restoreSessionStorage(
        authenticatedPage,
        auth.sessionStorageFile,
      );

      await authenticatedPage.goto(ACCESS_PASS_URL);

      await expectAuthenticatedAccessPassState(
        authenticatedPage,
        user,
      );

      await expect(
        authenticatedPage
          .getByText(new RegExp(user.expectedPostLoginText, "i"))
          .first(),
      ).toBeVisible({
        timeout: 45_000,
      });

      await expect(
        authenticatedPage.getByTestId("azure-account-username"),
      ).toBeVisible();

      await expectPageSnapshot(
        authenticatedPage,
        testInfo,
        "authenticated-after-azure-connect.png",
        {
          mask: sensitiveTextMasks(authenticatedPage),
        },
      );
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

    test.describe("AP-Auth", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Saved Microsoft passkey sessions are only tested in Chromium.",
  );

  for (const user of users) {
    test.describe(`- ${user.id}`, () => {
      test.beforeEach(() => {
        const auth = getAccessPassUserAuth(user);

        test.skip(
          !auth.exists,
          `Missing auth files for ${user.id}. Run azure-passkey-users.setup.ts first.`,
        );
      });

      test("User load Access Pass page", async ({
        browser,
      }, testInfo) => {
        const { page, context } = await openAuthenticatedAccessPassPage(
          browser,
          user,
        );

        try {
          await expectAuthenticatedAccessPassState(page, user);

          await expect(
            page
              .getByText(new RegExp(user.expectedPostLoginText, "i"))
              .first(),
          ).toBeVisible({
            timeout: 45_000,
          });

          await expectPageSnapshot(
            page,
            testInfo,
            "authenticated-access-pass-loaded.png",
            {
              mask: sensitiveTextMasks(page),
            },
          );
        } finally {
          await context.close();
        }
      });

      test("Loading Tenant ID", async ({
        browser,
      }, testInfo) => {
        test.skip(
          !user.tenantId,
          `No tenantId configured for ${user.id}.`,
        );

        const { page, context } = await openAuthenticatedAccessPassPage(
          browser,
          user,
        );

        try {
          await expectAuthenticatedAccessPassState(page, user);

          await test.step("Change or confirm tenant ID", async () => {
            await changeTenantIdIfAvailable(page, user.tenantId!);
          });

          await test.step("Tenant controls load", async () => {
            await expectTenantLoaded(page);
          });

          await expectPageSnapshot(
            page,
            testInfo,
            "tenant-loaded.png",
            {
              mask: sensitiveTextMasks(page),
            },
          );
        } finally {
          await context.close();
        }
      });

      test("Select Entra User for Access Pass Creation", async ({
        browser,
      }, testInfo) => {
        test.skip(
          !user.targetEntraUserEmail,
          `No targetEntraUserEmail configured for ${user.id}.`,
        );

        const { page, context } = await openAuthenticatedAccessPassPage(
          browser,
          user,
        );

        try {
          await expectAuthenticatedAccessPassState(page, user);

          if (user.tenantId) {
            await changeTenantIdIfAvailable(page, user.tenantId);
          }

          await expectTenantLoaded(page);

          await selectEntraUser(page, user.targetEntraUserEmail!);

          await expectAccessPassCreationReady(page);

          await expectPageSnapshot(
            page,
            testInfo,
            "entra-user-selected-ready-for-access-pass.png",
            {
              mask: sensitiveTextMasks(page),
            },
          );
        } finally {
          await context.close();
        }
      });

      test("Creating Temporary Access Pass", async ({
        browser,
      }, testInfo) => {
        test.skip(
          process.env.RUN_ACCESS_PASS_CREATION !== "true",
          "Skipping real Access Pass creation. Set RUN_ACCESS_PASS_CREATION=true to run this test.",
        );

        test.skip(
          !user.canCreateAccessPass,
          `${user.id} is not marked as allowed to create access passes.`,
        );

        test.skip(
          !user.targetEntraUserEmail,
          `No targetEntraUserEmail configured for ${user.id}.`,
        );

        const { page, context } = await openAuthenticatedAccessPassPage(
          browser,
          user,
        );

        try {
          await expectAuthenticatedAccessPassState(page, user);

          if (user.tenantId) {
            await changeTenantIdIfAvailable(page, user.tenantId);
          }

          await expectTenantLoaded(page);

          await selectEntraUser(page, user.targetEntraUserEmail!);

          const createButton = await expectAccessPassCreationReady(page);

          await createButton.click();

          await expect(
            page
              .getByText(/temporary access pass|access pass created|expires|copy/i)
              .first(),
          ).toBeVisible({
            timeout: 60_000,
          });

          const possibleTemporaryAccessPassSecret = page
            .getByText(/[A-Za-z0-9!@#$%^&*()_\-+=]{6,}/)
            .last();

          await expectPageSnapshot(
            page,
            testInfo,
            "temporary-access-pass-created-masked.png",
            {
              mask: [
                ...sensitiveTextMasks(page),
                possibleTemporaryAccessPassSecret,
              ],
            },
          );
        } finally {
          await context.close();
        }
      });
    });
  }
});

});
  }



  
