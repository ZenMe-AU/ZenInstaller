import { expect, test, } from "@playwright/test";
import { restoreAzureSessionStorage, restoreGithubSessionStorage, } from "../util/setupHelper.mts";
import { chooseRepoOption, expandAzureLoginCard, expandAzureSubscriptionCard, expandRepoCard, expectCardSnapshot, expectVisibleWithin, sensitiveTextMasks, } from "../util/testHelper.mts";
import { CORP_URL, viewports, } from "../../testInit";

// const azureSubscriptionRunId = Date.now().toString(36);

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Azure Subscription Card - ${viewportName}`, () => {
		test.use({ viewport, deviceScaleFactor: 1, });

		// The happy path is the main scenario for this card, showing the expect standard use case.
		test("Happy path", async ({ page, context, }, testInfo) => {
			await restoreGithubSessionStorage(context);
			await restoreAzureSessionStorage(context);
			await page.goto(CORP_URL);
			const testname = testInfo.title; //TODO: Make this a safe string.

			test.step("Select tenant", async () => {
				const azureCard = await expandAzureLoginCard(page);
				await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
				await expect(azureCard.getByTestId("txtAzureUsername")).toBeVisible();
				await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
				await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
				await expect(azureCard.getByText(/^Tenant/)).toBeVisible();
				await expectVisibleWithin(azureCard.getByRole("combobox"), "Combobox: Load already stored tenant id.", 500000);
			});

			const reponame = `azure-subscrip-${viewportName}`;
			const repoCard = await test.step("Expand repo card", async () => {
				const repoCard = await expandRepoCard(page);
				await expectCardSnapshot(page, repoCard, testInfo, `${testname}-start.png`, //TODO: Make this a safe string.
					{
						userId: "azure-login",
						viewportName,
						testFolder: "Azure Subscription Card",
						mask: sensitiveTextMasks(repoCard),
					},
				);
				return repoCard;
			});

			test.step("Clone repository", async () => {
				await chooseRepoOption(page, repoCard, reponame);
				const cloneRepoButton = repoCard.getByRole('button', { name: 'Clone Repository' })
				await expect(cloneRepoButton).toBeVisible();
				await cloneRepoButton.click();
				await expectVisibleWithin(repoCard.getByText('Pick the environment to configure.'), "Text: Pick the environment to configure", 500000);
			});

			test.step("Repo create environment", async () => {
				const PROD = repoCard.getByText("PROD", { exact: true });
				const TEST = repoCard.getByText("TEST", { exact: true });
				await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
				await expect(PROD).toBeVisible();
				await expect(TEST).toBeVisible();
				await PROD.click();
				const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
				await expect(createProdButton).toBeVisible();
				await createProdButton.click();
			});

		});

		test("Unauthenticated card state", async ({ page, }, testInfo) => {
			await page.goto(CORP_URL);
			const subscriptionCard = await expandAzureSubscriptionCard(page);
			await expect(subscriptionCard.getByText("Complete these first", { exact: true, },),).toBeVisible();
			await expect(subscriptionCard.getByText("Sign in to Azure", { exact: true, },),).toBeVisible();
			await expect(subscriptionCard.getByText("Select a repository & environment", { exact: true, },),).toBeVisible();
			await expect(subscriptionCard.getByRole("combobox"),).toHaveCount(0);
			await expectCardSnapshot(page, subscriptionCard, testInfo, "unauth-state.png", {
				userId: "signed-out",
				viewportName,
				testFolder: "Azure Subscription Card",
			},
			);
		},
		);

		test.describe("Too few prerequisites fulfilled", () => {

			test("Azure signed in and GitHub not signed in", async ({ page, context, }) => {
				await restoreAzureSessionStorage(context);
				await page.goto(CORP_URL);
				const subscriptionCard = await expandAzureSubscriptionCard(page);
				await subscriptionCard.getByText("Select a repository & environment", { exact: true, },).click();
				const repoCard = page.locator("#card-repo");
				await expect(repoCard.getByText(/^Repository & environment$/i,),).toBeVisible();
				await expect(repoCard.getByText(/Sign in to GitHub/i,),).toBeVisible();
			},
			);

			test("Azure & GitHub signed in, repo env not selected", async ({ page, context, }, testInfo) => {
				await restoreGithubSessionStorage(context);
				await restoreAzureSessionStorage(context);
				await page.goto(CORP_URL);
				const subscriptionCard = await expandAzureSubscriptionCard(page);
				await expect(subscriptionCard.getByText("Complete these first", { exact: true, },),).toBeVisible();
				await expect(subscriptionCard.getByText("Select a repository & environment", { exact: true, },),).toBeVisible();
				await expect(subscriptionCard.getByText("Sign in to Azure", { exact: true, },),).toHaveCount(0);
				await expect(subscriptionCard.getByRole("combobox"),).toHaveCount(0);
				await expectCardSnapshot(page, subscriptionCard, testInfo, "azure-authenticated-repo-required.png",
					{
						userId: "azure-login",
						viewportName,
						testFolder: "Azure Subscription Card Authenticated",
						mask: sensitiveTextMasks(subscriptionCard),
					},
				);
			},
			);

		});


		test.describe("Azure authenticated & Rep Env Selected", () => {
			test.beforeEach(async ({ page, context, }) => {
				await restoreGithubSessionStorage(context,);
				await restoreAzureSessionStorage(context,);
				await page.goto(CORP_URL);
			});

			test("Selects tenant, creates Rep Env and fulfils both prerequisites", async ({ page, }, testInfo) => {

				/* Signing into Azure and selecting tenant id*/
				const azureCard = await expandAzureLoginCard(page);
				await expect(azureCard.getByText(/Signed in as/i)).toBeVisible();
				await expect(azureCard.getByTestId("txtAzureUsername")).toBeVisible();
				await expect(azureCard.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
				await expect(azureCard.getByRole("button", { name: "Sign in with Azure", exact: true })).toHaveCount(0);
				await expect(azureCard.getByText(/^Tenant/)).toBeVisible();
				await expectVisibleWithin(azureCard.getByRole("combobox"), "Combobox: Load already stored tenant id.", 500000);

				/* cloning repo and creating environment*/
				const reponame = `azure-subscrip-${viewportName}`;
				const repoCard = await expandRepoCard(page);
				await chooseRepoOption(page, repoCard, reponame);
				const cloneRepoButton = repoCard.getByRole('button', { name: 'Clone Repository' })
				await expect(cloneRepoButton).toBeVisible();
				await cloneRepoButton.click();
				await expectVisibleWithin(repoCard.getByText('Pick the environment to configure.'), "Text: Pick the environment to configure", 500000);

				const PROD = repoCard.getByText("PROD", { exact: true });
				const TEST = repoCard.getByText("TEST", { exact: true });
				await expect(repoCard.getByText("Loading environments...", { exact: true })).toBeHidden();
				await expect(PROD).toBeVisible();
				await expect(TEST).toBeVisible();
				await PROD.click();
				const createProdButton = repoCard.getByRole("button", { name: "Create New Branch: PROD", });
				await expect(createProdButton).toBeVisible();
				await createProdButton.click();

				/* start of Azure subscription testing */
				const subscriptionCard = await expandAzureSubscriptionCard(page,);
				await expect(subscriptionCard.getByText(/Pick the subscription to deploy into\./i,),).toBeVisible();
				expectVisibleWithin(subscriptionCard.getByText(/^Tenant:/i,), "Text: Rendering Tenant", 50000);
				expectVisibleWithin(subscriptionCard.getByRole("button", { name: "Change on Azure login" }), "Button: Change on Azure Login", 5000);
				expectVisibleWithin(subscriptionCard.getByText(/^Subscription/i,), "Text: Rendering Subscription text", 50000);
				await expect(subscriptionCard.getByText("Loading subscriptions...",),).toBeHidden({ timeout: 60_000, });

				const subscriptionSelect = subscriptionCard.getByRole("combobox",);
				const noSubscriptionsMessage = subscriptionCard.getByText("This tenant has no subscriptions you can access.", { exact: true, },);

				await expect(subscriptionSelect.or(noSubscriptionsMessage,),).toBeVisible({ timeout: 100_000, });
				await expect(subscriptionCard.getByText("Select a repository & environment to save the tenant and subscription to GitHub.", { exact: true, },),).toHaveCount(0);
				const subscriptionMask = await subscriptionSelect.isVisible() ? [subscriptionSelect,] : [];

				await expectCardSnapshot(page, subscriptionCard, testInfo, "auth-state.png", {
					userId: "azure-github-auth",
					viewportName,
					testFolder: "Azure Subscription Card Authenticated",
					mask: [
						subscriptionCard.getByText(/^Tenant:/i,).locator("span",),
						...sensitiveTextMasks(subscriptionCard,),
						...subscriptionMask,
					],
				},);

				console.log(`Created live Azure subscription test repository: ${reponame}`,);
			});
		});
	});
}