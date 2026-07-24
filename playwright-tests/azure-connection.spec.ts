import {
  expect,
  test,
} from "@playwright/test";

import {
  getAccessPassUserAuth,
  loadAccessPassUsers,
} from "./accessPassUsers";

import {
  ACCESS_PASS_URL,
  viewports,
} from "./testInit";

import {
  escapeRegExp,
  expectAuthenticatedAccessPassState,
  expectPageSnapshot,
  getAzureJourneyUser,
  openAuthenticatedAccessPassPage,
  sensitiveTextMasks,
} from "./testHelper";

const users = loadAccessPassUsers();

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Connect Azure`, () => {
    test.use({
      viewport,
      deviceScaleFactor: 1,
    });

    test.beforeEach(async ({ page }, testInfo) => {
      await page.goto(ACCESS_PASS_URL);

      await expectPageSnapshot(
        page,
        testInfo,
        "initial-before-test.png",
        {userId: "signed-out", viewportName}
      );
    });

    test("Connecting Azure", async ({
      page,
      browser,
      browserName,
    }, testInfo) => {
      test.skip(
        browserName !== "chromium",
        "Microsoft authentication journey is only tested in Chromium.",
      );

      const user = getAzureJourneyUser(users);
      const auth = getAccessPassUserAuth(user);

      test.skip(
        !auth.exists,
        [
          `Missing auth files for ${user.id}.`,
          `Expected storage: ${auth.storageStateFile}`,
          `Expected session: ${auth.sessionStorageFile}`,
        ].join(" "),
      );

      await test.step(
        "Signed-out Access Pass page shows Azure Login prerequisite",
        async () => {
          await expect(page).toHaveTitle(
            /ZenInstaller Access Pass/,
          );

          await expect(
            page.getByText("Access Pass").first(),
          ).toBeVisible();

          await expect(
            page.getByText(
              /The ZenInstaller is used to deploy Zenblox to your environment/i,
            ),
          ).toBeVisible();

          await expect(
            page.getByText(/Azure Login/i).first(),
          ).toBeVisible();

          await expect(
            page.getByRole("button", {
              name: /Connect Azure/i,
            }),
          ).toBeVisible();

          await expect(
            page.getByText(/Azure Access Pass/i).first(),
          ).toBeVisible();

          await expect(
            page.getByText(
              /Complete the Azure Login card first/i,
            ),
          ).toBeVisible();

          await expectPageSnapshot(
            page,
            testInfo,
            "signed-out-before-connect-azure.png",
            {userId: "signed-out", viewportName}
          );
        },
      );

      await test.step(
        "Clicking Connect Azure starts Microsoft authentication",
        async () => {
          const popupPromise = page
            .waitForEvent("popup", {
              timeout: 10_000,
            })
            .catch(() => null);

          await page.getByRole("button", {
            name: /Connect Azure/i,
          }).click();

          const popup = await popupPromise;

          if (popup) {
            await popup
              .waitForLoadState("domcontentloaded")
              .catch(() => undefined);

            await expect(popup).toHaveURL(
              /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
            );

            await expectPageSnapshot(
              popup,
              testInfo,
              "microsoft-login-started-popup.png",
              {userId: "signed-out", viewportName}
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
              {userId: "signed-out", viewportName}
            );
          }
        },
      );

      await test.step(
        `Saved Microsoft session loads authenticated state for ${user.id}`,
        async () => {
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

            await expect(
              authenticatedPage.getByTestId(
                "azure-account-username",
              ),
            ).toBeVisible();

            await expectPageSnapshot(
              authenticatedPage,
              testInfo,
              "authenticated-after-azure-connect.png",
              {userId: "signed-out", viewportName,
                mask:
                  sensitiveTextMasks(
                    authenticatedPage,
                  ),
              },
            );
          } finally {
            await context.close();
          }
        },
      );
    });
  });
}