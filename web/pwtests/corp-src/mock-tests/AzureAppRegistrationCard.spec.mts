import { expect, test } from "@playwright/test";
import { CORP_URL, viewports } from "../../testInit";
import {
	chooseRepoOption,
	expandAzureAppRegistrationCard,
	expandAzureLoginCard,
	expandAzureSubscriptionCard,
	expandRepoCard,
	expectSnapshot,
} from "../util/testHelper.mts";
import { installMockAzure, installMockGitHub, signInMockAzure } from "./mockFixtures.mts";
import { prepareMockAzureSubscription } from "./mockTestHelper.mts";

async function prepareAppRegistrationCard(
	page: import("@playwright/test").Page,
	context: import("@playwright/test").BrowserContext,
	repoName: string,
) {
	const prepared = await prepareMockAzureSubscription(page, context, repoName, { saveVariables: true });
	return {
		...prepared,
		appRegistrationCard: await expandAzureAppRegistrationCard(page),
	};
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Azure App Registration Card Mock - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1 });

		test("Happy path", async ({ page, context }, testInfo) => {
			const repoName = `mock-azure-app-${viewportName.toLowerCase()}`;
			const appName = `zeninstaller-${repoName}`;
			await installMockGitHub(page, context);
			await installMockAzure(page);
			await page.goto(CORP_URL);

			const azureLoginCard = await test.step("Select the restored Azure tenant", async () => {
				const card = await expandAzureLoginCard(page);
				await expectSnapshot(page, card, testInfo, "start", viewportName);
				await signInMockAzure(page);
				await expect(card.getByText(/Signed in as/i)).toBeVisible();
				const tenantSelect = card.getByTestId("tenant-select");
				await expect(tenantSelect).toBeVisible();
				await tenantSelect.click();
				await page.getByRole("option", { name: /Mock tenant/i }).click();
				await expectSnapshot(page, card, testInfo, "tenant-selected", viewportName);
				return card;
			});

			const repoCard = await test.step("Create a repository and PROD environment", async () => {
				const card = await expandRepoCard(page);
				await chooseRepoOption(page, card, repoName);
				await card.getByRole("button", { name: "Clone Repository" }).click();
				await expect(card.getByText("Pick the environment to configure.")).toBeVisible();
				await card.getByText("PROD", { exact: true }).click();
				const createProdButton = card.getByRole("button", { name: "Create New Branch: PROD" });
				await expect(createProdButton).toBeVisible();
				await createProdButton.click();
				await expect(createProdButton).toBeHidden();
				await expectSnapshot(page, card, testInfo, "repo-created", viewportName);
				return card;
			});

			await test.step("Save the Azure subscription variables", async () => {
				const card = await expandAzureSubscriptionCard(page);
				await expect(card.getByText("Loading subscriptions...", { exact: true })).toBeHidden();
				await expect(card.getByRole("combobox")).toBeVisible();
				await card.getByRole("button", { name: "Save 2 variables" }).click();
				await expect(card.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled();
				await expectSnapshot(page, card, testInfo, "subscription-saved", viewportName);
			});

			const appRegistrationCard = await test.step("Create the app registration and grant access", async () => {
				const card = await expandAzureAppRegistrationCard(page);
				const appNameInput = card.locator("input:visible").first();
				await expect(appNameInput).toBeVisible();
				await appNameInput.fill(appName);
				await card.getByRole("button", { name: "Create app registration" }).click();
				await expect(card.getByText("Running...", { exact: true })).toBeHidden();
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
				await expectSnapshot(page, card, testInfo, "app-created", viewportName);
				return card;
			});

			await test.step("Verify connection details were auto-saved", async () => {
				await expect(
					appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i),
				).toBeVisible();
				const connectionInputs = appRegistrationCard.locator('[data-sensitive="true"] input');
				await expect(connectionInputs).toHaveCount(2);
				const clientIds = await connectionInputs.evaluateAll((inputs) =>
					inputs.map((input) => (input as HTMLInputElement).value.trim()),
				);
				expect(clientIds[0]).not.toBe("");
				expect(clientIds[1]).toBe(clientIds[0]);
				await expect(appRegistrationCard.getByText("2 not configured", { exact: true })).toHaveCount(0);
				await expectSnapshot(page, appRegistrationCard, testInfo, "end", viewportName);
			});

			await expect(azureLoginCard.getByText(/Signed in as/i)).toBeVisible();
			await expect(repoCard.getByText("PROD", { exact: true })).toBeVisible();
		});

		test("Edge case - keeps creation disabled for a blank app name", async ({ page, context }, testInfo) => {
			const prepared = await prepareAppRegistrationCard(
				page,
				context,
				`mock-app-blank-${viewportName.toLowerCase()}`,
			);
			const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
			const createButton = prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" });
			await appNameInput.fill("   ");
			await expect(createButton).toBeDisabled();
			await appNameInput.fill("valid-mock-app");
			await expect(createButton).toBeEnabled();
			await expectSnapshot(
				page,
				prepared.appRegistrationCard,
				testInfo,
				"blank-app-name",
				viewportName,
			);
		});

		test("Edge case - reuses an existing app registration on retry", async ({ page, context }, testInfo) => {
			const prepared = await prepareAppRegistrationCard(
				page,
				context,
				`mock-app-retry-${viewportName.toLowerCase()}`,
			);
			const appNameInput = prepared.appRegistrationCard.locator("input:visible").first();
			await appNameInput.fill("zeninstaller-existing-mock-app");
			await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
			await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
			await expect(prepared.appRegistrationCard.getByRole("button", { name: "Try again" })).toBeVisible();

			await prepared.appRegistrationCard.getByRole("button", { name: "Try again" }).click();
			await expect(appNameInput).toBeVisible();
			await prepared.appRegistrationCard.getByRole("button", { name: "Create app registration" }).click();
			await expect(prepared.appRegistrationCard.getByText("Running...", { exact: true })).toBeHidden();
			await expect(prepared.appRegistrationCard.getByText(/Existing:/i)).toBeVisible();
			await expect(prepared.appRegistrationCard.getByText("Already exists", { exact: true })).toBeVisible();
			await expect(
				prepared.appRegistrationCard.getByText(/Connection details saved(?: — no changes needed)?\./i),
			).toBeVisible();
			await expectSnapshot(
				page,
				prepared.appRegistrationCard,
				testInfo,
				"existing-app-reused",
				viewportName,
			);
		});
	});
}
