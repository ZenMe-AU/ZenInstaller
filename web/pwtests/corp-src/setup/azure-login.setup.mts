import { expect, test as setup } from "@playwright/test";
import fs from "fs";
import { CORP_URL } from "../../testInit";
import { authDir, azureSessionStorageFile, azureStorageStateFile, corpAzureAuthStateExists, saveAzureSessionStorage } from "../util/setupHelper.mts";

const tenantReselectionTimeout = 120_000;

setup("Manual setup for corp Azure auth tests", async ({ page, context }) => {
  fs.mkdirSync(authDir, { recursive: true });

  if (corpAzureAuthStateExists() && process.env.FORCE_AZURE_PASSKEY_SETUP !== "true") {
    console.log("Azure auth state already exists. Skipping manual passkey login.");
    console.log(`Storage state: ${azureStorageStateFile}`);
    console.log(`Session storage: ${azureSessionStorageFile}`);
    return;
  }

  await page.goto(CORP_URL);

  const azureCard = page.locator("#card-azure_login");
  const signInButton = azureCard.getByRole("button", { name: "Sign in with Azure", exact: true });

  if (!(await signInButton.isVisible())) {
    await azureCard.getByText(/^Azure login$/i).click();
  }
  await expect(signInButton).toBeVisible();
  await signInButton.click();
  console.log("You need to manually sign into your Azure account in the test browser.");
  await page.pause();

  try {
    await page.waitForURL(/localhost:5173\/?(?:[/?#].*)?$/i, { timeout: 180_000 });
  } catch {
    console.log("Page failed to redirect after manual sign in.");
    console.log(`Current URL: ${page.url()}`);

    if (page.url().startsWith("http://localhost:5173")) {
      await page
        .goto(CORP_URL, { waitUntil: "domcontentloaded", timeout: 30_000 })
        .catch((err) => {
          console.log(`Fallback navigation was skipped: ${err.message}`);
        });
    }
  }

  await expect(page.locator("#card-azure_login").getByText(/Signed in as/i)).toBeVisible({ timeout: 120_000 });
  const authenticatedAzureCard = page.locator("#card-azure_login");
  const tenantSelect = authenticatedAzureCard.getByRole("combobox");
  if (await tenantSelect.isVisible()) await tenantSelect.click();
  console.log("Select a tenant, or enter and confirm a tenant ID to resume the Playwright test.");
  await page.pause();

  const microsoftConsent = page.waitForURL(/login\.microsoftonline\.com|login\.live\.com/i, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (await microsoftConsent) {
    await page.pause();
    await page.waitForURL(/localhost:5173\/?(?:[/?#].*)?$/i, { timeout: 180_000 });
  }

  const restoredAzureCard = page.locator("#card-azure_login");
  await expect(restoredAzureCard.getByText(/Signed in as/i)).toBeVisible({ timeout: 120_000 });
  const restoredTenantSelect = restoredAzureCard.getByTestId("tenant-select");
  const restoredTenantInput = restoredAzureCard.getByPlaceholder("Tenant ID");
  await expect(restoredTenantSelect.or(restoredTenantInput)).toBeVisible({ timeout: 120_000 });

  const restoredTenantValue = await restoredTenantSelect.isVisible()
    ? restoredTenantSelect.locator("input")
    : restoredTenantInput;
  let azureTenantId = (await restoredTenantValue.inputValue()).trim();

  if (!azureTenantId) {
    if (await restoredTenantSelect.isVisible()) await restoredTenantSelect.click();
    console.log("The tenant selection was not restored. Select or enter a tenant to continue.");
    await expect(restoredTenantValue).toHaveValue(/.+/, { timeout: tenantReselectionTimeout });

    azureTenantId = (await restoredTenantValue.inputValue()).trim();
  }

  if (!azureTenantId) throw new Error("Select or confirm an Azure tenant before resuming the setup test.");

  await page.evaluate((tenantId) => sessionStorage.setItem("zeninstaller_arm_tenant", tenantId), azureTenantId);

  await page.context().storageState({ path: azureStorageStateFile });
  await saveAzureSessionStorage(context);

  console.log(`Saved Azure auth storage state: ${azureStorageStateFile}`);
  console.log(`Saved Azure auth session storage: ${azureSessionStorageFile}`);
});
