import { expect, test } from "@playwright/test";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "../util/setupHelper.mts";
import {
	chooseRepoOption,
	expandAzureAppRegistrationCard,
	expandAzureLoginCard,
	expandAzureSubscriptionCard,
	expandRepoCard,
	expectCardSnapshot,
	expectVisibleWithin,
	safePathSegment,
	sensitiveTextMasks,
} from "../util/testHelper.mts";
import { CORP_URL, viewports } from "../../testInit";

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Azure App Registration Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1 });

		test("Happy path", async ({ page, context }, testInfo) => {
			test.setTimeout(600_000);
			const testName = safePathSegment(testInfo.title);
			const runId = Date.now().toString(36);
			const repoName = safePathSegment(`azure-app-reg-${viewportName}-${runId}`);
			const appName = `zeninstaller-${repoName}`;

			await restoreGithubSessionStorage(context);
			await restoreAzureSessionStorage(context);
			await page.goto(CORP_URL);

			const azureLoginCard = await test.step("Select the restored Azure tenant", async () => {
				const card = await expandAzureLoginCard(page);
				const signedInText = card.getByText(/Signed in as/i);
				const tenantSelect = card.getByTestId("tenant-select");
				await expect(signedInText).toBeVisible({ timeout: 120_000 });
				await expect(tenantSelect).toBeVisible({ timeout: 120_000 });
				const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
				expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
				await tenantSelect.click();
				await page.getByRole("option").filter({ hasText: tenantId }).click();
				return card;
			});

			const repoCard = await test.step("Create a repository and PROD environment", async () => {
				const card = await expandRepoCard(page);
				await chooseRepoOption(page, card, repoName);
				await card.getByRole("button", { name: "Clone Repository" }).click();
				await expectVisibleWithin(
					card.getByText("Pick the environment to configure."),
					"Text: Pick the environment to configure",
					500_000,
				);
				const prodEnvironment = card.getByText("PROD", { exact: true });
				await expect(prodEnvironment).toBeVisible();
				await prodEnvironment.click();
				const createProdButton = card.getByRole("button", { name: "Create New Branch: PROD" });
				await expect(createProdButton).toBeVisible();
				await createProdButton.click();
				await expect(createProdButton).toBeHidden({ timeout: 30_000 });
				return card;
			});

			await test.step("Save the Azure subscription variables", async () => {
				const card = await expandAzureSubscriptionCard(page);
				await expect(card.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
				const subscriptionSelect = card.getByRole("combobox");
				await expect(subscriptionSelect).toBeVisible({ timeout: 100_000 });
				await card.getByRole("button", { name: "Save 2 variables" }).click();
				await expect(card.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled({ timeout: 60_000 });
			});

			const appRegistrationCard = await test.step("Create the app registration and grant access", async () => {
				const card = await expandAzureAppRegistrationCard(page);
				const appNameInput = card.locator("input:visible").first();
				await expect(appNameInput).toBeVisible();
				await appNameInput.fill(appName);

				await expectCardSnapshot(page, card, testInfo, `${testName}-start.png`, {
					userId: "azure-github-auth",
					viewportName,
					testFolder: "Azure App Registration Card",
					mask: sensitiveTextMasks(card),
				});

				await card.getByRole("button", { name: "Create app registration" }).click();
				await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
				await expect(card.getByRole("button", { name: "Try again" })).toBeVisible();

				for (const stepLabel of [
					"Confirm Microsoft permissions",
					"Create app registration",
					"Create service principal",
					"Switch GitHub OIDC to immutable subject",
					"Add federated credentials",
					"Assign RBAC roles",
				]) {
					await expect(card.getByText(stepLabel, { exact: true })).toBeVisible();
				}
				await expect(card.getByText(/Additional consent required|Consent redirect failed/i)).toHaveCount(0);
				return card;
			});

			await test.step("Verify connection details were auto-saved", async () => {
				await expect(
					appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i),
				).toBeVisible({ timeout: 120_000 });
				const connectionInputs = appRegistrationCard.locator('[data-sensitive="true"] input');
				await expect(connectionInputs).toHaveCount(2);
				const clientIds = await connectionInputs.evaluateAll((inputs) =>
					inputs.map((input) => (input as HTMLInputElement).value.trim()),
				);
				expect(clientIds[0], "AZURE_CLIENT_ID should be populated").not.toBe("");
				expect(clientIds[1], "AZURE_PLAN_CLIENT_ID should be populated").toBe(clientIds[0]);
				await expect(appRegistrationCard.getByText("2 not configured", { exact: true })).toHaveCount(0);

				await expectCardSnapshot(page, appRegistrationCard, testInfo, `${testName}-end.png`, {
					userId: "azure-github-auth",
					viewportName,
					testFolder: "Azure App Registration Card",
					mask: sensitiveTextMasks(appRegistrationCard),
				});
			});

			console.log(`Created live Azure app registration test resources: ${appName} for ${repoName}`);
			await expect(azureLoginCard.getByText(/Signed in as/i)).toBeVisible();
			await expect(repoCard.getByText("PROD", { exact: true })).toBeVisible();
		});
	});
}