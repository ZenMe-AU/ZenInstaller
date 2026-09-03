import { expect, test, type Page } from "@playwright/test";
import { corpAzureAuthStateExists, restoreAzureSessionStorage, azureStorageStateFile } from "../util/setupHelper";
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

      test("Clicking Sign in with Azure starts Microsoft authentication", async ({ page, browserName }) => {
        const azureCard = await expandAzureLoginCard(page);
        const popupPromise = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);
        await azureCard.getByRole("button", { name: "Sign in with Azure", exact: true }).click();
        const popup = await popupPromise;

        if (popup) {
          await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
          await expect(popup).toHaveURL(/login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/);
          await popup.close();
        } else {
          await expect(page).toHaveURL(/login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/);
        }
      });
    });

    test.describe("Auth", () => {
      test.beforeEach(async ({ page, context }) => {
        await restoreAzureSessionStorage(context);
        await page.goto(CORP_URL);
      });

      test("Shows authenticated Azure card state and allows choosing a tenant", async ({ page }, testInfo) => {
        const azureCard = await expandAzureLoginCard(page);
        await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
        await expect(azureCard.getByTestId("txtAzureUsername")).toBeVisible();
        await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
        await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
        await expect(azureCard.getByText(/^Tenant/)).toBeVisible();
        const tenantSelect = azureCard.getByRole('combobox').filter({ hasText: 'Select a tenant' })
        await tenantSelect.click();
        const tenantOption = page.getByRole("option").first();
        await expect(tenantOption).toBeVisible();
        await tenantOption.click();

        await expectCardSnapshot(page, azureCard, testInfo, "tenant-selected.png", {
          userId: "azure-login",
          viewportName,
          testFolder: "Azure Login Card Authenticated",
          mask: sensitiveTextMasks(azureCard),
        });

      });

      test("Signing out clears the authenticated state", async ({ page }) => {
        const azureCard = await expandAzureLoginCard(page);
        await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
        await azureCard.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(azureCard.getByText(/Signed in as/i)).toHaveCount(0);
      });
    });
  });
}
