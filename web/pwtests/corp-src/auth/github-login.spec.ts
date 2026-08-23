import {expect, test, type Page,} from "@playwright/test";
import {corpGithubAuthStateExists, restoreCorpSessionStorage, storageStateFile,} from "../setupHelper";
import {CORP_URL, viewports,} from "../../testInit";
import {expectCardSnapshot, sensitiveTextMasks} from "../testHelper";

async function expandGithubLoginCard(page: Page,) {
	const githubCard = page.locator("#card-github_login",);
	const introText = githubCard.getByText(
		/Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i,
	);

	if (!(await introText.isVisible())) {
		await githubCard.getByText(/^GitHub login$/i,).click();
	}

	await expect(introText).toBeVisible();
	return githubCard;
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`GitHub PAT Auth - ${viewportName}`, () => {
		test.use({viewport, deviceScaleFactor: 1, storageState: storageStateFile,});
		test.skip(!corpGithubAuthStateExists(),"Run pwtests/corp-src/setup/github-pat-login.setup.ts first.",);

		test.beforeEach(async ({page, context}) => {
			await restoreCorpSessionStorage(context,);
			await page.goto(CORP_URL);
		});

		test("Shows authenticated GitHub card state after PAT login", async ({page,}, testInfo) => {
			const githubCard = await expandGithubLoginCard(page,);
			await expect(githubCard.getByText(/Authenticated as/i,),).toBeVisible();
			await expect(githubCard.getByText(/· PAT mode/i,),).toBeVisible();
			await expect(githubCard.getByRole("button", {name: "Sign out", exact: true,}),).toBeVisible();
			await expect(githubCard.getByRole("button", {name: "Login with GitHub", exact: true,}),).toHaveCount(0);

			await expectCardSnapshot(
				page,
				githubCard,
				testInfo,
				"pat-authenticated-state.png",
				{userId: "github-pat", viewportName, testFolder: "GitHub Login Card Authenticated", mask: sensitiveTextMasks(githubCard,),},
			);
		});
	});
}
