import { expect, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import fs from "fs";

export type PageSnapshotOptions = {
	userId: string;
	viewportName: string;
	testFolder?: string;
	mask?: Locator[];
  	stabilizeAuth?: boolean;
};

/* -------------------------------------- SHARED HELPER FUNCTIONS ------------------------------------------------------------------*/

// Returns sensitive identity fields contained by the supplied page or locator.
export function sensitiveTextMasks(root: Page | Locator,): Locator[] {
	return [root.locator('[data-sensitive="true"]'),];
}

// Normalizes arbitrary strings into stable snapshot path segments.
function safePathSegment(value: string,): string {
	const safeValue = value
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g,"-",)
		.replace(/^[-_.]+|[-_.]+$/g,"",);
	return safeValue || "unnamed";
}

function snapshotTestFolders(testInfo: TestInfo,): string[] {
	const testPathSegments = testInfo.file.split(/[\\/]/,);
	const corpSourceIndex = testPathSegments.lastIndexOf("corp-src",);
	const testDirectories = testPathSegments
		.slice(corpSourceIndex + 1, -1,)
		.map((segment,) => safePathSegment(segment,),);
	const testFile = safePathSegment(testPathSegments.at(-1)?.replace(/\.spec\.tsx?$/, "",) ?? "unnamed",);

	return [...testDirectories, testFile,];
}

// Waits for visual stability and compares against a stored screenshot baseline.
export async function expectPageSnapshot(page: Page, testInfo: TestInfo, snapshotName: string, options: PageSnapshotOptions,): Promise<void> {
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.locator("body").evaluate(async () => {
	await document.fonts?.ready;}).catch(() => undefined);
	await page.waitForTimeout(300).catch(() => undefined);

	const normalizedSnapshotName = snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`;
	const viewportFolder = safePathSegment(options.viewportName,);
	const relativeSnapshotPath = ["corp-src", "snapshots", ...snapshotTestFolders(testInfo,), viewportFolder, normalizedSnapshotName,];
	const expectedSnapshotPath = testInfo.snapshotPath(...relativeSnapshotPath,);
	const baselineExists = fs.existsSync(expectedSnapshotPath,);

	if (!baselineExists && testInfo.config.updateSnapshots === "missing") {
		console.info(["","Generating missing baseline snapshot:",expectedSnapshotPath,"",].join("\n"),);
	}

	await expect(page).toHaveScreenshot(
		relativeSnapshotPath,
		{
			fullPage: false,
			animations: "disabled",
			caret: "hide",
			maxDiffPixelRatio: 0.02,
			mask: options.mask ?? [],
        	maskColor: "rgb(0, 0, 0)",
		},
	);
}

// takes snapshot of a specific card element, rather than the whole page
export async function expectCardSnapshot(page: Page, card: Locator, testInfo: TestInfo, snapshotName: string, options: PageSnapshotOptions,): Promise<void> {
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.locator("body").evaluate(async () => document.fonts?.ready).catch(() => undefined);
	await page.waitForTimeout(300).catch(() => undefined);

	const normalizedSnapshotName = snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`;
	const viewportFolder = safePathSegment(options.viewportName,);
	const relativeSnapshotPath = ["corp-src", "snapshots", ...snapshotTestFolders(testInfo,), viewportFolder, normalizedSnapshotName,];
	const originalStyle = await card.evaluate((element,) => element.getAttribute("style"),);
	const screenshotStyle = await page.addStyleTag({
		content: "html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }",
	},);

	try {
		await card.evaluate((element,) => {
			const cardElement = element as HTMLElement;
			cardElement.style.position = "fixed";
			cardElement.style.inset = "0";
			cardElement.style.width = "100vw";
			cardElement.style.height = "auto";
			cardElement.style.maxWidth = "100vw";
			cardElement.style.maxHeight = "none";
			cardElement.style.overflow = "visible";
			cardElement.style.zIndex = "2147483647";
			cardElement.style.borderRadius = "0";
		},);

		await expect(card).toHaveScreenshot(relativeSnapshotPath, {
			animations: "disabled",
			caret: "hide", 
			maxDiffPixelRatio: 0.02,
			mask: options.mask ?? [],
			maskColor: "rgb(0, 0, 0)",
		},);
	} finally {
		await screenshotStyle.evaluate((element,) => element.parentNode?.removeChild(element),);
		await card.evaluate((element, style,) => {
			if (style === null) {
				element.removeAttribute("style");
			} else {
				element.setAttribute("style", style,);
			}
		}, originalStyle,);
	}
}

/* ---------------------------------------------- GITHUB LOGIN CARD ------------------------------------------------------------------*/

