// run this from workspace root
// pnpm exec playwright test azure-passkey.setup.ts --project=chromium --headed --workers=1

  /*
      Complete Microsoft login manually.

      Important:
      - Use passkey.
      - Click "Yes" on Stay signed in.
      - Wait until you return to Access Pass.
      - Confirm "Signed in as <UPN>" is visible.
      - Then click Resume in Playwright Inspector.
    */

import { expect, test as setup } from "@playwright/test";
import fs from "fs";
import {
  authDir,
  saveSessionStorage,
} from "./authState";
import {
  getAccessPassUserAuth,
  loadAccessPassUsers,
} from "./accessPassUsers";

const ACCESS_PASS_URL = "http://localhost:5173/accessPass.html";

const allUsers = loadAccessPassUsers();
const requestedUserId = process.env.ACCESS_PASS_AUTH_USER?.trim();
const users = requestedUserId ? allUsers.filter((user) => user.id === requestedUserId,): allUsers;

if (requestedUserId && users.length === 0) {
  throw new Error(
    `ACCESS_PASS_AUTH_USER="${requestedUserId}" was not found in access-pass-users.local.json`,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


for (const user of users) {
  setup(`manual Microsoft passkey login  ${user.id}`, async ({ page }) => {
    fs.mkdirSync(authDir, { recursive: true });

    const auth = getAccessPassUserAuth(user);

    if (auth.exists) {
      console.log("Azure auth state already exists. Skipping manual passkey login.");
      console.log(`Saved storage state: ${auth.storageStateFile}`);
      console.log(`Saved session storage: ${auth.sessionStorageFile}`);
      return;
    }

    await page.goto(ACCESS_PASS_URL);

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
      - Confirm "Signed in as <UPN>" is visible.
      - Then click Resume in Playwright Inspector.
    */
    await page.pause();

    await page.waitForURL(/localhost:5173/, {
      timeout: 180_000,
    }).catch(() => {
      console.log("Page did not return to localhost yet.");
      console.log(`Current URL: ${page.url()}`);
    });

    if (!page.url().includes("accessPass.html")) {
      await page.goto(ACCESS_PASS_URL);
    }

    await expect(
      page.getByText(new RegExp(`signed in as ${escapeRegExp(user.email)}`, "i")).first(),
    ).toBeVisible({
      timeout: 120_000,
    });

    await page.context().storageState({ path: auth.storageStateFile });
    await saveSessionStorage(page, auth.sessionStorageFile);

    console.log(`Saved storage state: ${auth.storageStateFile}`);
    console.log(`Saved session storage: ${auth.sessionStorageFile}`);
  });
}