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

test(
  "Access Pass actions are available for configured Entra users",
  async ({ browser }, testInfo) => {
    test.skip(
      !user.tenantId,
      `No tenantId configured for ${user.id}.`,
    );

    test.skip(
      targets.length === 0,
      `No target Entra users configured for ${user.id}.`,
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
      /*
       * Restore and verify Name A only once.
       */
      await expectAuthenticatedAccessPassState(
        page,
        user,
      );

      /*
       * Load the tenant only once.
       */
      await changeTenantIdIfAvailable(
        page,
        user.tenantId!,
      );

      await expectEntraUserListLoaded(
        page,
      );

      /*
       * Check Name D and Name E using the already loaded table.
       */
      for (const target of targets) {
        await test.step(
          `Verify Access Pass action for ${target.id}`,
          async () => {
            await expectEntraUserAvailable(
              page,
              target,
            );
          },
        );
      }

      /*
       * One screenshot contains the complete Entra-user table.
       */
      await expectPageSnapshot(
        page,
        testInfo,
        "all-entra-user-actions-ready.png",
        {
          userId: user.id,
          viewportName,
          mask: sensitiveTextMasks(page),
        },
      );
    } finally {
      await context.close();
    }
  },
);
      });
    }
  });
}