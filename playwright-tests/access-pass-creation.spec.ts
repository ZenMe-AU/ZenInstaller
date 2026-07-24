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
  changeTenantIdIfAvailable,
  expectAuthenticatedAccessPassState,
  expectEntraUserAvailable,
  expectEntraUserListLoaded,
  expectPageSnapshot,
  openAuthenticatedAccessPassPage,
  sensitiveTextMasks,
} from "./testHelper";

const users = loadAccessPassUsers();
const desktopViewport = viewports.Desktop;

test.describe("AP-Desktop - Temporary Access Pass Creation", () => {
  test.use({
    viewport: desktopViewport,
    deviceScaleFactor: 1,
  });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Saved Microsoft passkey sessions are only tested in Chromium.",
  );

  for (const user of users) {
    if (user.expectedEntraResult !== "users") {
      continue;
    }

    const targets = user.targetEntraUsers ?? [];

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

      for (const target of targets) {
        test(
          `Creating Temporary Access Pass for ${target.id}`,
          async ({ browser }, testInfo) => {
            test.skip(
              process.env.RUN_ACCESS_PASS_CREATION !== "true",
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
            } = await openAuthenticatedAccessPassPage(
              browser,
              user,
              desktopViewport,
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

              await expectEntraUserListLoaded(page);

              const {
                createAccessPassButton,
              } = await expectEntraUserAvailable(
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
                {userId: user.id, viewportName: "Desktop",
                  mask: [
                    ...sensitiveTextMasks(page),
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
    });
  }
});