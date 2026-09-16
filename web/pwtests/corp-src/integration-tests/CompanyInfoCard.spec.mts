import { expect, test } from "@playwright/test";
import { restoreGithubSessionStorage } from "../util/setupHelper.mts";
import {
	chooseRepoOption,
	expandRepoCard,
	expectSnapshot,
	expectVisibleWithin,
	safePathSegment,
} from "../util/testHelper.mts";
import { CORP_URL, viewports } from "../../testInit";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Company Info Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1 });

		test("Happy path", async ({ page, context }, testInfo) => {
			test.setTimeout(300_000);
			const runId = Date.now().toString(36);
			const repoName = safePathSegment(`company-info-${viewportName.toLowerCase()}`);
			const companyCode = `znt${runId}`.toUpperCase();
			const domain = `${repoName}.example.com`;

			await restoreGithubSessionStorage(context);
			await page.goto(CORP_URL);

			const repoCard = await test.step("Create a repository and PROD environment", async () => {
				const card = await expandRepoCard(page);
				await chooseRepoOption(page, card, repoName);
				await card.getByRole("button", { name: "Clone Repository" }).click();
				await expectVisibleWithin(
					card.getByText("Pick the environment to configure."),
					"Text: Pick the environment to configure",
					120_000,
				);

				const prodEnvironment = card.getByText("PROD", { exact: true });
				await expect(prodEnvironment).toBeVisible();
				await prodEnvironment.click();

				const createProdButton = card.getByRole("button", { name: "Create New Branch: PROD" });
				await expect(createProdButton).toBeVisible();
				await page.waitForTimeout(1000);
				await createProdButton.click();
				await expect(createProdButton).toBeHidden({ timeout: 30_000 });
				return card;
			});

			const companyInfoCard = page.locator("#card-company_info");
			await test.step("Open the Company info card", async () => {
				await companyInfoCard.getByText(/^Company info$/i).click();
				await expect(
					companyInfoCard.getByText(
						"Variables used by GitHub Actions when building and deploying this environment.",
						{ exact: true },
					),
				).toBeVisible();
			});

			await test.step("Enter company and domain variables", async () => {
				const companyInput = companyInfoCard
					.getByText("COMPANY_SHORT_CODE", { exact: true })
					.locator("..")
					.locator("..")
					.getByRole("textbox");
				const domainInput = companyInfoCard
					.getByText("DNS_DOMAIN", { exact: true })
					.locator("..")
					.locator("..")
					.getByRole("textbox");

				await expect(companyInput).toBeVisible();
				await expect(domainInput).toBeVisible();
				await companyInput.fill(companyCode);
				await domainInput.fill(domain);

				await expect(companyInput).toHaveValue(companyCode);
				await expect(domainInput).toHaveValue(domain);
				await expectSnapshot(page, companyInfoCard, testInfo, `start`, viewportName);
			});

			await test.step("Save both variables to GitHub", async () => {
				const saveButton = companyInfoCard.getByRole("button", { name: "Save 2 variables" });
				await expect(saveButton).toBeEnabled();
				await saveButton.click();
				await expect(companyInfoCard.getByText("just updated", { exact: true })).toHaveCount(2);
				await expect(companyInfoCard.getByText("2 not configured", { exact: true })).toHaveCount(0);
			});

			await test.step("Verify the saved values remain in the card", async () => {
				const inputs = companyInfoCard.locator('[data-sensitive="true"] input');
				await expect(inputs).toHaveCount(2);
				await expect(inputs.nth(0)).toHaveValue(companyCode);
				await expect(inputs.nth(1)).toHaveValue(domain);
				await expectSnapshot(page, companyInfoCard, testInfo, `end`, viewportName);
			});

			await expect(repoCard.getByText("PROD", { exact: true })).toBeVisible();
		});

		test("Edge case - saves only the changed company code", async ({ page, context }, testInfo) => {
			test.setTimeout(300_000);
			const runId = Date.now().toString(36);
			const repoName = safePathSegment(`company-info-partial-${viewportName.toLowerCase()}-${runId}`);
			const initialCompanyCode = `znt${runId}`.toUpperCase();
			const updatedCompanyCode = `${initialCompanyCode}2`;
			const domain = `${repoName}.example.com`;

			await restoreGithubSessionStorage(context);
			await page.goto(CORP_URL);

			const repoCard = await expandRepoCard(page);
			await chooseRepoOption(page, repoCard, repoName);
			await repoCard.getByRole("button", { name: "Clone Repository" }).click();
			await expectVisibleWithin(
				repoCard.getByText("Pick the environment to configure."),
				"Text: Pick the environment to configure",
				120_000,
			);
			await repoCard.getByText("PROD", { exact: true }).click();

			const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
			await expect(createProdButton).toBeVisible();
			await page.waitForTimeout(1000);
			await createProdButton.click();
			await expect(createProdButton).toBeHidden({ timeout: 30_000 });

			const companyInfoCard = page.locator("#card-company_info");
			await companyInfoCard.getByText(/^Company info$/i).click();
			await expect(
				companyInfoCard.getByText(
					"Variables used by GitHub Actions when building and deploying this environment.",
					{ exact: true },
				),
			).toBeVisible();

			const companyInput = companyInfoCard
				.getByText("COMPANY_SHORT_CODE", { exact: true })
				.locator("..")
				.locator("..")
				.getByRole("textbox");
			const domainInput = companyInfoCard
				.getByText("DNS_DOMAIN", { exact: true })
				.locator("..")
				.locator("..")
				.getByRole("textbox");

			await companyInput.fill(initialCompanyCode);
			await domainInput.fill(domain);
			const initialSaveButton = companyInfoCard.getByRole("button", { name: "Save 2 variables" });
			await expect(initialSaveButton).toBeEnabled();
			await initialSaveButton.click();
			await expect(companyInfoCard.getByText("just updated", { exact: true })).toHaveCount(2);

			await companyInput.fill(updatedCompanyCode);
			await expect(domainInput).toHaveValue(domain);

			const partialSaveButton = companyInfoCard.getByRole("button", { name: "Save 1 variable" });
			await expect(partialSaveButton).toBeVisible();
			await expect(partialSaveButton).toBeEnabled();
			await expectSnapshot(page, companyInfoCard, testInfo, `company-code-modified`, viewportName);
			await partialSaveButton.click();

			await expect(companyInfoCard.getByText("just updated", { exact: true })).toHaveCount(1);
			await expect(companyInput).toHaveValue(updatedCompanyCode);
			await expect(domainInput).toHaveValue(domain);
			await expect(companyInfoCard.getByText("2 not configured", { exact: true })).toHaveCount(0);
		});
	});
}
