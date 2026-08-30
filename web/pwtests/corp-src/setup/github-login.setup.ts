import { expect, test as setup, } from "@playwright/test";
import fs from "fs";
import { CORP_URL, } from "../../testInit";
import { authDir, corpGithubAuthStateExists, storageStateFile, } from "../util/setupHelper";

setup("Manual GitHub OAuth login for corp auth tests", async ({ page, }) => {
	setup.skip(
		process.env.RUN_GITHUB_OAUTH_SETUP !== "true",
		"Set RUN_GITHUB_OAUTH_SETUP=true to run real GitHub OAuth setup.",
	);

	fs.mkdirSync(authDir, { recursive: true, });

	if (corpGithubAuthStateExists() && process.env.FORCE_GITHUB_OAUTH_SETUP !== "true") {
		console.log("GitHub OAuth storage state already exists. Skipping manual setup.");
		console.log(`Saved storage state: ${storageStateFile}`);
		return;
	}

	await page.goto(CORP_URL);

	const githubCard = page.locator("#card-github_login",);
	const loginButton = githubCard.getByRole("button", { name: "Login with GitHub", exact: true, });

	if (!(await loginButton.isVisible())) {
		await githubCard.getByText(/^GitHub login$/i,).click();
	}

	await expect(loginButton,).toBeVisible();
	await loginButton.click();

	/*
		Complete GitHub login manually in the opened flow.

		Important:
		- Finish any 2FA/passkey prompts.
		- Wait until redirected back to corp page.
		- Confirm authenticated card state is visible.
		- Then click Resume in Playwright Inspector.
	*/
	await page.pause();

	try {
		await page.waitForURL(/localhost:5173\/(?:[?#].*)?$/i, { timeout: 180_000, });
	} catch {
		console.log("Page did not return to corp page automatically.");
		console.log(`Current URL: ${page.url()}`);
		if (page.url().startsWith("http://localhost:5173")) {
			await page.goto(CORP_URL, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			}).catch(() => undefined);
		}
	}

	await expect(githubCard.getByText(/Authenticated as/i,),).toBeVisible({ timeout: 120_000, });

	await page.context().storageState({ path: storageStateFile, });
	console.log(`Saved storage state: ${storageStateFile}`);
});
