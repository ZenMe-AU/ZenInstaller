import { test, expect, type Browser, type Page, type TestInfo, type Locator } from "@playwright/test";
import {restoreSessionStorage,} from "./authState";
import fs from "fs";
import type { AccessPassUser, EntraTargetUser } from "./accessPassUsers";
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

type ViewportSize =
  (typeof viewports)[keyof typeof viewports];

function sensitiveTextMasks(page: Page): Locator[] {
  return [
    page.getByTestId("txtAzureUsername"),
    page.getByText(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i),
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
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
  viewport: ViewportSize,
) {
  const auth = getAccessPassUserAuth(user);

  const context = await browser.newContext({
    storageState: auth.storageStateFile,
    viewport,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  await restoreSessionStorage(page, auth.sessionStorageFile);

  await page.goto(ACCESS_PASS_URL, {waitUntil: "domcontentloaded",});

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


export async function expectEntraUserListLoaded(
  page: Page,
) {
  await expect(page.getByText(/Select Entra user/i).first()).toBeVisible({
    timeout: 45_000,
  });
}

export async function expectEntraUserAvailable(
  page: Page,
  target: EntraTargetUser,
) {
  await expectEntraUserListLoaded(page);

  // find the table row containing this user's UPN
  const userRow = page.getByRole("row").filter({hasText: target.email,});

  await expect(userRow, `Expected exactly one table row for ${target.email}`,).toHaveCount(1);

  await expect(userRow.getByText(target.email, {exact: true,}),).toBeVisible();

  if (target.displayName) {
    await expect(
      userRow.getByText(target.displayName, {
        exact: true,
      }),
    ).toBeVisible();
  }

  const createAccessPassButton = userRow.getByRole("button", {name: /create access pass/i,});

  await expect(createAccessPassButton).toBeVisible();
  await expect(createAccessPassButton).toBeEnabled();

  return {
    userRow,
    createAccessPassButton,
  };
}

function getExpectedEntraMessage(
  user: AccessPassUser,
) {
  if (!user.expectedEntraMessage) {
    throw new Error(
      `No expectedEntraMessage configured for ${user.id}.`,
    );
  }

  return new RegExp(
    user.expectedEntraMessage,
    "i",
  );
}

async function expectNoAccessPassActions(
  page: Page,
) {
  await expect(
    page.getByRole("button", {
      name: /create access pass/i,
    }),
  ).toHaveCount(0);
}

async function expectEmptyEntraState(
  page: Page,
  user: AccessPassUser,
) {
  await expect(
    page
      .getByText(
        getExpectedEntraMessage(user),
      )
      .first(),
  ).toBeVisible({
    timeout: 45_000,
  });

  await expectNoAccessPassActions(page);
}

async function expectForbiddenEntraState(
  page: Page,
  user: AccessPassUser,
) {
  await expect(
    page
      .getByText(
        getExpectedEntraMessage(user),
      )
      .first(),
  ).toBeVisible({
    timeout: 45_000,
  });

  await expectNoAccessPassActions(page);
}

async function expectConfiguredTenantOutcome(
  page: Page,
  user: AccessPassUser,
) {
  switch (user.expectedEntraResult) {
    case "users": {
      await expectEntraUserListLoaded(page);

      for (const target of user.targetEntraUsers ?? []) {
        await test.step(
          `Verify target user ${target.email}`,
          async () => {
            await expectEntraUserAvailable(
              page,
              target,
            );
          },
        );
      }

      return;
    }

    case "empty": {
      await expectEmptyEntraState(
        page,
        user,
      );

      return;
    }

    case "forbidden": {
      await expectForbiddenEntraState(
        page,
        user,
      );

      return;
    }

    default: {
      const exhaustiveCheck: never =
        user.expectedEntraResult as never;

      throw new Error(
        `Unsupported expected Entra result: ${exhaustiveCheck}`,
      );
    }
  }
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
    
    const {
        page: authenticatedPage,
        context,
      } = await openAuthenticatedAccessPassPage(
        browser,
        user,
        viewport,
      );

    try {
      await expectAuthenticatedAccessPassState(
        authenticatedPage,
        user,
      );

      await expect(
        authenticatedPage
          .getByText(new RegExp(escapeRegExp(user.expectedPostLoginText), "i"))
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
    ({ browserName }) =>
      browserName !== "chromium",
    "Saved Microsoft passkey sessions are only tested in Chromium.",
  );

  for (const user of users) {
    const targets =
      user.targetEntraUsers;

    test.describe(
      `- ${user.id}`,
      () => {
        test.beforeEach(() => {
          const auth =
            getAccessPassUserAuth(user);

          test.skip(
            !auth.exists,
            [
              `Missing auth files for ${user.id}.`,
              "Run azure-passkey.setup.ts first.",
              `Expected storage: ${auth.storageStateFile}`,
              `Expected session: ${auth.sessionStorageFile}`,
            ].join(" "),
          );
        });

        /*
         * Common login test for Name A, Name D and Name E.
         */
        test(
          "User loads Access Pass page",
          async ({
            browser,
          }, testInfo) => {
            const {
              page,
              context,
            } =
              await openAuthenticatedAccessPassPage(
                browser,
                user,
                viewport,
              );

            try {
              await expectAuthenticatedAccessPassState(
                page,
                user,
              );

              await expect(
                page
                  .getByText(
                    new RegExp(
                      escapeRegExp(
                        user.expectedPostLoginText,
                      ),
                      "i",
                    ),
                  )
                  .first(),
              ).toBeVisible({
                timeout: 45_000,
              });

              await expectPageSnapshot(
                page,
                testInfo,
                "authenticated-access-pass-loaded.png",
                {
                  mask:
                    sensitiveTextMasks(page),
                },
              );
            } finally {
              await context.close();
            }
          },
        );

        /*
         * Name A:
         *   confirms both Name D and Name E rows.
         *
         * Name D and Name E:
         *   confirms the configured empty or forbidden state.
         */
        test(
          `Tenant outcome is ${user.expectedEntraResult}`,
          async ({
            browser,
          }, testInfo) => {
            test.skip(
              !user.tenantId,
              `No tenantId configured for ${user.id}.`,
            );

            const {
              page,
              context,
            } =
              await openAuthenticatedAccessPassPage(
                browser,
                user,
                viewport,
              );

            try {
              await expectAuthenticatedAccessPassState(
                page,
                user,
              );

              await test.step(
                "Change or confirm tenant ID",
                async () => {
                  await changeTenantIdIfAvailable(
                    page,
                    user.tenantId!,
                  );
                },
              );

              await test.step(
                `Assert ${user.expectedEntraResult} tenant outcome`,
                async () => {
                  await expectConfiguredTenantOutcome(
                    page,
                    user,
                  );
                },
              );

              await expectPageSnapshot(
                page,
                testInfo,
                `${user.expectedEntraResult}-tenant-outcome.png`,
                {
                  mask:
                    sensitiveTextMasks(page),
                },
              );
            } finally {
              await context.close();
            }
          },
        );

        /*
         * Only accounts expecting user rows generate these tests.
         *
         * For Name A this creates:
         * - Access Pass action is available for name-d
         * - Access Pass action is available for name-e
         */
        if (
          user.expectedEntraResult ===
          "users"
        ) {
          for (const target of targets) {
            test(
              `Access Pass action is available for ${target.id}`,
              async ({
                browser,
              }, testInfo) => {
                test.skip(
                  !user.tenantId,
                  `No tenantId configured for ${user.id}.`,
                );

                const {
                  page,
                  context,
                } =
                  await openAuthenticatedAccessPassPage(
                    browser,
                    user,
                    viewport,
                  );

                try {
                  await expectAuthenticatedAccessPassState(
                    page,
                    user,
                  );

                  await changeTenantIdIfAvailable(
                    page,
                    user.tenantId!,
                  );

                  await expectEntraUserListLoaded(
                    page,
                  );

                  await expectEntraUserAvailable(
                    page,
                    target,
                  );

                  await expectPageSnapshot(
                    page,
                    testInfo,
                    `${target.id}-access-pass-action-ready.png`,
                    {
                      mask:
                        sensitiveTextMasks(
                          page,
                        ),
                    },
                  );
                } finally {
                  await context.close();
                }
              },
            );

            /*
             * Destructive test.
             *
             * It is restricted to Desktop so enabling the environment
             * variable does not create a TAP once for Desktop and again
             * for Mobile.
             */
            test(
              `Creating Temporary Access Pass for ${target.id}`,
              async ({
                browser,
              }, testInfo) => {
                test.skip(
                  viewportName !==
                    "Desktop",
                  "Real Temporary Access Pass creation runs once on Desktop.",
                );

                test.skip(
                  process.env
                    .RUN_ACCESS_PASS_CREATION !==
                    "true",
                  "Set RUN_ACCESS_PASS_CREATION=true to run real Access Pass creation.",
                );

                test.skip(
                  !user.canCreateAccessPass,
                  `${user.id} is not allowed to create access passes.`,
                );

                test.skip(
                  !target.allowRealAccessPassCreation,
                  `Real Access Pass creation is disabled for ${target.id}.`,
                );

                test.skip(
                  !user.tenantId,
                  `No tenantId configured for ${user.id}.`,
                );

                const {
                  page,
                  context,
                } =
                  await openAuthenticatedAccessPassPage(
                    browser,
                    user,
                    viewport,
                  );

                try {
                  await expectAuthenticatedAccessPassState(
                    page,
                    user,
                  );

                  await changeTenantIdIfAvailable(
                    page,
                    user.tenantId!,
                  );

                  await expectEntraUserListLoaded(
                    page,
                  );

                  const {
                    createAccessPassButton,
                  } =
                    await expectEntraUserAvailable(
                      page,
                      target,
                    );

                  await createAccessPassButton.click();

                  await expect(
                    page
                      .getByText(
                        /temporary access pass|access pass created|expires|copy/i,
                      )
                      .first(),
                  ).toBeVisible({
                    timeout: 60_000,
                  });

                  const possibleTemporaryAccessPassSecret =
                    page
                      .getByText(
                        /[A-Za-z0-9!@#$%^&*()_\-+=]{6,}/,
                      )
                      .last();

                  await expectPageSnapshot(
                    page,
                    testInfo,
                    `${target.id}-temporary-access-pass-created.png`,
                    {
                      mask: [
                        ...sensitiveTextMasks(
                          page,
                        ),
                        possibleTemporaryAccessPassSecret,
                      ],
                    },
                  );
                } finally {
                  await context.close();
                }
              },
            );
          }
        }
      },
    );
  }
}); // AP-Auth

    }); // AP-Desktop / AP-Mobile
  } // viewports loop
  



  
