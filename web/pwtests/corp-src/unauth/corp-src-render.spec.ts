import {expect, test,} from "@playwright/test";
import {CORP_URL, viewports,} from "../../testInit";
import {expectPageSnapshot,} from "../testHelper";

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
	});
}
