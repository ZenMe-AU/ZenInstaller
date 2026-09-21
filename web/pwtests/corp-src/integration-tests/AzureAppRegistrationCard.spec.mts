import { expect, test } from "../../coverage/fixture";
import { restoreAzureSessionStorage, restoreGithubSessionStorage } from "../util/setupHelper.mts";
import {chooseRepoOption, expandAzureAppRegistrationCard, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard, expectSnapshot, expectVisibleWithin, safePathSegment} from "../util/testHelper.mts";
import { CORP_URL, viewports } from "../../testInit";

async function prepareAppRegistrationCard(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext, repoName: string) {
	await restoreGithubSessionStorage(context);
	await restoreAzureSessionStorage(context);
	await page.goto(CORP_URL);

	const azureLoginCard = await expandAzureLoginCard(page);
	const signedInText = azureLoginCard.getByText(/Signed in as/i);
	const tenantSelect = azureLoginCard.getByTestId("tenant-select");
	await expect(signedInText).toBeVisible({ timeout: 120_000 });
	await expect(tenantSelect).toBeVisible({ timeout: 120_000 });
	const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
	expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
	await tenantSelect.click();
	await page.getByRole("option").filter({ hasText: tenantId }).click();

	const repoCard = await expandRepoCard(page);
	const repoSelection = await chooseRepoOption(page, repoCard, repoName, { reuseExisting: true });
	if (repoSelection === "new") {
		await repoCard.getByRole("button", { name: "Clone Repository" }).click();
		await expectVisibleWithin(
			repoCard.getByText("Pick the environment to configure."),
			"Text: Pick the environment to configure",
			500_000,
		);
	}
	await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
	const prodEnvironment = repoCard.getByText("PROD", { exact: true });
	if (!(await prodEnvironment.isVisible())) {
		throw new Error(`The repository "${repoName}" does not have a visible PROD environment.`);
	}
	await prodEnvironment.click();
	const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
	if (await createProdButton.isVisible()) {
		await createProdButton.click();
		await expect(createProdButton).toBeHidden({ timeout: 30_000 });
	}

	const subscriptionCard = await expandAzureSubscriptionCard(page);
	await expect(subscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
	await expect(subscriptionCard.getByRole("combobox")).toBeVisible({ timeout: 100_000 });
	const saveButton = subscriptionCard.getByRole("button", { name: /^Save(?: 2)? variables$/ });
	if ((await saveButton.count()) > 0 && await saveButton.isEnabled({ timeout: 0 })) {
		await saveButton.click();
		await expect(subscriptionCard.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled({ timeout: 60_000 });
	}

	return expandAzureAppRegistrationCard(page);
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Azure App Registration Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1 });

			test("Happy path", async ({ page, context }, testInfo) => {
			test.setTimeout(600_000);
			const runId = Date.now().toString(36);
			const repoName = safePathSegment(`azure-subscrip-${viewportName}`);
			const appName = safePathSegment(`zeninstaller-${repoName}-${runId}`);
			await restoreGithubSessionStorage(context);
			await restoreAzureSessionStorage(context);
			await page.goto(CORP_URL);

			const azureLoginCard = await test.step("Select the restored Azure tenant", async () => {
				const card = await expandAzureLoginCard(page);
				await expectSnapshot(page, card, testInfo, "start", viewportName);
				const signedInText = card.getByText(/Signed in as/i);
				const tenantSelect = card.getByTestId("tenant-select");
				await expect(signedInText).toBeVisible({ timeout: 120_000 });
				await expect(tenantSelect).toBeVisible({ timeout: 120_000 });
				const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
				expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
				await tenantSelect.click();
				await page.getByRole("option").filter({ hasText: tenantId }).click();
				await expectSnapshot(page, card, testInfo, "tenant-selected", viewportName);
				return card;
			});

			const repoCard = await test.step("Select the existing repository and PROD environment", async () => {
				const card = await expandRepoCard(page);
				const repoSelection = await chooseRepoOption(page, card, repoName, { reuseExisting: true });
				if (repoSelection === "new") {
					await card.getByRole("button", { name: "Clone Repository" }).click();
					await expectVisibleWithin(
						card.getByText("Pick the environment to configure."),
						"Text: Pick the environment to configure",
						500_000,
					);
				}
				await expect(card.getByText("Loading environments...", { exact: true })).toBeHidden({ timeout: 120_000 });
				const prodEnvironment = card.getByText("PROD", { exact: true });
				await prodEnvironment.click();
				const createProdButton = card.getByRole("button", { name: "Create New Branch: PROD" });
				if (await createProdButton.isVisible()) {
					await createProdButton.click();
					await expect(createProdButton).toBeHidden({ timeout: 30_000 });
				}
				await expectSnapshot(page, card, testInfo, "existing-repo", viewportName);
				return card;
			});

			await test.step("Save the Azure subscription variables", async () => {
				const card = await expandAzureSubscriptionCard(page);
				await expect(card.getByText("Loading subscriptions...", { exact: true })).toBeHidden({ timeout: 60_000 });
				const subscriptionSelect = card.getByRole("combobox");
				await expect(subscriptionSelect).toBeVisible({ timeout: 100_000 });
				const saveButton = card.getByRole("button", { name: /^Save(?: 2)? variables$/ });
				if ((await saveButton.count()) > 0 && await saveButton.isEnabled({ timeout: 0 })) {
					await saveButton.click();
					await expect(card.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled({ timeout: 60_000 });
					await expectSnapshot(page, card, testInfo, "subscription-saved", viewportName);
				}
				await expectSnapshot(page, card, testInfo, "subscription-saved", viewportName);
			});

			const appRegistrationCard = await test.step("Create the app registration and grant access", async () => {
				const card = await expandAzureAppRegistrationCard(page);
				const appNameInput = card.locator("input:visible").first();
				await expect(appNameInput).toBeVisible();
				await appNameInput.fill(appName);

				await expectSnapshot(page, card, testInfo, "app-prefilled", viewportName);

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
				await page.waitForTimeout(1000);
				await expectSnapshot(page, card, testInfo, "app-created", viewportName);
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

				await expectSnapshot(page, appRegistrationCard, testInfo, "end", viewportName);
			});

			console.log(`Created live Azure app registration test resources: ${appName} for ${repoName}`);
			await expect(azureLoginCard.getByText(/Signed in as/i)).toBeVisible();
			await expect(repoCard.getByText("PROD", { exact: true })).toBeVisible();
		});

		test("Edge case - reuses an existing app registration on retry", async ({ page, context }, testInfo) => {
			test.setTimeout(600_000);
			const runId = Date.now().toString(36);
			const repoName = safePathSegment(`azure-subscrip-${viewportName}`);
			const appName = `zeninstaller-${repoName}-${runId}`;
			const card = await prepareAppRegistrationCard(page, context, repoName);
			const appNameInput = card.locator("input:visible").first();

			await appNameInput.fill(appName);
			await card.getByRole("button", { name: "Create app registration" }).click();
			await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
			await expect(card.getByRole("button", { name: "Try again" })).toBeVisible();
			await expect(card.getByText("Create app registration", { exact: true })).toBeVisible();

			await card.getByRole("button", { name: "Try again" }).click();
			await expect(appNameInput).toBeVisible();
			await card.getByRole("button", { name: "Create app registration" }).click();
			await expect(card.getByText("Running...", { exact: true })).toBeHidden({ timeout: 300_000 });
			await expect(card.getByText(/Existing:/i)).toBeVisible();
			await expect(card.getByText("Already exists", { exact: true })).toBeVisible();
			await expect(card.getByText(/Connection details saved(?: — no changes needed)?\./i)).toBeVisible({ timeout: 120_000 });
			await expectSnapshot(page, card, testInfo, "existing-app-reused", viewportName,);
		});
	});
}