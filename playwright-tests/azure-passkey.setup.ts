// run this from workspace root
// pnpm exec playwright test azure-passkey.setup.ts --headed 

import { expect, test as setup } from "@playwright/test";
import fs from "fs";
import {
  authDir,
  saveSessionStorage,
  sessionStorageFile,
  storageStateFile,
} from "./authState";

setup("manual Microsoft passkey login", async ({ page }) => {
  fs.mkdirSync(authDir, { recursive: true });

  const authStateAlreadyExists =
    fs.existsSync(storageStateFile) && fs.existsSync(sessionStorageFile);

  if (authStateAlreadyExists) {
    console.log("Azure auth state already exists. Skipping manual passkey login.");
    return;
  }

  await page.goto("http://localhost:5173/accessPass.html");

  const connectAzureButton = page.getByRole("button", {
    name: /connect azure/i,
  });

  await expect(connectAzureButton).toBeVisible();

  await connectAzureButton.click();

  /*
    Complete Microsoft login manually.

    Important:
    - Use passkey.
    - Click "Yes" on Stay signed in.
    - Wait until you return to Access Pass.
    - Confirm "Signed in as Name.A.LastName@brandedkeys.com" is visible.
    - Then click Resume in Playwright Inspector.
  */
  await page.pause();

  await expect(
    page.getByText(/signed in as Name\.A\.LastName@brandedkeys\.com/i).first(),
  ).toBeVisible({
    timeout: 120_000,
  });

  await page.context().storageState({ path: storageStateFile });

  await saveSessionStorage(page);
});