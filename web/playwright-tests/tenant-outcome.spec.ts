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
  expectConfiguredTenantOutcome,
  expectPageSnapshot,
  openAuthenticatedAccessPassPage,
  sensitiveTextMasks,
} from "./testHelper";

const users = loadAccessPassUsers();

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`AP-${viewportName} - Tenant Outcome`, () => {
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

        test(
          `Tenant outcome is ${user.expectedEntraResult}`,
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
                {userId: user.id, viewportName,
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