export async function expandGithubLoginCard(page: Page,) {
	const githubCard = page.locator("#card-github_login",);
	const introText = githubCard.getByText(/Connect your GitHub account so ZenInstaller can create the repository, environment, and secrets needed to deploy Zenblox\./i,);
	if (!(await introText.isVisible())) {await githubCard.getByText(/^GitHub login$/i,).click();}
	await expect(introText).toBeVisible();
	return githubCard;
}

/* ---------------------------------------------- AZURE LOGIN CARD ------------------------------------------------------------------*/

export async function expandAzureLoginCard(page: Page) {
	const azureCard = page.locator("#card-azure_login");
	const introText = azureCard.getByText(/Sign in with Azure so we can create the app registration and cloud resources for you\./i);
	if (!(await introText.isVisible())) {await azureCard.getByText(/^Azure login$/i).click();}
	await expect(introText).toBeVisible();
	return azureCard;
}

/* ---------------------------------------------- REP ENV CARD ------------------------------------------------------------------*/

const isDebugEnabled = process.env.DEBUG?.includes('pw:api') || process.env.NODE_ENV === 'development';

export async function expandRepoCard(page: Page,) {
	const repoCard = page.locator("#card-repo",);
	const repoInput = repoCard.getByRole("combobox", { name: "Select or type repo name...", },);
	if (!(await repoInput.isVisible())) {await repoCard.getByText(/^Repository & environment$/i,).click();}
	await expect(repoInput).toBeVisible();
	return repoCard;
}

export async function chooseRepoOption(page: Page, card: Locator, reponame: string) {
	const repoInput = card.getByRole("combobox", { name: "Select or type repo name...", });
	await repoInput.click();
	await waitForLocatorContentLoaded(page.getByRole("option",), "No options", "Repo list", 5000000);
	await repoInput.fill(reponame);
	const escapedRepoName = reponame.replace(/[.*+?^${}()|[\]\\]/g, "\\$&",);
	const alreadyClonedOption = page.getByRole("option", { name: new RegExp(`^(?:▪\\s*)?${escapedRepoName}$`, "i",), });
	const cloneOption = page.getByRole("option", { name: new RegExp(`^Clone as [\"'“‘]${escapedRepoName}[\"'”’]$`,), });

	await expect(alreadyClonedOption.or(cloneOption),).toBeVisible();
	if (await alreadyClonedOption.isVisible()) {
		throw new Error(`The repo "${reponame}" already exists. Please delete it from your GitHub account before running this test.`);
	}

	await expectVisibleWithin(cloneOption, `Clone as ${reponame}`, 500,);
	await cloneOption.click();
	// Confirm the option click changed the application's state.
	await expect(cloneOption).toBeHidden();
	await expect(repoInput).toHaveAttribute("aria-expanded", "false");
	await expectVisibleWithin(card.getByText("Clone from template",), "Clone from template", 500,);
	await expect(card.getByRole("button", { name: "Clone Repository" }),).toBeVisible();
	await expect(card.getByRole("switch", { name: "Private" }),).toBeChecked();
	await expect(card.getByRole("switch", { name: "Clone all branches" }),).not.toBeChecked();
	await expect(card.getByRole("switch", { name: "Create environments" }),).toBeChecked();
	await expect(card.getByText(/Pick the environment to configure/i),).toHaveCount(0);
}

export async function logMockAPI(page: Page, route: Route, status: number, body: unknown) {
	const message = `Mock Route Method : ${route.request().method()} , URL : ${route.request().url()} | Fulfilled with ${status} | Body: ${body}`;
	if (isDebugEnabled) { console.log(message) }
}

export async function expectVisibleWithin(locator: Locator, label: string, timeoutMs = 500,) {
	const start = performance.now();
	try {
		await expect(locator,).toBeVisible({ timeout: timeoutMs, });
	} finally {
		const elapsedMs = performance.now() - start;
		console.log(`${label} visible in ${elapsedMs.toFixed(1)}ms (timeout ${timeoutMs}ms)`,);
	}
}

export async function waitForLocatorContentLoaded(locator: Locator, emptyPlaceholder = "No options", label: string, timeoutMs = 500,) {
	await expect.poll(async () => {
		const texts = (await locator.allTextContents()).map((value,) => value.trim()).filter(Boolean,);
		if (!texts.length) {
			return false;
		}
		if (texts.length === 1 && texts[0] === emptyPlaceholder) {
			return false;
		}
		return true;
	}, {
		timeout: timeoutMs,
		message: `${label} content did not load`,
	}).toBeTruthy();
}
