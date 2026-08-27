/// <reference types="node" />

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const authDir = path.join(currentDirectory, "../.auth");
export const storageStateFile = path.join(authDir, "github-pat.storage.json");
export const sessionStorageFile = path.join(authDir, "github-pat.session.json");
export const azureStorageStateFile = path.join(authDir, "azure-login.storage.json");
export const azureSessionStorageFile = path.join(authDir, "azure-login.session.json");

export function corpGithubAuthStateExists() {
	return (fs.existsSync(storageStateFile) && fs.existsSync(sessionStorageFile));
}

export function corpAzureAuthStateExists() {
	return (fs.existsSync(azureStorageStateFile) && fs.existsSync(azureSessionStorageFile));
}

async function saveSessionStorageTo(context: BrowserContext, targetFile: string,) {
	const pages = context.pages();
	const page = pages[0];

	if (!page) { throw new Error("Cannot save Corp session storage because no page exists.",); }

	const sessionStorageData = await page.evaluate(() => {
		return Object.fromEntries(
			Array.from({ length: sessionStorage.length }, (_, index) => {
				const key = sessionStorage.key(index);
				return key ? [key, sessionStorage.getItem(key) ?? "",] : null;
			},
			).filter((entry): entry is [string, string] => entry !== null,),
		);
	});
	fs.writeFileSync(targetFile, JSON.stringify(sessionStorageData, null, 2,),);
}

async function restoreSessionStorageFrom(context: BrowserContext, sourceFile: string,) {
	if (!fs.existsSync(sourceFile)) { throw new Error(`Missing Corp session storage: ${sourceFile}`,); }

	const sessionStorageData = JSON.parse(fs.readFileSync(sourceFile, "utf-8",),) as Record<string, string>;
	await context.addInitScript(({ storage }) => {
		for (const [key, value,] of Object.entries(storage)) { window.sessionStorage.setItem(key, value,); }
	},
		{ storage: sessionStorageData, },
	);
}

export async function saveCorpSessionStorage(context: BrowserContext,) {
	await saveSessionStorageTo(context, sessionStorageFile,);
}

export async function restoreCorpSessionStorage(context: BrowserContext,) {
	await restoreSessionStorageFrom(context, sessionStorageFile,);
}

export async function saveCorpAzureSessionStorage(context: BrowserContext,) {
	await saveSessionStorageTo(context, azureSessionStorageFile,);
}

export async function restoreCorpAzureSessionStorage(context: BrowserContext,) {
	await restoreSessionStorageFrom(context, azureSessionStorageFile,);
}