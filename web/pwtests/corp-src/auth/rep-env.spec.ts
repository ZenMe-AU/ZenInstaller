import {expect, test, type Page,} from "@playwright/test";
import {corpGithubAuthStateExists, restoreCorpSessionStorage, storageStateFile,} from "../setupHelper";
import {CORP_URL, viewports,} from "../../testInit";
import {expectCardSnapshot, sensitiveTextMasks} from "../testHelper";

async function expandRepoCard(page: Page,) {
	const repoCard = page.locator("#card-repo",);
	const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",},);

	if (!(await repoInput.isVisible())) {
		await repoCard.getByText(/^Repository & environment$/i,).click();
	}

	await expect(repoInput).toBeVisible();
	return repoCard;
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Corp-${viewportName} - Repository & environment`, () => {
		test.use({viewport, deviceScaleFactor: 1, storageState: storageStateFile,});
		test.skip(!corpGithubAuthStateExists(),"Run pwtests/corp-src/setup/github-pat-login.setup.ts first.",);

		test.beforeEach(async ({page, context,}) => {
			await restoreCorpSessionStorage(context,);
			const repositoriesLoaded = page.waitForResponse((response) => {const url = response.url();
			return (response.ok() &&url.startsWith("https://api.github.com/") && (url.includes("/user/repos") ||/\/orgs\/[^/]+\/repos/.test(url)));},
			{timeout: 30_000},);
			await page.goto(CORP_URL);
			await repositoriesLoaded;
		});

		test("Renders Repo & Env Card after Github Auth", async ({page,}, testInfo) => {
			const repoCard = await expandRepoCard(page,);
			await expect(repoCard.getByRole("combobox", {name: "Select or type repo name...",},)).toBeVisible();
			await expect(repoCard.getByText(/^Repository & environment$/i,)).toBeVisible();
			await expect(repoCard.getByText(/Select the GitHub location and type the name of the repository/i,)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo,"card-rendered.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
				},
			);
		});

		test("LIVE TEST - Typing new repo name in the textbox", async ({page,}, testInfo) => {
			test.skip(process.env.TEST_MODE !== "live","Set TEST_MODE=true to run live tests.",);

			const repoCard = await expandRepoCard(page);
			const repoInput = page.getByRole("combobox", {name: "Select or type repo name...",});
			await repoInput.click();
			await repoInput.fill("live-test");
			const cloneOption = page.getByRole("option", {name: "Clone as “zeninstaller-",});
			await expect(cloneOption).toBeVisible();
			await cloneOption.click();
			// Confirm the option click changed the application's state.
			await expect(cloneOption).toBeHidden();
			await expect(repoInput).toHaveAttribute("aria-expanded", "false");
			await expect(repoCard.getByText(/^Clone from template$/i),).toBeVisible();
			await expect(repoCard.getByRole("button", {name: "Clone Repository"}),).toBeVisible();
			await expect(repoCard.getByRole("switch", {name: "Private"}),).toBeChecked();
			await expect(repoCard.getByRole("switch", {name: "Clone all branches"}),).not.toBeChecked();
			await expect(repoCard.getByRole("switch", {name: "Create environments"}),).toBeChecked();
			await expect(repoCard.getByText(/Pick the environment to configure/i),).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo,"typed-repo-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
				}
			);
		});
		
		// test("LIVE TEST - Cloning a new repo", async({page, }, testInfo) => {
		// 	test.skip(process.env.TEST_MODE !== "live","Set TEST_MODE=true to run live tests.",);

		// 	test.skip(process.env.TEST_MODE !== "live","Set TEST_MODE=true to run live tests.",);

		// 	const repoCard = await expandRepoCard(page);
		// 	const repoInput = page.getByRole("combobox", {name: "Select or type repo name...",});
		// 	await repoInput.click();
		// 	await repoInput.fill("live-test");
		// 	const cloneOption = page.getByRole("option", {name: "Clone as “zeninstaller-",});
		// 	await expect(cloneOption).toBeVisible();
		// 	await cloneOption.click();
		// 	// Confirm the option click changed the application's state.
		// 	await expect(cloneOption).toBeHidden();
		// 	await expect(repoInput).toHaveAttribute("aria-expanded", "false");
		// 	await expect(repoCard.getByText(/^Clone from template$/i),).toBeVisible();
		// 	await expect(repoCard.getByRole("button", {name: "Clone Repository"}),).toBeVisible();
		// 	await expect(repoCard.getByRole("switch", {name: "Private"}),).toBeChecked();
		// 	await expect(repoCard.getByRole("switch", {name: "Clone all branches"}),).not.toBeChecked();
		// 	await expect(repoCard.getByRole("switch", {name: "Create environments"}),).toBeChecked();
		// 	await expect(repoCard.getByText(/Pick the environment to configure/i),).toHaveCount(0);



		// });

		test("MOCK TEST - Typing new repo name in the textbox", async ({page,}, testInfo) => {
			test.skip(process.env.TEST_MODE !== "mock","Set TEST_MODE=mock to run mock tests.",)

			const newRepoName = "mock-test";
			await page.route(/https:\/\/api\.github\.com\/(?:user\/repos|orgs\/[^/]+\/repos)(?:\?.*)?$/,
				async (route) => {await route.fulfill({status: 200, contentType: "application/json", body: "[]",});},);

			const mockedReposLoaded = page.waitForResponse((response) =>response.ok() &&(response.url().includes("/user/repos") || /\/orgs\/[^/]+\/repos/.test(response.url())),);
			await page.reload();
			await mockedReposLoaded;

			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",});
			await repoInput.click();
			await repoInput.fill(newRepoName);
			const cloneOption = page.getByRole("option", {name: `Clone as “${newRepoName}”`,});
			await expect(cloneOption).toBeVisible();
			await cloneOption.click();

			await expect(cloneOption).toBeHidden();
			await expect(repoInput).toHaveValue(newRepoName);
			await expect(repoInput).toHaveAttribute("aria-expanded", "false");
			await expect(repoCard.getByText(/^Clone from template$/i),).toBeVisible();
			await expect(repoCard.getByRole("button", {name: "Clone Repository"}),).toBeVisible();
			await expect(repoCard.getByRole("switch", {name: "Private"}),).toBeChecked();
			await expect(repoCard.getByRole("switch", {name: "Clone all branches"}),).not.toBeChecked();
			await expect(repoCard.getByRole("switch", {name: "Create environments"}),).toBeChecked();
			await expect(repoCard.getByText(/Pick the environment to configure/i),).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo,"typed-repo-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
				});
			});

		test("MOCK TEST - Selecting repo not a clone of source repo", async ({page,}, testInfo) => {	
			test.skip(process.env.TEST_MODE !== "mock","Set TEST_MODE=mock to run mock tests.",)

			const isDebugEnabled = process.env.DEBUG?.includes('pw:api') || process.env.NODE_ENV === 'development';
			const invalidRepoName = "playwright-invalid-template-repo";
			const invalidRepoId = 987654321;

			// Mock the repository list for either a user or organisation account.
			await page.route(/https:\/\/api\.github\.com\/(?:user\/repos|orgs\/[^/]+\/repos)(?:\?.*)?$/,
				async (route) => { 
					const ownerType = route.request().url().includes("/orgs/") ? "Organization" : "User";
					const mockResponseData = JSON.stringify([{id: invalidRepoId,name: invalidRepoName,owner: {type: ownerType,},},]);
					if (isDebugEnabled) {console.log(`Mock Route Method : ${route.request().method()} , URL : ${route.request().url()} | Fulfilled with 200 OK | Body: ${mockResponseData}`);}
					await route.fulfill({status: 200,contentType: "application/json",body: mockResponseData,});
				},
			);

			// The repository exists, but it was not created from the required template.
			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${invalidRepoName}(?:\\?.*)?$`,),
				async (route) => {
					const mockResponseData = JSON.stringify([{id: invalidRepoId,name: invalidRepoName,owner: {type: "User",},},]);
					if (isDebugEnabled) {console.log(`Mock Route Method : ${route.request().method()} , URL : ${route.request().url()} | Fulfilled with 200 OK | Body: ${mockResponseData}`);}
					await route.fulfill({status: 200,contentType: "application/json",body: JSON.stringify({
							id: invalidRepoId,name: invalidRepoName,template_repository: null,}),});
				},
			);

			// Start waiting before reloading so the mocked response is not missed.
			const mockedReposLoaded = page.waitForResponse((response) => {return (response.ok() &&(response.url().includes("/user/repos") || /\/orgs\/[^/]+\/repos/.test(response.url())));});
			await page.reload();
			await mockedReposLoaded;
			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",})
			await repoInput.click();
			const invalidRepoOption = page.getByRole("option", {name: invalidRepoName,});
			await expect(invalidRepoOption).toBeVisible();
			await invalidRepoOption.click();
			await expect(repoInput).toHaveValue(invalidRepoName);
			await expect(repoInput).toHaveAttribute("aria-expanded", "false");
			await expect(repoCard.getByText("Not a clone", {exact: true})).toBeVisible();
			await expect(repoCard.getByText("This repo is not a clone of the template. Only repos cloned from ZenMe-AU/ZBCorpArchitecture can be used.")).toBeVisible();
			await expect(repoCard.getByText("No environment found.", {exact: true})).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo,"invalid-repo-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
			});
		})
	
	});

}

