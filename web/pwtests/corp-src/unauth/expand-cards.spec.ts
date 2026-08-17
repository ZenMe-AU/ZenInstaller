import path from "node:path";
import {mkdir,} from "node:fs/promises";
import {fileURLToPath,} from "node:url";
import {expect, test, type Page,} from "@playwright/test";
import {CORP_URL, viewports,} from "../../testInit";

const CARD_SNAPSHOT_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url),),
	"../snapshots/unauth/expand-cards",
);

const CARDS_UNAUTHENTICATED = [
	{id: "github_login", title: /^GitHub login$/i,},
	{id: "azure_login", title: /^Azure login$/i,},
	{id: "repo", title: /^Repository & environment$/i,},
	{id: "azure_subscription", title: /^Choose Azure subscription$/i,},
	{id: "access_pass", title: /^Access pass$/,},
	{id: "company_info", title: /^Company info$/i,},
	{id: "azure_app_registration", title: /^Register ZenInstaller in Azure$/i,},
	{id: "core_infra", title: /^Core infrastructure$/i,},
	{id: "create_domain", title: /^Corp domain$/i,},
	{id: "global_groups", title: /^Global groups$/i,},
	{id: "aws_login", title: /^AWS login$/i,},
	{id: "aws_setup", title: /^AWS setup$/i,},
	{id: "stage_c01", title: /^c01subscription$/i,},
	{id: "stage_c02", title: /^c02globalGroups$/i,},
	{id: "stage_c07", title: /^c07userAccounts$/i,},
	{id: "stage_c20", title: /^c20awsentrasso$/i,},
	{id: "stage_c21", title: /^c21awsentrassoP2$/i,},
	{id: "stage_c25", title: /^c25cloudfront$/i,},
] as const;

const UNLOCKED_CARD_IDS = new Set(["github_login", "azure_login", "aws_login",],);

function expandedContent(card: ReturnType<Page["locator"]>, id: string,) {
	switch (id) {
		case "github_login":
			return card.getByRole("button", {name: "Backend", exact: true,},);
		case "azure_login":
			return card.getByText(/Sign in with Azure so we can create the app registration and cloud resources for you\./i,);
		case "aws_login":
			return card.getByLabel("Access Key ID",);
		default:
			return card.getByText(/Complete these first/i,);
	}
}

async function expandAllCards(page: Page,) {
	for (const {id, title,} of CARDS_UNAUTHENTICATED) {
		const card = page.locator(`#card-${id}`,);
		await card.scrollIntoViewIfNeeded();
		const expandedCheck = expandedContent(card, id,);
		if (!(await expandedCheck.isVisible())) {
			await card.getByText(title,).click();
		}
		await expect(expandedCheck).toBeVisible();
	}
}

async function snapshotCard(page: Page, viewportName: string, id: string,) {
	const card = page.locator(`#card-${id}`,);
	const viewportSnapshotDir = path.join(CARD_SNAPSHOT_DIR, viewportName,);
	await mkdir(viewportSnapshotDir, {recursive: true,},);
	const originalStyle = await card.evaluate((element,) => element.getAttribute("style"),);

	try {
		await card.evaluate((element,) => {
			const cardElement = element as HTMLElement;
			cardElement.style.position = "fixed";
			cardElement.style.inset = "0";
			cardElement.style.width = "100vw";
			cardElement.style.height = "100vh";
			cardElement.style.maxWidth = "100vw";
			cardElement.style.maxHeight = "100vh";
			cardElement.style.overflow = "auto";
			cardElement.style.zIndex = "2147483647";
			cardElement.style.borderRadius = "0";
		},);
		await card.screenshot({
			path: path.join(viewportSnapshotDir, `${id}.png`),
			animations: "disabled",
		});
	} finally {
		await card.evaluate((element, style,) => {
			if (style === null) {
				element.removeAttribute("style");
			} else {
				element.setAttribute("style", style);
			}
		}, originalStyle,);
	}
}

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Corp-${viewportName} - Render`, () => {
		test.use({viewport, deviceScaleFactor: 1,});

		test.beforeEach(async ({page,}) => {
			await page.goto(CORP_URL);
		});

		test("Renders unauthenticated corp dashboard", async ({page,}) => {
			await expect(page).toHaveURL(/http:\/\/localhost:5173\/?$/,);
			await expect(page).toHaveTitle(/ZenInstaller Setup Central Corp Environment/i,);

			await expect(
				page.getByText(
					/ZenInstaller is used to create your organisation configuration on a number of cloud hosting providers/i,
				),
			).toBeVisible();

			if (viewportName === "Desktop") {
				await expect(page.getByRole("link", {name: "Access Pass",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "Private Account",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "AWS Hosting",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "Cost Management",}),).toBeVisible();
				await expect(page.getByRole("link", {name: "User Access",}),).toBeVisible();
			}

			for (const {id, title,} of CARDS_UNAUTHENTICATED) {
				await expect(page.locator(`#card-${id}`,).getByText(title,),).toBeVisible();
			}
			await expect(page.getByText(/^Connect your GitHub account$/),).toBeVisible();
		});

		test("Can expand all cards while unauthenticated", async ({page,}) => {
			await expandAllCards(page,);

			await expect(
				page.locator("#card-github_login",).getByRole("button", {name: "Backend", exact: true,},),
			).toBeVisible();

			for (const {id,} of CARDS_UNAUTHENTICATED.filter(({id,},) => !UNLOCKED_CARD_IDS.has(id,),)) {
				await expect(
					page.locator(`#card-${id}`,).getByText(/Complete these first/i,),
				).toBeVisible();
			}

			for (const {id,} of CARDS_UNAUTHENTICATED) {
				await snapshotCard(page, viewportName, id,);
			}
		});
	});
}
