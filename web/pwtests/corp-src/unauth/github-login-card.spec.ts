import {expect, test, type Page,} from "@playwright/test";
import {CORP_URL, viewports,} from "../../testInit";
import {expectCardSnapshot,} from "../testHelper";

async function expandGithubLoginCard(page: Page,) {
	const githubCard = page.locator("#card-github_login",);
	const introText = githubCard.getByText(/Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i,);

	if (!(await introText.isVisible())) {
		await githubCard.getByText(/^GitHub login$/i,).click();
	}

	await expect(introText).toBeVisible();
	return githubCard;
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`GitHub Login Card - ${viewportName}`, () => {
		test.use({viewport, deviceScaleFactor: 1,});

		test.beforeEach(async ({page,}) => {
			await page.goto(CORP_URL);
		});

		test("Renders GitHub login card with Backend mode defaults", async ({page,}, testInfo) => {
			const githubCard = await expandGithubLoginCard(page,);
			await expect(githubCard.getByRole("button", {name: "Backend", exact: true,}),).toBeVisible();
			await expect(githubCard.getByRole("button", {name: "Direct (PAT)", exact: true,}),).toBeVisible();
			await expect(githubCard.getByRole("button", {name: "Login with GitHub", exact: true,}),).toBeVisible();
			await expectCardSnapshot(page, githubCard, testInfo, "backend-mode.png", {userId: "signed-out", viewportName, testFolder: "GitHub Login Card",},);
		});

		test("Switches to Direct mode and validates PAT format", async ({page,}, testInfo) => {
			const githubCard = await expandGithubLoginCard(page,);
			await githubCard.getByRole("button", {name: "Direct (PAT)", exact: true,}).click();
			const patInput = githubCard.getByPlaceholder("ghp_… or github_pat_…",);
			const connectWithPat = githubCard.getByRole("button", {name: "Connect with PAT", exact: true,});
			await expect(patInput,).toBeVisible();
			await expect(connectWithPat,).toBeDisabled();
			await patInput.fill("not-a-valid-pat",);
			await expect(connectWithPat,).toBeEnabled();
			await connectWithPat.click();
			await expect(githubCard.getByText(/Must be a GitHub PAT \(ghp_… or github_pat_…\)/i,),).toBeVisible();
			await expectCardSnapshot(page,githubCard,testInfo,"invalid-pat.png",{userId: "signed-out", viewportName, testFolder: "GitHub Login Card",},);
		});

		test("Can switch from Direct mode back to Backend mode", async ({page,}, testInfo) => {
			const githubCard = await expandGithubLoginCard(page,);
			await githubCard.getByRole("button", {name: "Direct (PAT)", exact: true,}).click();
			await expect(githubCard.getByRole("button", {name: "Connect with PAT", exact: true,}),).toBeVisible();
			await githubCard.getByRole("button", {name: "Backend", exact: true,}).click();
			await expect(githubCard.getByRole("button", {name: "Login with GitHub", exact: true,}),).toBeVisible();
		});
	});
}