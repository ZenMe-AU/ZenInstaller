import { expect, test } from "@playwright/test";
import { restoreAzureSessionStorage } from "../util/setupHelper";
import { CORP_URL, viewports } from "../../testInit";
import { expandAzureLoginCard, expectCardSnapshot, expectVisibleWithin, sensitiveTextMasks } from "../util/testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`Azure Login Card - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test.describe("Unauth", () => {
      test.beforeEach(async ({ page }) => { await page.goto(CORP_URL); });

      test("Renders the sign-in prompt with a link to create an Azure account", async ({ page }, testInfo) => {
        const azureCard = await expandAzureLoginCard(page);
        await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toBeVisible();
        await expect(azureCard.getByText(/No Azure account\?/i)).toBeVisible();

        const createAccountLink = azureCard.getByRole("link", { name: /Create a free one/i });
        await expect(createAccountLink).toBeVisible();
        await expect(createAccountLink).toHaveAttribute("target", "_blank");
        await expect(createAccountLink).toHaveAttribute("href", /Creating_AZURE_account/);
        await expect(azureCard.getByTestId("txtAzureUsername")).toHaveCount(0);
        await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
        await expectCardSnapshot(page, azureCard, testInfo, "signed-out.png", { userId: "signed-out", viewportName, testFolder: "Azure Login Card" });
      });

    });

    test.describe("Auth", () => {
      test.beforeEach(async ({ page, context }) => {
        await restoreAzureSessionStorage(context);
        await page.goto(CORP_URL);
      });

      test("Shows authenticated Azure card and selects a tenant", async ({ page }, testInfo) => {
        const azureCard = await expandAzureLoginCard(page);
        await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
        await expect(azureCard.getByTestId("txtAzureUsername")).toBeVisible();
        await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
        await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
        await expect(azureCard.getByText(/^Tenant/)).toBeVisible();
        await expectVisibleWithin(azureCard.getByRole("combobox"), "Combobox: Load already stored tenant id.", 500000);

        await expectCardSnapshot(page, azureCard, testInfo, "tenant-selected.png", {
          userId: "azure-login",
          viewportName,
          testFolder: "Azure Login Card Authenticated",
          mask: sensitiveTextMasks(azureCard),
        });

      });

      test("Signing Out button logs out current user", async ({ page }) => {
        const azureCard = await expandAzureLoginCard(page);
        await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
        await azureCard.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(azureCard.getByText(/Signed in as/i)).toHaveCount(0);
      });
    });
  });
}
