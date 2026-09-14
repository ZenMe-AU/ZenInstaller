import { expect, test } from "@playwright/test";
import { restoreAzureSessionStorage } from "../util/setupHelper.mts";
import { CORP_URL, viewports } from "../../testInit";
import { expandAzureLoginCard, expectCardSnapshot, expectVisibleWithin, safePathSegment, sensitiveTextMasks } from "../util/testHelper.mts";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`Azure Login Card - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

      test("Happy path", async ({ page, context, }, testInfo) => {
            const testName = safePathSegment(testInfo.title,);
            await page.goto(CORP_URL);

            const azureCard = await test.step("Expand Unauthenticated Azure Login Card", async () => {
                const azureCard = await expandAzureLoginCard(page);
                await expectCardSnapshot(page, azureCard, testInfo, `${testName}-start.png`, { userId: "signed-out", viewportName, testFolder: "GitHub Login Card", },);
                return azureCard;
            });

            await test.step("Shows authenticated Azure card and selects a tenant", async () => {
              await restoreAzureSessionStorage(context);
              await page.reload();
              await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
              await expect(azureCard.getByTestId("txtAzureUsername")).toBeVisible();
              await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
              await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
              await expect(azureCard.getByText(/^Tenant/)).toBeVisible();
              await expectVisibleWithin(azureCard.getByRole("combobox"), "Combobox: Load already stored tenant id.", 500000);

              await expectCardSnapshot(page, azureCard, testInfo, `${testName}-end.png`, {
                userId: "azure-login",
                viewportName,
                testFolder: "Azure Login Card Authenticated",
                mask: sensitiveTextMasks(azureCard),
              });

            });
      });

      test("Signing Out button logs out current user", async ({ page, context }, testInfo) => {
        await restoreAzureSessionStorage(context);
        await page.goto(CORP_URL);
        const azureCard = await expandAzureLoginCard(page);
        await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
        await azureCard.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(azureCard.getByText(/Signed in as/i)).toHaveCount(0);
        await expectCardSnapshot(page, azureCard, testInfo, "signed-out.png", { userId: "signed-out", viewportName, testFolder: "Azure Login Card" });
      });

    });
}
