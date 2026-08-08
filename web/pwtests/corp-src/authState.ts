/// <reference types="node" />

import fs from "fs";
import path from "path";
import type { BrowserContext } from "@playwright/test";

export const authDir = path.join(process.cwd(), "web/pwtests/corp-src/auth/.auth");
export const storageStateFile = path.join(authDir, "github-pat.storage.json");
export const sessionStorageFile = path.join(authDir, "github-pat.session.json");


export function corpGithubAuthStateExists() {
	return (fs.existsSync(storageStateFile) && fs.existsSync(sessionStorageFile));
}

export function loadGithubPatFromLocalSettings(): string | null {
	const settingsPath = path.join(process.cwd(), "backend/local.settings.json");
	
	try {
		const raw = fs.readFileSync(settingsPath, "utf-8");
		const token = (JSON.parse(raw) as {Values?: {GITHUB_TOKEN?: string}})?.Values?.GITHUB_TOKEN;
		return typeof token === "string" && token.length > 0 ? token : null;
	} catch {
		return null;
	}
}

export async function saveCorpSessionStorage(context: BrowserContext,) {
	const pages = context.pages();
	const page = pages[0];

	if (!page) {
		throw new Error("Cannot save Corp session storage because no page exists.",);
	}

	const sessionStorageData = await page.evaluate(() => {
		return Object.fromEntries(
			Array.from(
				{length: sessionStorage.length},
				(_, index) => {
					const key = sessionStorage.key(index);

					return key ? [key,sessionStorage.getItem(key) ?? "",] : null;},
			).filter(
				(entry): entry is [string, string] => entry !== null,
			),
		);
	});

	fs.writeFileSync(sessionStorageFile, JSON.stringify(sessionStorageData, null,2,),);
}

export async function restoreCorpSessionStorage(context: BrowserContext,) {
	if (!fs.existsSync(sessionStorageFile)) {
		throw new Error(`Missing Corp GitHub session storage: ${sessionStorageFile}`,);
	}

	const sessionStorageData = JSON.parse(fs.readFileSync(sessionStorageFile,"utf-8",),) as Record<string, string>;

	await context.addInitScript(({storage}) => {
			for (const [key,value,] of Object.entries(storage)) {
				window.sessionStorage.setItem(key,value,);
			}
		},
		{ storage:sessionStorageData,},
	);
}
