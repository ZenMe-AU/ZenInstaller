import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "fs";

export type PageSnapshotOptions = {
	userId: string;
	viewportName: string;
	testFolder?: string;
	mask?: Locator[];
  	stabilizeAuth?: boolean;
};

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

// Waits for visual stability and compares against a stored screenshot baseline.
export async function expectPageSnapshot(
	page: Page,
	testInfo: TestInfo,
	snapshotName: string,
	options: PageSnapshotOptions,
): Promise<void> {
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.locator("body").evaluate(async () => {
	await document.fonts?.ready;}).catch(() => undefined);
	await page.waitForTimeout(300).catch(() => undefined);

	const normalizedSnapshotName = snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`;
	const testPathSegments = testInfo.file.split(/[\\/]/,);
	const testDirectory = safePathSegment(testPathSegments.at(-2) ?? "unnamed",);
	const testFile = safePathSegment(testPathSegments.at(-1)?.replace(/\.spec\.tsx?$/, "") ?? "unnamed",);
	const viewportFolder = safePathSegment(options.viewportName,);
	const relativeSnapshotPath = ["corp-src", "snapshots", testDirectory, testFile, viewportFolder, normalizedSnapshotName,];
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
export async function expectCardSnapshot(
	page: Page,
	card: Locator,
	testInfo: TestInfo,
	snapshotName: string,
	options: PageSnapshotOptions,
): Promise<void> {
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.locator("body").evaluate(async () => document.fonts?.ready).catch(() => undefined);
	await page.waitForTimeout(300).catch(() => undefined);

	const normalizedSnapshotName = snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`;
	const testPathSegments = testInfo.file.split(/[\\/]/,);
	const testDirectory = safePathSegment(testPathSegments.at(-2) ?? "unnamed",);
	const testFile = safePathSegment(testPathSegments.at(-1)?.replace(/\.spec\.tsx?$/, "",) ?? "unnamed",);
	const viewportFolder = safePathSegment(options.viewportName,);
	const relativeSnapshotPath = ["corp-src", "snapshots", testDirectory, testFile, viewportFolder, normalizedSnapshotName,];
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
