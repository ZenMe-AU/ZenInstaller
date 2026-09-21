import { expect, test, } from "../../coverage/fixture";
import { restoreAzureSessionStorage, restoreGithubSessionStorage, } from "../util/setupHelper.mts";
import { chooseRepoOption, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard, expectSnapshot, expectVisibleWithin, openExistingAzureSubscription, safePathSegment, } from "../util/testHelper.mts";
import { CORP_URL, SUBSCRIPTION_ID, viewports, } from "../../testInit";


for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Azure Subscription Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1, });
		// The happy path is the main scenario for this card, showing the expect standard use case.
		test("Happy path", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);			
			await restoreGithubSessionStorage(context);
			await restoreAzureSessionStorage(context);
			await page.goto(CORP_URL);

			const azureCard = await test.step("Expand Azure Login Card", async () => {
				const azureCard = await expandAzureLoginCard(page);
				return azureCard;
			});

			const azureSubscriptionCard = await test.step("Expand Azure Subscription Card", async () => {
				const azureSubscriptionCard = await expandAzureSubscriptionCard(page);
				await expectSnapshot(page, azureSubscriptionCard, testInfo, "start", viewportName);
				return azureSubscriptionCard;
			});

			await test.step("Select tenant", async () => {
				const signedInText = azureCard.getByText(/Signed in as/i);
				const tenantSelect = azureCard.getByTestId("tenant-select");
				await expect(signedInText).toBeVisible({ timeout: 120_000 });
				await expect(tenantSelect).toBeVisible({ timeout: 120_000 });
				const tenantId = (await tenantSelect.locator("input").inputValue()).trim();
				expect(tenantId, "The restored Azure tenant ID should not be empty").not.toBe("");
				await tenantSelect.click();
				await page.getByRole("option").filter({ hasText: tenantId }).click()
				await expect(azureSubscriptionCard.getByText("Select a tenant", { exact: true }),).toHaveCount(0);

				await expectSnapshot(page, azureSubscriptionCard, testInfo, "tenant-selected", viewportName);
			});

			const repoCard = await test.step("Expand repo card", async () => {
				const repoCard = await expandRepoCard(page);
				return repoCard;
			});

			await test.step("Clone repository", async () => {
				const repoName = safePathSegment(`azure-subscrip-${viewportName}`,);
				await chooseRepoOption(page, repoCard, repoName);
				const cloneRepoButton = repoCard.getByRole('button', { name: 'Clone Repository' })
				await expect(cloneRepoButton).toBeVisible();
				await cloneRepoButton.click();
				await expectVisibleWithin(repoCard.getByText('Pick the environment to configure.'), "Text: Pick the environment to configure", 500000);
				const subscriptionCard = await expandAzureSubscriptionCard(page);
				await expectSnapshot(page, subscriptionCard, testInfo, `clone-repo`, viewportName);
				console.log(`Created live Azure subscription test repository: ${repoName}`,);
			});

			await test.step("Repo create environment", async () => {
				const PROD = repoCard.getByText("PROD", { exact: true });
				const TEST = repoCard.getByText("TEST", { exact: true });
				await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
				await expect(PROD).toBeVisible();
				await expect(TEST).toBeVisible();
				await PROD.click();
				const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
				await expectVisibleWithin(createProdButton, "Button: Create New Branch: PROD", 30_000);
				await page.waitForTimeout(2000);
				await createProdButton.click();
				await expect(createProdButton).toBeHidden({ timeout: 30_000, });
				await expect(repoCard.getByText(/^No branch found matching environment "PROD"\.$/),).toHaveCount(0);
				const subscriptionCard = await expandAzureSubscriptionCard(page);
				await expectSnapshot(page, subscriptionCard, testInfo, "create-env", viewportName);
				console.log(`Created repo environment: ${PROD}`,);
			});


			await test.step("Saving prefilled Azure subscription variables", async () => {
				await expect(azureSubscriptionCard.getByText(/Pick the subscription to deploy into\./i,),).toBeVisible();
				await expectVisibleWithin(azureSubscriptionCard.getByText(/^Tenant:/i,), "Text: Rendering Tenant", 50000);
				await expectVisibleWithin(azureSubscriptionCard.getByRole("button", { name: "Change on Azure login" }), "Button: Change on Azure Login", 5000);
				await expectVisibleWithin(azureSubscriptionCard.getByText(/^Subscription/i,), "Text: Rendering Subscription text", 50000);
				await expect(azureSubscriptionCard.getByText("Loading subscriptions...",),).toBeHidden({ timeout: 60_000, });
				const subscriptionSelect = azureSubscriptionCard.getByRole("combobox",);
				const noSubscriptionsMessage = azureSubscriptionCard.getByText("This tenant has no subscriptions you can access.", { exact: true, },);
				await expect(subscriptionSelect.or(noSubscriptionsMessage,),).toBeVisible({ timeout: 100_000, });

				if (await subscriptionSelect.isVisible()) {
					console.log(`Selecting subscription "${SUBSCRIPTION_ID}" automatically.`);
					await subscriptionSelect.click();
					const subscriptionOption = page.getByRole("option").filter({ hasText: SUBSCRIPTION_ID, });
					await expect(subscriptionOption).toBeVisible({ timeout: 30_000, });
					await subscriptionOption.click();
					// Defocus the select so it doesn't render a focus ring in the upcoming snapshot.
					await azureSubscriptionCard.getByText(/Pick the subscription to deploy into\./i,).click();
				}

				await expect(azureSubscriptionCard.getByText("Select a repository & environment to save the tenant and subscription to GitHub.", { exact: true, },),).toHaveCount(0);
				const saveButton = azureSubscriptionCard.getByRole("button", { name: "Save 2 variables" });
				await expectSnapshot(page, azureSubscriptionCard, testInfo, `before-save`, viewportName);

				await saveButton.click();
				await expectSnapshot(page, azureSubscriptionCard, testInfo, "end", viewportName);
			});
		})


		test("Selecting an existing repository with environment variables already saved", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);
			const { azureSubscriptionCard, tenantVariableInput, subscriptionVariableInput, saveButton, } = await openExistingAzureSubscription(page, context, viewportName,);

			await expect(tenantVariableInput).not.toHaveValue("");
			await expect(subscriptionVariableInput).not.toHaveValue("");
			await expect(azureSubscriptionCard.getByText("Unsaved change — save to apply.", { exact: true, }),).toHaveCount(0);
			await expect(saveButton).toBeDisabled();

			await expectSnapshot(page, azureSubscriptionCard, testInfo, "edge-case-existing-repo", viewportName);
		})

		test("Modifying one existing prefilled variable", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);
			const { azureSubscriptionCard, subscriptionVariableInput, saveButton, } = await openExistingAzureSubscription(page, context, viewportName,);
			const savedSubscriptionId = await subscriptionVariableInput.inputValue();

			await subscriptionVariableInput.fill(`${savedSubscriptionId}-modified`,);
			const saveOneVariableButton = azureSubscriptionCard.getByRole("button", { name: "Save 1 variable" });
			await expect(saveOneVariableButton).toBeEnabled();
			await expect(azureSubscriptionCard.getByText("overwrites", { exact: true, }),).toBeVisible();

			await azureSubscriptionCard.getByRole("button", { name: "Revert to saved value", }).click();
			await expect(subscriptionVariableInput).toHaveValue(savedSubscriptionId);
			await expect(azureSubscriptionCard.getByText("overwrites", { exact: true, }),).toHaveCount(0);
			await expect(saveButton).toBeDisabled();
			await expectSnapshot(page, azureSubscriptionCard, testInfo, "edge-case-variable-modified", viewportName);
		})

		test("Modifying all existing prefilled variables", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);
			const { azureSubscriptionCard, tenantVariableInput, subscriptionVariableInput, saveButton, } = await openExistingAzureSubscription(page, context, viewportName,);
			const savedTenantId = await tenantVariableInput.inputValue();
			const savedSubscriptionId = await subscriptionVariableInput.inputValue();
			const tenantVariableRow = azureSubscriptionCard.getByText("AZURE_TENANT_ID", { exact: true, }).locator("..").locator("..");
			const subscriptionVariableRow = azureSubscriptionCard.getByText("AZURE_SUBSCRIPTION_ID", { exact: true, }).locator("..").locator("..");

			await tenantVariableInput.fill("modified");
			await subscriptionVariableInput.fill("modified");
			const saveTwoVariablesButton = azureSubscriptionCard.getByRole("button", { name: "Save 2 variables" });
			await expect(saveTwoVariablesButton).toBeEnabled();
			await expect(azureSubscriptionCard.getByText("overwrites", { exact: true, }),).toHaveCount(2);
			
			const subscriptionSelect = azureSubscriptionCard.getByRole("combobox",);

			await tenantVariableRow.getByRole("button", { name: "Revert to saved value", }).click();
			await subscriptionVariableRow.getByRole("button", { name: "Revert to saved value", }).click();
			await expect(tenantVariableInput).toHaveValue(savedTenantId);
			await expect(subscriptionVariableInput).toHaveValue(savedSubscriptionId);
			await expect(azureSubscriptionCard.getByText("overwrites", { exact: true, }),).toHaveCount(0);
			await expect(saveButton).toBeDisabled();
			await expectSnapshot(page, azureSubscriptionCard, testInfo, "edge-case-both-variables-modified", viewportName);
		})

		test("Both prefilled variables are removed before saving", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);
			const { azureSubscriptionCard, tenantVariableInput, subscriptionVariableInput, } = await openExistingAzureSubscription(page, context, viewportName,);
			const savedTenantId = await tenantVariableInput.inputValue();
			const savedSubscriptionId = await subscriptionVariableInput.inputValue();

			try {
				await tenantVariableInput.fill("");
				await subscriptionVariableInput.fill("");
				const removeVariablesButton = azureSubscriptionCard.getByRole("button", { name: "Save 2 variables", exact: true, });
				await expect(removeVariablesButton).toBeEnabled();
				await expect(azureSubscriptionCard.getByText("overwrites", { exact: true, }),).toHaveCount(2);
				await removeVariablesButton.click();

				await expect(tenantVariableInput).toHaveValue("");
				await expect(subscriptionVariableInput).toHaveValue("");
				await expect(azureSubscriptionCard.getByText("2 not configured", { exact: true, }),).toBeVisible({ timeout: 60_000, });
				
				const subscriptionSelect = azureSubscriptionCard.getByRole("combobox",);
				await expectSnapshot(page, azureSubscriptionCard, testInfo, `edge-case-both-variables-removed`, viewportName);
			} finally {
				await tenantVariableInput.fill(savedTenantId);
				await subscriptionVariableInput.fill(savedSubscriptionId);
				const restoreVariablesButton = azureSubscriptionCard.getByRole("button", { name: "Save 2 variables", exact: true, });
				if (await restoreVariablesButton.isEnabled()) {
					await restoreVariablesButton.click();
				}
				await expect(tenantVariableInput).toHaveValue(savedTenantId);
				await expect(subscriptionVariableInput).toHaveValue(savedSubscriptionId);
				await expect(azureSubscriptionCard.getByText("2 not configured", { exact: true, }),).toHaveCount(0, { timeout: 60_000, });
				await expect(azureSubscriptionCard.getByRole("button", { name: "Save variables", exact: true, }),).toBeDisabled({ timeout: 60_000, });
			}
		})
	});
}
