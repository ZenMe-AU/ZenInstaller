import {expect, test, type Page, type Route} from "@playwright/test";
import {corpGithubAuthStateExists, restoreCorpSessionStorage, storageStateFile,} from "../setupHelper";
import {CORP_URL, viewports,} from "../../testInit";
import {expectCardSnapshot, sensitiveTextMasks} from "../testHelper";

const isDebugEnabled = process.env.DEBUG?.includes('pw:api') || process.env.NODE_ENV === 'development';

async function expandRepoCard(page: Page,) {
	const repoCard = page.locator("#card-repo",);
	const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",},);

	if (!(await repoInput.isVisible())) {
		await repoCard.getByText(/^Repository & environment$/i,).click();
	}

	await expect(repoInput).toBeVisible();
	return repoCard;
}

async function logMockAPI(page: Page, route: Route, status: number, body: unknown) {
	const message = `Mock Route Method : ${route.request().method()} , URL : ${route.request().url()} | Fulfilled with ${status} | Body: ${body}`;
	if (isDebugEnabled) {console.log(message)}
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Rep-env Card - ${viewportName}`, () => {
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

		test("Renders Repo-env Card after Github Auth", async ({page,}, testInfo) => {
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
			const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",});
			await repoInput.click();
			await repoInput.fill("live-test");
			const cloneOption = page.getByRole("option", {name: `Clone as “live-test”`,});
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
		
		test("LIVE TEST - Cloning a new repo for both PROD and TEST", async({page, }, testInfo) => {
			test.skip(process.env.TEST_MODE !== "live","Set TEST_MODE=true to run live tests.",);

			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",});
			await repoInput.click();
			await repoInput.fill("live-test");
			const cloneOption = page.getByRole("option", {name: `Clone as “live-test”`,});
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

			const cloneRepoButton = repoCard.getByRole('button', { name: 'Clone Repository' })
			await expect(cloneRepoButton).toBeVisible();
			await cloneRepoButton.click();
			await expect(repoCard.getByText('Pick the environment to configure.')).toBeVisible();
			const PROD = repoCard.getByText("PROD", {exact: true});
			const TEST = repoCard.getByText("TEST", {exact: true});
			await expect(repoCard.getByText("Loading environments...", {exact: true})).toBeHidden();
			await expect(PROD).toBeVisible();
			await expect(TEST).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo,"clone-env-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
			});

			await PROD.click();
			await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo,"PROD-clone-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
			});

			await TEST.click();
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/)).toBeVisible();
			const branchOptions = repoCard.getByRole("combobox", {name: "Select or type repo name...",});
			await branchOptions.click();

			await expectCardSnapshot(page, repoCard, testInfo,"TEST-clone-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(page,),
			});

		});

		test("MOCK TEST - Cloning a new repo for both PROD and TEST", async ({page,}, testInfo) => {
			test.skip(process.env.TEST_MODE !== "mock", "Set TEST_MODE=mock to run mock tests.",);

			const newRepoName = "mock-clone-test";
			const newRepoId = 987654322;
			const environments = [
				{name: "PROD", id: 1001, url: `https://api.github.com/repos/mock-owner/${newRepoName}/environments/PROD`,},
				{name: "TEST", id: 1002, url: `https://api.github.com/repos/mock-owner/${newRepoName}/environments/TEST`,},
			];

			await page.route(/https:\/\/api\.github\.com\/(?:user\/repos|orgs\/[^/]+\/repos)(?:\?.*)?$/,
				async (route) => {await route.fulfill({status: 200, contentType: "application/json", body: "[]",});},
			);

			await page.route(/https:\/\/api\.github\.com\/repos\/ZenMe-AU\/ZBCorpArchitecture\/generate(?:\?.*)?$/,
				async (route) => {
					expect(route.request().postDataJSON()).toMatchObject({
						name: newRepoName,
						private: true,
						include_all_branches: false,
					});
					await logMockAPI(page, route, 201, {id: newRepoId, name: newRepoName,});
					await route.fulfill({status: 201, contentType: "application/json", body: JSON.stringify({id: newRepoId, name: newRepoName,}),});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}/environments/(?:PROD|TEST)(?:\\?.*)?$`,),
				async (route) => {
					await logMockAPI(page, route, 200, {});
					await route.fulfill({status: 200, contentType: "application/json", body: "{}",});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}/environments(?:\\?.*)?$`,),
				async (route) => {
					const body = {total_count: environments.length, environments,};
					await logMockAPI(page, route, 200, body);
					await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body),});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}/branches(?:\\?.*)?$`,),
				async (route) => {await route.fulfill({status: 200, contentType: "application/json", body: "[]",});},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							id: newRepoId,
							name: newRepoName,
							template_repository: {full_name: "ZenMe-AU/ZBCorpArchitecture",},
						}),
					});
				},
			);

			const mockedReposLoaded = page.waitForResponse((response) => response.ok() && (response.url().includes("/user/repos") || /\/orgs\/[^/]+\/repos/.test(response.url())),);
			await page.reload();
			await mockedReposLoaded;

			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", {name: "Select or type repo name...",});
			await repoInput.fill(newRepoName);
			const cloneOption = page.getByRole("option", {name: `Clone as “${newRepoName}”`,});
			await expect(cloneOption).toBeVisible();
			await cloneOption.click();

			const cloneRepoButton = repoCard.getByRole("button", {name: "Clone Repository",});
			await expect(cloneRepoButton).toBeVisible();
			await cloneRepoButton.click();

			const prod = repoCard.getByText("PROD", {exact: true,});
			const testEnv = repoCard.getByText("TEST", {exact: true,});
			await expect(repoCard.getByText("Loading environments...", {exact: true,})).toBeHidden();
			await expect(prod).toBeVisible();
			await expect(testEnv).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "clone-env-mock.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(page,),
			});

			await prod.click();
			await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "PROD-clone-mock.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(page,),
			});

			await testEnv.click();
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "TEST-clone-mock.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(page,),
			});
		});

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

			const invalidRepoName = "playwright-invalid-template-repo";
			const invalidRepoId = 987654321;

			// Mock the repository list for either a user or organisation account.
			await page.route(/https:\/\/api\.github\.com\/(?:user\/repos|orgs\/[^/]+\/repos)(?:\?.*)?$/,
				async (route) => { 
					const ownerType = route.request().url().includes("/orgs/") ? "Organization" : "User";
					const mockResponseData = JSON.stringify([{id: invalidRepoId,name: invalidRepoName,owner: {type: ownerType,},},]);
					logMockAPI(page, route, 200, mockResponseData);
					await route.fulfill({status: 200,contentType: "application/json",body: mockResponseData,});
				},
			);

			// The repository exists, but it was not created from the required template.
			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${invalidRepoName}(?:\\?.*)?$`,),
				async (route) => {
					const mockResponseData = JSON.stringify([{id: invalidRepoId,name: invalidRepoName,owner: {type: "User",},},]);
					logMockAPI(page, route, 200, mockResponseData);				
					await route.fulfill({status: 200,contentType: "application/json",body: JSON.stringify({id: invalidRepoId,name: invalidRepoName,template_repository: null,}),});
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

