import { expect, type Page, type TestInfo,} from "@playwright/test";
import fs from "fs";

export type PageSnapshotOptions = {
	userId: string;
	viewportName: string;
	testFolder?: string;
};

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
	await page
		.waitForLoadState("domcontentloaded")
		.catch(() => undefined);

	await page
		.waitForLoadState("networkidle")
		.catch(() => undefined);

	await page
		.locator("body")
		.evaluate(async () => {
			await document.fonts?.ready;
		})
		.catch(() => undefined);

	await page
		.waitForTimeout(300)
		.catch(() => undefined);

	const userFolder = safePathSegment(options.userId,);
	const viewportFolder = safePathSegment(options.viewportName,);
	const testFolder = safePathSegment(options.testFolder ?? testInfo.title,);
	const projectName = safePathSegment(testInfo.project.name || "default",);

	const normalizedSnapshotName = snapshotName.endsWith(".png") ? snapshotName : `${snapshotName}.png`;
	const snapshotFileName = `${projectName}-${normalizedSnapshotName}`;
	const relativeSnapshotPath = ["corp-src", "snapshots", userFolder, viewportFolder, testFolder, snapshotFileName,];

	const expectedSnapshotPath = testInfo.snapshotPath(...relativeSnapshotPath,);
	const baselineExists = fs.existsSync(expectedSnapshotPath,);

	if (!baselineExists && testInfo.config.updateSnapshots === "missing") {
		console.info([
			"",
			"Generating missing baseline snapshot:",
			expectedSnapshotPath,
			"",
		].join("\n"),);
	}

	await expect(page).toHaveScreenshot(
		relativeSnapshotPath,
		{
			fullPage: false,
			animations: "disabled",
			caret: "hide",
			maxDiffPixelRatio: 0.02,
		},
	);
}
