import { expect, test} from "@playwright/test";
import { corpGithubAuthStateExists, restoreCorpSessionStorage, storageStateFile, } from "../setupHelper";
import { CORP_URL, viewports, } from "../../testInit";
import { expandRepoCard, chooseRepoOption, logMockAPI, expectVisibleWithin, expectCardSnapshot, sensitiveTextMasks } from "../testHelper";

//TODO: testing valid repo but no environment variables
//TODO: testing creating branch with non-existant and existing branches
//TODO: testing case-sensitivity 
//TODO: testing different API status codes (e.g. scenario for login expire)
//TODO: test if repo already exists

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Live Tests - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1, storageState: storageStateFile, });
		test.skip(!corpGithubAuthStateExists(), "Run pwtests/corp-src/setup/github-pat-login.setup.ts first.",);
		test.skip(process.env.TEST_MODE !== "live", "Set TEST_MODE=true to run live tests.",);

		test.beforeEach(async ({ page, context, }) => {
			await restoreCorpSessionStorage(context,);
			await page.goto(CORP_URL);
		});

		test("Renders Repo-env Card after Github Auth", async ({ page, }, testInfo) => {
			const repoCard = await expandRepoCard(page,);
			await expect(repoCard.getByRole("combobox", { name: "Select or type repo name...", },)).toBeVisible();
			await expect(repoCard.getByText(/^Repository & environment$/i,)).toBeVisible();
			await expect(repoCard.getByText(/Select the GitHub location and type the name of the repository/i,)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "card-rendered.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				},
			);
		});

		test("LIVE TEST - Typing new repo name in the textbox", async ({ page, }, testInfo) => {
			const reponame = "live-test";
			const repoCard = await expandRepoCard(page);
			await chooseRepoOption(page, repoCard, reponame);
			await expectCardSnapshot(page, repoCard, testInfo, "typed-repo-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				}
			);
		});

		test("LIVE TEST - Cloning a new repo for both PROD and TEST", async ({ page, }, testInfo) => {
			const reponame = `live-test7-${viewportName}`;
			const repoCard = await expandRepoCard(page);
			await chooseRepoOption(page, repoCard, reponame);

			const cloneRepoButton = repoCard.getByRole('button', { name: 'Clone Repository' })
			await expect(cloneRepoButton).toBeVisible();
			await cloneRepoButton.click();
			await expectVisibleWithin(repoCard.getByText('Pick the environment to configure.'), "Text: Pick the environment to configure", 500000);
			const PROD = repoCard.getByText("PROD", { exact: true });
			const TEST = repoCard.getByText("TEST", { exact: true });
			await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
			await expect(PROD).toBeVisible();
			await expect(TEST).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "clone-env-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});

			await PROD.click();
			await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "PROD-clone-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});

			await TEST.click();
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/)).toBeVisible();
			const branchOptions = repoCard.getByRole("combobox", { name: "Select or type repo name...", });
			await branchOptions.click();

			await expectCardSnapshot(page, repoCard, testInfo, "TEST-clone-live.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});
		});
	});
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Mock Tests - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1, storageState: storageStateFile, });
		test.skip(!corpGithubAuthStateExists(), "Run pwtests/corp-src/setup/github-pat-login.setup.ts first.",);
		test.skip(process.env.TEST_MODE !== "mock", "Set TEST_MODE=mock to run mock tests.",);

		test.beforeEach(async ({ page, context, }) => {
			// blocks unexpected POST requests (supposed to be mocked)
			await page.route("https://api.github.com/**", async (route) => {
				const request = route.request();
				if (["GET", "HEAD", "OPTIONS"].includes(request.method())) {
					await route.continue();
					return;
				}
				console.info(`Blocked unexpected GitHub write: ${request.method()} ${request.url()}`,);
				await route.abort("blockedbyclient");
			});
			await restoreCorpSessionStorage(context,);
			await page.goto(CORP_URL);
		});

		test("SAFETY CHECK - blocks unexpected GitHub writes", async ({ page }) => {
			await expect(page.evaluate(async () => {
				await fetch("https://api.github.com/repos/nonexistant-repo/nonexistant", { method: "DELETE" },);
			}),).rejects.toThrow("Failed to fetch");
		});

		test("SAFETY CHECK - permits GitHub reads", async ({ page }) => {
			await page.route("https://api.github.com/rate_limit", (route) => route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ resources: {} }),
				}),
			);
			const response = await page.evaluate(() => fetch("https://api.github.com/rate_limit").then((result) => result.status),);
			expect(response).toBe(200);
		});

		test("MOCK TEST - Cloning a new repo for both PROD and TEST", async ({ page, }, testInfo) => {
			const newRepoName = "mock-clone-test";
			const newRepoId = 987654322;
			const environments = [
				{ name: "PROD", id: 1001, url: `https://api.github.com/repos/mock-owner/${newRepoName}/environments/PROD`, },
				{ name: "TEST", id: 1002, url: `https://api.github.com/repos/mock-owner/${newRepoName}/environments/TEST`, },
			];

			await page.route(new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",),
				async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]", }); },
			);

			await page.route(new RegExp("https://api\\.github\\.com/repos/ZenMe-AU/ZBCorpArchitecture/generate(?:\\?.*)?$",),
				async (route) => {
					expect(route.request().postDataJSON()).toMatchObject({
						name: newRepoName,
						private: true,
						include_all_branches: false,
					});
					await logMockAPI(page, route, 201, { id: newRepoId, name: newRepoName, });
					await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: newRepoId, name: newRepoName, }), });
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}/environments/(?:PROD|TEST)(?:\\?.*)?$`,),
				async (route) => {
					await logMockAPI(page, route, 200, {});
					await route.fulfill({ status: 200, contentType: "application/json", body: "{}", });
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}/environments(?:\\?.*)?$`,),
				async (route) => {
					const body = { total_count: environments.length, environments, };
					await logMockAPI(page, route, 200, body);
					await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), });
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}/branches(?:\\?.*)?$`,),
				async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]", }); },
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${newRepoName}(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							id: newRepoId,
							name: newRepoName,
							template_repository: { full_name: "ZenMe-AU/ZBCorpArchitecture", },
						}),
					});
				},
			);

			const mockedReposLoaded = page.waitForResponse((response) => response.ok()
				&& new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",).test(response.url()),);
			await page.reload();
			await mockedReposLoaded;

			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });
			await repoInput.fill(newRepoName);
			const cloneOption = page.getByRole("option", { name: `Clone as “${newRepoName}”`, });
			await expect(cloneOption).toBeVisible();
			await cloneOption.click();
			const cloneRepoButton = repoCard.getByRole("button", { name: "Clone Repository", });
			await expect(cloneRepoButton).toBeVisible();
			await cloneRepoButton.click();

			const PROD = repoCard.getByText("PROD", { exact: true, });
			const TEST = repoCard.getByText("TEST", { exact: true, });
			await expect(repoCard.getByText("Loading environments...", { exact: true, })).toBeHidden();
			await expect(PROD).toBeVisible();
			await expect(TEST).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "clone-env-mock.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(repoCard,),
			});

			await PROD.click();
			await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "PROD-clone-mock.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(repoCard,),
			});

			await TEST.click();
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/)).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "TEST-clone-mock.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(repoCard,),
			});
		});

		test("MOCK TEST - Typing new repo name in the textbox", async ({ page, }, testInfo) => {
			const newRepoName = "mock-test";
			await page.route(new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",),
				async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]", }); },);

			const mockedReposLoaded = page.waitForResponse((response) => response.ok()
				&& new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",).test(response.url()),);
			await page.reload();
			await mockedReposLoaded;

			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });
			await repoInput.click();
			await repoInput.fill(newRepoName);
			const cloneOption = page.getByRole("option", { name: `Clone as “${newRepoName}”`, });
			await expect(cloneOption).toBeVisible();
			await cloneOption.click();

			await expect(cloneOption).toBeHidden();
			await expect(repoInput).toHaveValue(newRepoName);
			await expect(repoInput).toHaveAttribute("aria-expanded", "false");
			await expect(repoCard.getByText(/^Clone from template$/i),).toBeVisible();
			await expect(repoCard.getByRole("button", { name: "Clone Repository" }),).toBeVisible();
			await expect(repoCard.getByRole("switch", { name: "Private" }),).toBeChecked();
			await expect(repoCard.getByRole("switch", { name: "Clone all branches" }),).not.toBeChecked();
			await expect(repoCard.getByRole("switch", { name: "Create environments" }),).toBeChecked();
			await expect(repoCard.getByText(/Pick the environment to configure/i),).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo, "typed-repo-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});
		});

		test("MOCK TEST - Selecting repo not a clone of source repo", async ({ page, }, testInfo) => {
			const invalidRepoName = "playwright-invalid-template-repo";
			const invalidRepoId = 987654321;

			// Mock the repository list for either a user or organisation account.
			await page.route(new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",),
				async (route) => {
					const ownerType = route.request().url().includes("/orgs/") ? "Organization" : "User";
					const mockResponseData = JSON.stringify([{ id: invalidRepoId, name: invalidRepoName, owner: { type: ownerType, }, },]);
					logMockAPI(page, route, 200, mockResponseData);
					await route.fulfill({ status: 200, contentType: "application/json", body: mockResponseData, });
				},
			);

			// The repository exists, but it was not created from the required template.
			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${invalidRepoName}(?:\\?.*)?$`,),
				async (route) => {
					const mockResponseData = JSON.stringify([{ id: invalidRepoId, name: invalidRepoName, owner: { type: "User", }, },]);
					logMockAPI(page, route, 200, mockResponseData);
					await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: invalidRepoId, name: invalidRepoName, template_repository: null, }), });
				},
			);

			// Start waiting before reloading so the mocked response is not missed.
			const mockedReposLoaded = page.waitForResponse((response) => response.ok()
				&& new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",).test(response.url()),);
			await page.reload();
			await mockedReposLoaded;
			const repoCard = await expandRepoCard(page);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", })
			await repoInput.click();
			const invalidRepoOption = page.getByRole("option", { name: invalidRepoName, });
			await expect(invalidRepoOption).toBeVisible();
			await invalidRepoOption.click();
			await expect(repoInput).toHaveValue(invalidRepoName);
			await expect(repoInput).toHaveAttribute("aria-expanded", "false");
			await expect(repoCard.getByText("Not a clone", { exact: true })).toBeVisible();
			await expect(repoCard.getByText("This repo is not a clone of the template. Only repos cloned from ZenMe-AU/ZBCorpArchitecture can be used.")).toBeVisible();
			await expect(repoCard.getByText("No environment found.", { exact: true })).toBeVisible();

			await expectCardSnapshot(page, repoCard, testInfo, "invalid-repo-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});
		});
	});
}



