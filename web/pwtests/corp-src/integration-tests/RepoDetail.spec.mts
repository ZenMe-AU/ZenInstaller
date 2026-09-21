import { expect, test } from "../../coverage/fixture";
import { restoreGithubSessionStorage } from "../util/setupHelper.mts";
import { CORP_URL, viewports, } from "../../testInit";
import { expandRepoCard, chooseRepoOption, expectVisibleWithin, expectSnapshot, safePathSegment } from "../util/testHelper.mts";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`RepoDetail Integrated - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1});

		test("Happy path", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);			
			const repoName = safePathSegment(`RepoDetail-${viewportName}`,);
			await restoreGithubSessionStorage(context);
			await page.goto(CORP_URL);
			
			const repoCard = await test.step("Expand RepoDetail Card", async () => {
				const repoCard = await expandRepoCard(page);
				return repoCard;
			});

			await test.step("Selecting or creating the repository", async () => {
				await expectSnapshot(page, repoCard, testInfo, "start", viewportName);	
				const repoSelection = await chooseRepoOption(page, repoCard, repoName, { reuseExisting: true, });

				if (repoSelection === "new") {
					const cloneRepoButton = repoCard.getByRole("button", { name: "Clone Repository" });
					await expect(cloneRepoButton).toBeVisible();
					await expectSnapshot(page, repoCard, testInfo, "typed-repo", viewportName);
					await cloneRepoButton.click();
					await expectVisibleWithin(repoCard.getByText("Pick the environment to configure."), "Text: Pick the environment to configure", 500_000);
				}
				await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
				const PROD = repoCard.getByText("PROD", { exact: true });
				const TEST = repoCard.getByText("TEST", { exact: true });
				await expect(PROD).toBeVisible();
				await expect(TEST).toBeVisible();

				await expectSnapshot(page, repoCard, testInfo, "repo-ready", viewportName);
			});

			await test.step("Creates new PROD branch from main", async () => {
				const PROD = repoCard.getByText("PROD", { exact: true });
				const TEST = repoCard.getByText("TEST", { exact: true });
				await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
				await expect(PROD).toBeVisible();
				await expect(TEST).toBeVisible();

				await PROD.click();
				const missingProdBranch = repoCard.getByText(/^No branch found matching environment "PROD"\.$/);
				if (await missingProdBranch.isVisible()) {
					const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
					await expectVisibleWithin(createProdButton, "Button: Create New Branch: PROD", 30_000);
					await createProdButton.click();
					await expect(createProdButton).toBeHidden({ timeout: 30_000, });
					await expect(missingProdBranch).toHaveCount(0);
				}
				await expect(repoCard.getByText("Failed to create branch", { exact: true, }),).toHaveCount(0);

				await expectSnapshot(page, repoCard, testInfo, "prod-cloned", viewportName);

			});

			await test.step("Creates new TEST branch from main", async () => {
				const PROD = repoCard.getByText("PROD", { exact: true });
				const TEST = repoCard.getByText("TEST", { exact: true });
				await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
				await expect(PROD).toBeVisible();
				await expect(TEST).toBeVisible();

				await TEST.click();
				const missingTestBranch = repoCard.getByText(/^No branch found matching environment "TEST"\.$/);
				if (await missingTestBranch.isVisible()) {
					const createTestButton = repoCard.getByRole("button", { name: "Create New Branch: TEST", });
					await expectVisibleWithin(createTestButton, "Button: Create New Branch: TEST", 30_000);
					await createTestButton.click();
					await expect(createTestButton).toBeHidden({ timeout: 30_000, });
					await expect(missingTestBranch).toHaveCount(0);
				}
				await expect(repoCard.getByText("Failed to create branch", { exact: true, }),).toHaveCount(0);

				await expectSnapshot(page, repoCard, testInfo, "end", viewportName);
			});
				
		});


		test("Edge Integrated - Creates valid repo with no environments", async ({ page, context}, testInfo) => {
			await restoreGithubSessionStorage(context);
			await page.goto(CORP_URL);
			const reponame = safePathSegment(`RepoDetail-no-env-${viewportName}`);
			const repoCard = await expandRepoCard(page,);
			const repoSelection = await chooseRepoOption(page, repoCard, reponame, { reuseExisting: true, });

			if (repoSelection === "new") {
				const createEnvironmentsSwitch = repoCard.getByRole("switch", { name: "Create environments", });
				await expect(createEnvironmentsSwitch).toBeChecked();
				await createEnvironmentsSwitch.click();
				await expect(createEnvironmentsSwitch).not.toBeChecked();

				const cloneRepoButton = repoCard.getByRole("button", { name: "Clone Repository", });
				await cloneRepoButton.click();
			}

			await expect(repoCard.getByText("Loading environments...", { exact: true, })).toBeHidden();
			await expect(repoCard.getByText("Valid", { exact: true, })).toBeVisible({ timeout: 30_000, });
			await expect(repoCard.getByText("No environment found",)).toBeVisible();
			await expect(repoCard.getByRole("button", { name: "Clone Repository", })).toHaveCount(0);

			await expectSnapshot(page, repoCard, testInfo, "repo-no-env", viewportName);
		});

		test("Edge Integrated - Creates PROD branch, then creates TEST from PROD", async ({ page, context}, testInfo) => {
			test.setTimeout(300_000);
			const repoName = safePathSegment(`RepoDetail-test-from-prod-${viewportName}`,);
			await restoreGithubSessionStorage(context);
			await page.goto(CORP_URL);
			const repoCard = await expandRepoCard(page,);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });

			await chooseRepoOption(page, repoCard, repoName);
			await expect(repoInput).toHaveValue(repoName);
			const cloneRepoButton = repoCard.getByRole("button", { name: "Clone Repository", });
			await expectVisibleWithin(cloneRepoButton, "Button: Clone Repository", 30_000);
			await cloneRepoButton.click();
			await expectVisibleWithin(repoCard.getByText("Pick the environment to configure."), "Text: Pick the environment to configure", 120_000);

			const PROD = repoCard.getByText("PROD", { exact: true, });
			const TEST = repoCard.getByText("TEST", { exact: true, });
			await expect(repoCard.getByText("Loading environments...", { exact: true, })).toBeHidden();
			await expect(PROD).toBeVisible();
			await expect(TEST).toBeVisible();

			await PROD.click();
			const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
			await expect(createProdButton).toBeVisible();
			await createProdButton.click();
			await expect(createProdButton).toBeHidden({ timeout: 30_000, });
			await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/),).toHaveCount(0);

			await TEST.click();
			const createTestButton = repoCard.getByRole("button", { name: "Create New Branch: TEST", });
			await expect(createTestButton).toBeVisible();
			const sourceBranchSelect = createTestButton.locator("..").getByRole("combobox",);
			await sourceBranchSelect.click();
			await page.getByRole("option", { name: "PROD", exact: true, }).click();
			await expect(sourceBranchSelect).toHaveText(/PROD/);

			await expectSnapshot(page, repoCard, testInfo, "prod-from-test-branch", viewportName);

			await createTestButton.click();
			await expect(createTestButton).toBeHidden({ timeout: 30_000, });
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/),).toHaveCount(0);

			await expectSnapshot(page, repoCard, testInfo, "prod-from-test-cloned", viewportName);
		});
	});
}


