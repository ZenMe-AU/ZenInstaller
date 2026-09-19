import { expect, type BrowserContext, type Page } from "@playwright/test";
import { CORP_URL } from "../../testInit";
import {
	chooseRepoOption,
	expandAzureLoginCard,
	expandAzureSubscriptionCard,
	expandRepoCard,
} from "../util/testHelper.mts";
import {
	installMockAzure,
	installMockGitHub,
	mockSubscriptionId,
	mockTenantId,
	signInMockAzure,
} from "./mockFixtures.mts";

export async function prepareMockAzureSubscription(
	page: Page,
	context: BrowserContext,
	repoName: string,
	options: { initialVariables?: Record<string, string>; saveVariables?: boolean } = {},
) {
	const github = await installMockGitHub(page, context, { initialVariables: options.initialVariables });
	const azure = await installMockAzure(page);
	await page.goto(CORP_URL);

	const azureLoginCard = await expandAzureLoginCard(page);
	await signInMockAzure(page);
	await expect(azureLoginCard.getByText(/Signed in as/i)).toBeVisible();
	const tenantSelect = azureLoginCard.getByTestId("tenant-select");
	await expect(tenantSelect).toBeVisible();
	await tenantSelect.click();
	await page.getByRole("option", { name: /Mock tenant/i }).click();

	const repoCard = await expandRepoCard(page);
	await chooseRepoOption(page, repoCard, repoName);
	await repoCard.getByRole("button", { name: "Clone Repository" }).click();
	await expect(repoCard.getByText("Pick the environment to configure.")).toBeVisible();
	await repoCard.getByText("PROD", { exact: true }).click();
	const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD" });
	await expect(createProdButton).toBeVisible();
	await createProdButton.click();
	await expect(createProdButton).toBeHidden();

	const azureSubscriptionCard = await expandAzureSubscriptionCard(page);
	await expect(azureSubscriptionCard.getByText("Loading subscriptions...", { exact: true })).toBeHidden();
	await expect(azureSubscriptionCard.getByRole("combobox")).toBeVisible();

	if (options.saveVariables) {
		const saveButton = azureSubscriptionCard.getByRole("button", { name: "Save 2 variables" });
		await expect(saveButton).toBeEnabled();
		await saveButton.click();
		await expect(azureSubscriptionCard.getByRole("button", { name: /^Save\s+variables$/ })).toBeDisabled();
	}

	const tenantVariableInput = azureSubscriptionCard
		.getByText("AZURE_TENANT_ID", { exact: true })
		.locator("..")
		.locator("..")
		.getByRole("textbox");
	const subscriptionVariableInput = azureSubscriptionCard
		.getByText("AZURE_SUBSCRIPTION_ID", { exact: true })
		.locator("..")
		.locator("..")
		.getByRole("textbox");
	const saveButton = azureSubscriptionCard.getByRole("button", { name: "Save variables", exact: true });

	return {
		azureLoginCard,
		azureSubscriptionCard,
		repoCard,
		tenantVariableInput,
		subscriptionVariableInput,
		saveButton,
		github,
		azure,
	};
}

export const savedAzureVariables = {
	AZURE_TENANT_ID: mockTenantId,
	AZURE_SUBSCRIPTION_ID: mockSubscriptionId,
};
