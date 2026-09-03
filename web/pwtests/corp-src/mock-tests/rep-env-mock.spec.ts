import { expect, test } from "@playwright/test";
import { corpGithubAuthStateExists, restoreGithubSessionStorage } from "../util/setupHelper";
import { CORP_URL, viewports, } from "../../testInit";
import { expandRepoCard, logMockAPI, expectCardSnapshot, sensitiveTextMasks } from "../util/testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Mock Tests - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1});
		
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
			await restoreGithubSessionStorage(context,);
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

		test("MOCK TEST - Selecting valid repo with no environments", async ({ page, }, testInfo) => {
			const validRepoName = "valid-repo-no-env";
			const validRepoId = 987654323;
			const repoListPattern = new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",);

			await page.route(repoListPattern, async (route) => {
				const ownerType = route.request().url().includes("/orgs/") ? "Organization" : "User";
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([{ id: validRepoId, name: validRepoName, owner: { type: ownerType, }, },]),
				});
			});

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${validRepoName}(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							id: validRepoId,
							name: validRepoName,
							template_repository: { full_name: "ZenMe-AU/ZBCorpArchitecture", },
						}),
					});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${validRepoName}/branches(?:\\?.*)?$`,),
				async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]", }); },
			);

			// mock valid repo but no environment 
			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${validRepoName}/environments(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ total_count: 0, environments: [], }),
					});
				},
			);

			const mockedReposLoaded = page.waitForResponse((response) => response.ok() && repoListPattern.test(response.url()),);
			await page.reload();
			await mockedReposLoaded;

			const repoCard = await expandRepoCard(page,);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });
			await repoInput.click();
			await page.getByRole("option", { name: validRepoName, }).click();

			await expect(repoInput).toHaveValue(validRepoName);
			await expect(repoCard.getByText("Valid", { exact: true, })).toBeVisible();
			await expect(repoCard.getByText("No environment found",)).toBeVisible();
			await expect(repoCard.getByRole("button", { name: "Clone Repository", })).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo, "valid-repo-no-env-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});
		});

		test("MOCK TEST - Creates PROD branch, then creates TEST from PROD", async ({ page, }, testInfo) => {
			const repoName = "mock-branch-test";
			const repoId = 987654324;
			const mainSha = "main-commit-sha";
			const prodSha = "prod-commit-sha";
			const repoListPattern = new RegExp("https://api\\.github\\.com/(?:user/repos|orgs/[^/]+/repos)(?:\\?.*)?$",);
			const createdBranches: Array<{ ref: string; sha: string }> = [];

			await page.route(repoListPattern, async (route) => {
				const ownerType = route.request().url().includes("/orgs/") ? "Organization" : "User";
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([{ id: repoId, name: repoName, owner: { type: ownerType, }, },]),
				});
			});

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${repoName}(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							id: repoId,
							name: repoName,
							template_repository: { full_name: "ZenMe-AU/ZBCorpArchitecture", },
						}),
					});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${repoName}/branches(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify([{ name: "main", commit: { sha: mainSha, }, protected: true, },]),
					});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${repoName}/environments(?:\\?.*)?$`,),
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							total_count: 2,
							environments: [
								{ name: "PROD", id: 1001, url: `https://api.github.com/repos/mock-owner/${repoName}/environments/PROD`, },
								{ name: "TEST", id: 1002, url: `https://api.github.com/repos/mock-owner/${repoName}/environments/TEST`, },
							],
						}),
					});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${repoName}/git/ref/heads/(?:main|PROD)(?:\\?.*)?$`,),
				async (route) => {
					const sourceSha = route.request().url().includes("/heads/PROD") ? prodSha : mainSha;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ object: { sha: sourceSha, }, }),
					});
				},
			);

			await page.route(new RegExp(`https://api\\.github\\.com/repos/[^/]+/${repoName}/git/refs(?:\\?.*)?$`,),
				async (route) => {
					createdBranches.push(route.request().postDataJSON() as { ref: string; sha: string });
					await route.fulfill({ status: 201, contentType: "application/json", body: "{}", });
				},
			);

			const mockedReposLoaded = page.waitForResponse((response) => response.ok() && repoListPattern.test(response.url()),);
			await page.reload();
			await mockedReposLoaded;

			const repoCard = await expandRepoCard(page,);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });
			await repoInput.click();
			await page.getByRole("option", { name: repoName, }).click();
			await expect(repoCard.getByText("Valid", { exact: true, })).toBeVisible();

			await repoCard.getByText("PROD", { exact: true, }).click();
			const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
			await expect(createProdButton).toBeVisible();
			await createProdButton.click();
			await expect.poll(() => createdBranches,).toEqual([{ ref: "refs/heads/PROD", sha: mainSha, },]);
			await expect(createProdButton).toBeHidden();

			await expectCardSnapshot(page, repoCard, testInfo, "prod-branch-created-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});

			await repoCard.getByText("TEST", { exact: true, }).click();
			const createTestButton = repoCard.getByRole("button", { name: "Create New Branch: TEST", });
			await expect(createTestButton).toBeVisible();
			const sourceBranchSelect = createTestButton.locator("..").getByRole("combobox",);
			await sourceBranchSelect.click();
			await page.getByRole("option", { name: "PROD", exact: true, }).click();
			await expect(sourceBranchSelect).toHaveText(/PROD/);

			await expectCardSnapshot(page, repoCard, testInfo, "prod-branch-visible-mock.png",
				{
					userId: "github-pat",
					viewportName,
					testFolder: "Repository and Environment Authenticated",
					mask: sensitiveTextMasks(repoCard,),
				});

			await createTestButton.click();

			await expect.poll(() => createdBranches,).toEqual([
				{ ref: "refs/heads/PROD", sha: mainSha, },
				{ ref: "refs/heads/TEST", sha: prodSha, },
			]);
			await expect(createTestButton).toBeHidden();
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/),).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo, "test-branch-created-mock.png",
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
			await expect(repoCard.getByText("Not a clone")).toBeVisible();
			await expect(repoCard.getByText("This repo is not a clone of the template. Only repos cloned from ZenMe-AU/ZBCorpArchitecture can be used.")).toBeVisible();
			await expect(repoCard.getByText("No environment found.")).toBeVisible();

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



