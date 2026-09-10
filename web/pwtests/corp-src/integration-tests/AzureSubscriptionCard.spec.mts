import { expect, test, } from "@playwright/test";
import { restoreAzureSessionStorage, restoreGithubSessionStorage, } from "../util/setupHelper.mts";
import { chooseRepoOption, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard, expectCardSnapshot, expectVisibleWithin, safePathSegment, sensitiveTextMasks, } from "../util/testHelper.mts";
import { CORP_URL, viewports, } from "../../testInit";

// const azureSubscriptionRunId = Date.now().toString(36);

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Azure Subscription Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1, });
		// The happy path is the main scenario for this card, showing the expect standard use case.
		test("Happy path", async ({ page, context, }, testInfo) => {
			test.setTimeout(300_000);			
			const testName = safePathSegment(testInfo.title,);
			await restoreGithubSessionStorage(context);
			await restoreAzureSessionStorage(context);
			await page.goto(CORP_URL);

			const azureCard = await test.step("Expand Azure Login Card", async () => {
				const azureCard = await expandAzureLoginCard(page);
				return azureCard;
			});

			const azureSubscriptionCard = await test.step("Expand Azure Subscription Card", async () => {
				const azureSubscriptionCard = await expandAzureSubscriptionCard(page);
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

				await expectCardSnapshot(page, azureSubscriptionCard, testInfo, `${testName}-start.png`,
					{
						userId: "azure-login",
						viewportName,
						testFolder: "Azure Subscription Card",
						mask: sensitiveTextMasks(azureSubscriptionCard),
					},
				);
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
				await expectCardSnapshot(page, subscriptionCard, testInfo, `${testName}-clone-repo.png`,
					{
						userId: "azure-login",
						viewportName,
						testFolder: "Azure Subscription Card",
						mask: sensitiveTextMasks(subscriptionCard),
					},
				);
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
				await expect(createProdButton).toBeVisible();
				await createProdButton.click();
				const subscriptionCard = await expandAzureSubscriptionCard(page);
				await expectCardSnapshot(page, subscriptionCard, testInfo, `${testName}-create-env.png`,
					{
						userId: "azure-login",
						viewportName,
						testFolder: "Azure Subscription Card",
						mask: sensitiveTextMasks(subscriptionCard),
					},
				);
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
				await expect(azureSubscriptionCard.getByText("Select a repository & environment to save the tenant and subscription to GitHub.", { exact: true, },),).toHaveCount(0);
				const subscriptionMask = await subscriptionSelect.isVisible() ? [subscriptionSelect,] : [];
				const saveButton = azureSubscriptionCard.getByRole("button", { name: "Save 2 variables" });
				await saveButton.click();

				await expectCardSnapshot(page, azureSubscriptionCard, testInfo, `${testName}-end.png`, {
					userId: "azure-github-auth",
					viewportName,
					testFolder: "Azure Subscription Card Authenticated",
					mask: [
						azureSubscriptionCard.getByText(/^Tenant:/i,).locator("span",),
						...sensitiveTextMasks(azureSubscriptionCard,),
						...subscriptionMask,
					],
				},);
			});
		})
	});
}