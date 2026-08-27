import { expect, test, type Page, } from "@playwright/test";
import { corpGithubAuthStateExists, restoreCorpSessionStorage, storageStateFile, } from "../util/setupHelper";
import { CORP_URL, viewports, } from "../../testInit";
import { expandGithubLoginCard, expectCardSnapshot, sensitiveTextMasks } from "../util/testHelper";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`GitHub Login Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1, storageState: storageStateFile, });
		test.skip(!corpGithubAuthStateExists(), "Run pwtests/corp-src/setup/github-pat-login.setup.ts first.",);

		test.beforeEach(async ({ page }) => {
			await page.goto(CORP_URL);
		});

		test("Renders GitHub login card with Backend mode defaults", async ({ page, }, testInfo) => {
			const githubCard = await expandGithubLoginCard(page,);
			await expect(githubCard.getByRole("button", { name: "Backend", exact: true, }),).toBeVisible();
			await expect(githubCard.getByRole("button", { name: "Direct (PAT)", exact: true, }),).toBeVisible();
			await expect(githubCard.getByRole("button", { name: "Login with GitHub", exact: true, }),).toBeVisible();
			await expectCardSnapshot(page, githubCard, testInfo, "backend-mode.png", { userId: "signed-out", viewportName, testFolder: "GitHub Login Card", },);
		});

		test("Testing invalid PAT token in direct (PAT) mode", async ({ page }, testInfo) => {
			const githubCard = await expandGithubLoginCard(page,);
			await githubCard.getByRole("button", { name: "Direct (PAT)", exact: true, }).click();
			const patInput = githubCard.getByPlaceholder("ghp_… or github_pat_…",);
			const connectWithPat = githubCard.getByRole("button", { name: "Connect with PAT", exact: true, });
			await expect(patInput,).toBeVisible();
			await expect(connectWithPat,).toBeDisabled();
			await patInput.fill("not-a-valid-pat",);
			await expect(connectWithPat,).toBeEnabled();
			await connectWithPat.click();
			await expect(githubCard.getByText(/Must be a GitHub PAT \(ghp_… or github_pat_…\)/i,),).toBeVisible();
			await expectCardSnapshot(page, githubCard, testInfo, "invalid-pat.png", { userId: "signed-out", viewportName, testFolder: "GitHub Login Card", },);
		});

		test("Can switch from Direct mode back to Backend mode", async ({ page, context }) => {
			await restoreCorpSessionStorage(context,);
			const githubCard = await expandGithubLoginCard(page,);
			await githubCard.getByRole("button", { name: "Direct (PAT)", exact: true, }).click();
			await expect(githubCard.getByRole("button", { name: "Connect with PAT", exact: true, }),).toBeVisible();
			await githubCard.getByRole("button", { name: "Backend", exact: true, }).click();
			await expect(githubCard.getByRole("button", { name: "Login with GitHub", exact: true, }),).toBeVisible();
		});

		test("Shows authenticated GitHub card state after PAT login", async ({ page, context }, testInfo) => {
			await restoreCorpSessionStorage(context,);
			await page.reload();

			const githubCard = await expandGithubLoginCard(page,);
			await expect(githubCard.getByText(/Authenticated as/i,),).toBeVisible();
			await expect(githubCard.getByText(/· PAT mode/i,),).toBeVisible();
			await expect(githubCard.getByRole("button", { name: "Sign out", exact: true, }),).toBeVisible();
			await expect(githubCard.getByRole("button", { name: "Login with GitHub", exact: true, }),).toHaveCount(0);
			await expectCardSnapshot(page, githubCard, testInfo, "pat-auth-state.png",
				{ userId: "github-pat", viewportName, testFolder: "GitHub Login Card Authenticated", mask: sensitiveTextMasks(githubCard,), },
			);
		});
	});
}
