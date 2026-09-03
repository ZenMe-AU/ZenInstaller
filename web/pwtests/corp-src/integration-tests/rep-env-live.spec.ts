import { expect, test } from "@playwright/test";
import { corpGithubAuthStateExists, restoreGithubSessionStorage } from "../util/setupHelper";
import { CORP_URL, viewports, } from "../../testInit";
import { expandRepoCard, chooseRepoOption, expectVisibleWithin, expectCardSnapshot, sensitiveTextMasks } from "../util/testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Live Tests - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1});

		test.beforeEach(async ({ page, context, }) => {
			await restoreGithubSessionStorage(context,);
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

		test("LIVE TEST - Creates valid repo with no environments", async ({ page, }, testInfo) => {
			const reponame = `live-no-env-${viewportName}`;
			const repoCard = await expandRepoCard(page,);
			await chooseRepoOption(page, repoCard, reponame);

			const createEnvironmentsSwitch = repoCard.getByRole("switch", { name: "Create environments", });
			await expect(createEnvironmentsSwitch).toBeChecked();
			await createEnvironmentsSwitch.click();
			await expect(createEnvironmentsSwitch).not.toBeChecked();

			const cloneRepoButton = repoCard.getByRole("button", { name: "Clone Repository", });
			await cloneRepoButton.click();

			await expect(repoCard.getByText("Valid", { exact: true, })).toBeVisible({ timeout: 30_000, });
			await expect(repoCard.getByText("Loading environments...", { exact: true, })).toBeHidden();
			await expect(repoCard.getByText("No environment found",)).toBeVisible();
			await expect(repoCard.getByRole("button", { name: "Clone Repository", })).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo, "valid-repo-no-env-live.png", {
				userId: "github-pat",
				viewportName,
				testFolder: "Repository and Environment Authenticated",
				mask: sensitiveTextMasks(repoCard,),
			});
		});

		test("LIVE TEST - Creates PROD branch, then creates TEST from PROD", async ({ page, }, testInfo) => {
			const reponame = `live-test7-${viewportName}`;
			const repoCard = await expandRepoCard(page,);
			const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", });

			await repoInput.click();
			const existingRepoOption = page.getByRole("option", { name: reponame, });
			await expect(existingRepoOption).toBeVisible();
			await existingRepoOption.click();
			await expect(repoInput).toHaveValue(reponame);
			await expect(repoCard.getByText("Valid", { exact: true, })).toBeVisible();

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

			await expectCardSnapshot(page, repoCard, testInfo, "prod-branch-created-live.png", {
				userId: "github-pat", viewportName, testFolder: "Repository and Environment Authenticated", mask: sensitiveTextMasks(repoCard,),
			});

			await TEST.click();
			const createTestButton = repoCard.getByRole("button", { name: "Create New Branch: TEST", });
			await expect(createTestButton).toBeVisible();
			const sourceBranchSelect = createTestButton.locator("..").getByRole("combobox",);
			await sourceBranchSelect.click();
			await page.getByRole("option", { name: "PROD", exact: true, }).click();
			await expect(sourceBranchSelect).toHaveText(/PROD/);

			await expectCardSnapshot(page, repoCard, testInfo, "prod-branch-selected-live.png", {
				userId: "github-pat", viewportName, testFolder: "Repository and Environment Authenticated", mask: sensitiveTextMasks(repoCard,),
			});

			await createTestButton.click();
			await expect(createTestButton).toBeHidden({ timeout: 30_000, });
			await expect(repoCard.getByText(/^No branch found matching environment "TEST"\.$/),).toHaveCount(0);

			await expectCardSnapshot(page, repoCard, testInfo, "test-branch-created-live.png", {
				userId: "github-pat", viewportName, testFolder: "Repository and Environment Authenticated", mask: sensitiveTextMasks(repoCard,),
			});
		});
	});
}