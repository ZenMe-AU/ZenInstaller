import {expect, test as setup,} from "@playwright/test";
import fs from "fs";
import {CORP_URL,} from "../../testInit";
import {authDir, corpGithubAuthStateExists, saveCorpSessionStorage, storageStateFile, sessionStorageFile} from "../setupHelper";

const pat = process.env.GITHUB_TOKEN;

setup("GitHub PAT login for corp auth tests", async ({page, context}) => {
	setup.skip(!pat,"No GITHUB_TOKEN found in web/.env file. Add a valid PAT to use this setup.",);
	fs.mkdirSync(authDir, {recursive: true,});

	if (corpGithubAuthStateExists()) {
		console.log("GitHub PAT auth storage state already exists. Skipping PAT setup.");
		console.log(`Storage state: ${storageStateFile}`);
        console.log(`Session storage: ${sessionStorageFile}`);
		return;
	}

	await page.goto(CORP_URL);
	const githubCard = page.locator("#card-github_login",);
	const introText = githubCard.getByText(/Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i,);

	if (!(await introText.isVisible())) {await githubCard.getByText(/^GitHub login$/i,).click();}
	await expect(introText,).toBeVisible();
	await githubCard.getByRole("button", {name: "Direct (PAT)", exact: true,},).click();
	const patInput = githubCard.getByPlaceholder("ghp_… or github_pat_…",);
	await expect(patInput,).toBeVisible();
	await patInput.fill(pat!,);
	await githubCard.getByRole("button", {name: "Connect with PAT", exact: true,},).click();
	await expect(githubCard.getByText(/Authenticated as/i,),).toBeVisible({timeout: 30_000,});

    // Need to save sessionStorage because Playwright storageState only saves cookies + localStorage
	await page.context().storageState({path: storageStateFile,});
    await saveCorpSessionStorage(context,);
	console.log(`Saved PAT auth storage state: ${storageStateFile}`);
	console.log(`Saved PAT auth session storage: ${sessionStorageFile}`);

});
