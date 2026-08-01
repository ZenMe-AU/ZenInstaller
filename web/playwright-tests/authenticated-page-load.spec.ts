import {
  expect,
  test,
} from "@playwright/test";

import {
  getAccessPassUserAuth,
  loadAccessPassUsers,
} from "./accessPassUsers";

import {
  viewports,
} from "./testInit";

import {
  escapeRegExp,
  expectAuthenticatedAccessPassState,
  expectPageSnapshot,
  openAuthenticatedAccessPassPage,
  sensitiveTextMasks,
} from "./testHelper";

const users = loadAccessPassUsers();

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Authenticated Page Load`, () => {
    test.use({
      viewport,
      deviceScaleFactor: 1,
    });

    test.skip(
      ({ browserName }) => browserName !== "chromium",
      "Saved Microsoft passkey sessions are only tested in Chromium.",
    );

    for (const user of users) {
      test.describe(user.id, () => {
        test.beforeEach(() => {
          const auth = getAccessPassUserAuth(user);

          test.skip(
            !auth.exists,
            [
              `Missing auth files for ${user.id}.`,
              `Expected storage: ${auth.storageStateFile}`,
              `Expected session: ${auth.sessionStorageFile}`,
            ].join(" "),
          );
        });

        test("User loads Access Pass page", async ({
          browser,
        }, testInfo) => {
          const {
            page,
            context,
          } = await openAuthenticatedAccessPassPage(
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
              {userId: user.id, viewportName,
                mask: sensitiveTextMasks(page),
              },
            );
          } finally {
            await context.close();
          }
        });
      });
    }
  });
}