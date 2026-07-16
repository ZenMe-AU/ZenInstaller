import {
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

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Entra User Actions`, () => {
    test.use({
      viewport,
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
            `Access Pass action is available for ${target.id}`,
            async ({ browser }, testInfo) => {
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

                await expectEntraUserListLoaded(page);

                await expectEntraUserAvailable(
                  page,
                  target,
                );

                await expectPageSnapshot(
                  page,
                  testInfo,
                  `${target.id}-access-pass-action-ready.png`,
                  {userId: user.id, viewportName,
                    mask: sensitiveTextMasks(page),
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
}