import {expect, test, type Page, type TestInfo,} from "@playwright/test";
import {CORP_URL, viewports,} from "../../testInit";
import {expectPageSnapshot,} from "../testHelper";

const CARDS_UNAUTHENTICATED = [
	{id: "github_login", title: /^GitHub login$/i,},
	{id: "azure_login", title: /^Azure login$/i,},
	{id: "repo", title: /^Repository & environment$/i,},
	{id: "azure_subscription", title: /^Azure subscription$/i,},
	{id: "access_pass", title: /^Access pass$/,},
	{id: "company_info", title: /^Company info$/i,},
	{id: "azure_app_registration", title: /^Azure app registration$/i,},
	{id: "core_infra", title: /^Core infrastructure$/i,},
	{id: "create_domain", title: /^Corp domain$/i,},
] as const;

async function expandAllCards(page: Page, testInfo: TestInfo, viewportName: string,) {
	for (const {id, title,} of CARDS_UNAUTHENTICATED) {
		const card = page.locator(`#card-${id}`,);
		await expectPageSnapshot(page, testInfo, `before-expand-${id}.png`, {userId: "signed-out", viewportName,},);
		await card.scrollIntoViewIfNeeded();
		// github_login is unlocked; check for its mode buttons. All other cards are locked.
		const expandedCheck = id === "github_login"
			? card.getByRole("button", {name: "Backend", exact: true,},)
			: card.getByText(/Complete these first/i,);
		if (!(await expandedCheck.isVisible())) {
			await card.getByText(title,).click();
		}
	}
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Corp-${viewportName} - Render`, () => {
		test.use({viewport, deviceScaleFactor: 1,});

		test.beforeEach(async ({page,}, testInfo) => {
			await page.goto(CORP_URL);
		});

		test("Renders unauthenticated corp dashboard", async ({page,}, testInfo) => {
			await expect(page).toHaveURL(/http:\/\/localhost:5173\/?$/,);
			await expect(page).toHaveTitle(/ZenInstaller Setup Central Corp Environment/i,);

			await expect(
				page.getByText(
					/The ZenInstaller is used to deploy Zenblox to your environment\./i,
				),
			).toBeVisible();

			if (viewportName === "Desktop") {
				await expect(page.getByRole("link", {name: "Access Pass",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "Private Account",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "AWS Hosting",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "Cost Management",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "User Access",}),).toBeVisible();
			}

			await expect(page.getByText(/^GitHub login$/i),).toBeVisible();
			await expect(page.getByText(/^Azure login$/i),).toBeVisible();
			await expect(page.getByText(/^Repository & environment$/i),).toBeVisible();
			await expect(page.getByText(/^Azure subscription$/i),).toBeVisible();
			await expect(page.getByText(/^Access pass$/),).toBeVisible();
			await expect(page.getByText(/^Company info$/i),).toBeVisible();
			await expect(page.getByText(/^Azure app registration$/i),).toBeVisible();
			await expect(page.getByText(/^Core infrastructure$/i),).toBeVisible();
			await expect(page.getByText(/^Corp domain$/i),).toBeVisible();

			await expect(page.getByText(/^Connect your GitHub account$/),).toBeVisible();
            // mobile viewport does not show the Azure login card until the user scrolls 
			// await expect(page.getByText(/^Sign in to Azure$/),).toBeVisible();

			await expectPageSnapshot(
				page,
				testInfo,
				"page-rendered.png",
				{userId: "signed-out", viewportName,},
			);
		});

		test("Can expand all cards while unauthenticated", async ({page,}, testInfo) => {
			await expandAllCards(page, testInfo, viewportName,);

			await expect(
				page.locator("#card-github_login",).getByRole("button", {name: "Backend", exact: true,},),
			).toBeVisible();

			for (const {id,} of CARDS_UNAUTHENTICATED.filter((c,) => c.id !== "github_login" && c.id !== "azure_login",)) {
				await expect(
					page.locator(`#card-${id}`,).getByText(/Complete these first/i,),
				).toBeVisible();
			}

			await expectPageSnapshot(
				page,
				testInfo,
				"all-cards-expanded.png",
				{userId: "signed-out", viewportName,},
			);
		});
	});
}
