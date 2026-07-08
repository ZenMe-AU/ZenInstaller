/// <reference types="node" />
import fs from "fs";
import path from "path";
import type { Page } from "@playwright/test";

export const authDir = path.join(process.cwd(), "playwright-tests/.auth");

export const storageStateFile = path.join(
  authDir,
  "azure-access-pass-user.json",
);

export const sessionStorageFile = path.join(
  authDir,
  "azure-session-storage.json",
);

export async function saveSessionStorage(page: Page) {
  fs.mkdirSync(authDir, { recursive: true });

  const sessionStorageData = await page.evaluate(() => {
    return Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index)!;
        return [key, sessionStorage.getItem(key)];
      }),
    );
  });

  fs.writeFileSync(
    sessionStorageFile,
    JSON.stringify(sessionStorageData, null, 2),
  );
}

export async function restoreSessionStorage(page: Page) {
  if (!fs.existsSync(sessionStorageFile)) {
    throw new Error(
      `Missing session storage file: ${sessionStorageFile}. Run azure-passkey.setup.ts first.`,
    );
  }

  const sessionStorageData = JSON.parse(
    fs.readFileSync(sessionStorageFile, "utf-8"),
  ) as Record<string, string>;

  await page.addInitScript((data) => {
    for (const [key, value] of Object.entries(data)) {
      window.sessionStorage.setItem(key, value);
    }
  }, sessionStorageData);
}