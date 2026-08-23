import { expect, test, type Page } from "@playwright/test";
import { corpAzureAuthStateExists, restoreCorpAzureSessionStorage, azureStorageStateFile } from "../setupHelper";
import { CORP_URL, viewports } from "../../testInit";
import { expectCardSnapshot, expectPageSnapshot, sensitiveTextMasks } from "../testHelper";

async function expandAzureLoginCard(page: Page) {
  const azureCard = page.locator("#card-azure_login");
  const introText = azureCard.getByText(/Sign in with Azure so we can create the app registration and cloud resources for you\./i);

  if (!(await introText.isVisible())) {
    await azureCard.getByText(/^Azure login$/i).click();
  }

  await expect(introText).toBeVisible();
  return azureCard;
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
  test.describe(`Azure Login Card - ${viewportName}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test.describe("Unauth", () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(CORP_URL);
      });

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
        test.skip(browserName !== "chromium", "Microsoft authentication journey is only tested in Chromium.");

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
      test.use({ viewport, deviceScaleFactor: 1, storageState: azureStorageStateFile });
      test.skip(!corpAzureAuthStateExists(), "Run pwtests/corp-src/setup/azure-login.setup.ts first.");

      test.beforeEach(async ({ page, context }) => {
        await restoreCorpAzureSessionStorage(context);
        await page.goto(CORP_URL);
      });

      test("Shows authenticated Azure card state and allows choosing a tenant", async ({ page }, testInfo) => {
        const azureCard = await expandAzureLoginCard(page);

        await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
        await expect(azureCard.getByTestId("txtAzureUsername")).toBeVisible();
        await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
        await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);

        const tenantLabel = azureCard.getByText(/^Tenant/);
        await expect(tenantLabel).toBeVisible();
        const tenantSelect = azureCard.getByTestId("tenant-select");
        const tenantCombobox = tenantSelect.getByRole("combobox");
        const manualTenantInput = azureCard.getByPlaceholder("Tenant name or ID");
        await expect(tenantSelect.or(manualTenantInput)).toBeVisible();

        if (await tenantSelect.isVisible()) {
          await tenantCombobox.click();
          if ((await tenantCombobox.getAttribute("aria-expanded")) !== "true") {
            await tenantCombobox.press("ArrowDown");
          }
          await expect(tenantCombobox).toHaveAttribute("aria-expanded", "true");

          const tenantOptions = page.getByTestId("tenant-option");
          await expect(tenantOptions.first()).toBeVisible({ timeout: 20_000 });
          const tenantOption = tenantOptions.first();

          await expectPageSnapshot(page, testInfo, "tenant-options.png", {
            userId: "azure-login",
            viewportName,
            testFolder: "Azure Login Card Authenticated",
            mask: sensitiveTextMasks(page),
          });

          const selectedDisplayName = (await tenantOption.getAttribute("data-tenant-name")) ?? "";
          await tenantOption.click();

          await expect(tenantCombobox).toHaveAttribute("aria-expanded", "false");
          if (selectedDisplayName) {
            await expect(tenantCombobox).toContainText(selectedDisplayName);
          }

          await expectCardSnapshot(page, azureCard, testInfo, "tenant-selected.png", {
            userId: "azure-login",
            viewportName,
            testFolder: "Azure Login Card Authenticated",
            mask: sensitiveTextMasks(page),
          });
        } else {
          await expect(manualTenantInput).toBeVisible();
          await expectCardSnapshot(page, azureCard, testInfo, "tenant-shown.png", {
            userId: "azure-login",
            viewportName,
            testFolder: "Azure Login Card Authenticated",
            mask: sensitiveTextMasks(page),
          });
        }
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
