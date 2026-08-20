import { expect, test as setup } from "@playwright/test";
import fs from "fs";
import { CORP_URL } from "../../testInit";
import { authDir, azureSessionStorageFile, azureStorageStateFile, corpAzureAuthStateExists, saveCorpAzureSessionStorage } from "../setupHelper";

setup("Manual Microsoft passkey login for corp Azure auth tests", async ({ page, context }) => {
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

  await page.pause();

  try {
    await page.waitForURL(/localhost:5173\/?(?:[/?#].*)?$/i, { timeout: 180_000 });
  } catch {
    console.log("Page did not return to the Corp page yet.");
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

  await page.context().storageState({ path: azureStorageStateFile });
  await saveCorpAzureSessionStorage(context);

  console.log(`Saved Azure auth storage state: ${azureStorageStateFile}`);
  console.log(`Saved Azure auth session storage: ${azureSessionStorageFile}`);
});
