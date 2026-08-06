import {expect, test,} from "@playwright/test";
import {CORP_URL, viewports,} from "../../testInit";
import {expectPageSnapshot,} from "../testHelper";

type NavLinkCase = {
	label: string;
	expectedPath: string;
	snapshotName: string;
};

const navLinkCases: NavLinkCase[] = [
	{label: "Access Pass", expectedPath: "/accessPass.html", snapshotName: "redirect-access-pass.png",},
	{label: "Private Account", expectedPath: "/privAccount.html", snapshotName: "redirect-private-account.png",},
	{label: "AWS Hosting", expectedPath: "/awsHosting.html", snapshotName: "redirect-aws-hosting.png",},
	{label: "Cost Management", expectedPath: "/costManagement.html", snapshotName: "redirect-cost-management.png",},
	{label: "User Access", expectedPath: "/userAccess.html", snapshotName: "redirect-user-access.png",},
];

for (const [viewportName, viewport] of Object.entries(viewports)) {
	test.describe(`Corp-${viewportName} - Navbar Link Redirects`, () => {
		test.use({viewport, deviceScaleFactor: 1,});

		test.beforeEach(async ({page,}, testInfo) => {
			await page.goto(CORP_URL);
		});

		test(`Initial page render`, async ({page,}, testInfo) => {
			await expectPageSnapshot(
				page,
				testInfo,
				"initial-before-test.png",
				{userId: "signed-out", viewportName, testFolder: "Link Redirects",},
			);
		});

		for (const navLink of navLinkCases) {
			test(`Redirects via ${navLink.label}`, async ({page,}, testInfo) => {
				if (viewportName === "Mobile") {
					await page.locator("button:has(svg[data-testid='MenuIcon'])").click();
				}

				const targetLink = page.getByRole("link", {name: navLink.label, exact: true,});
				await expect(targetLink).toBeVisible();

				await Promise.all([
					page.waitForURL(new RegExp(`${navLink.expectedPath.replace("/", "\\/")}$`),),
					targetLink.click(),
				]);

				await expect(page).toHaveURL(new RegExp(`${navLink.expectedPath.replace("/", "\\/")}$`),);

				await expectPageSnapshot(
					page,
					testInfo,
					navLink.snapshotName,
					{userId: "signed-out", viewportName, testFolder: "Link Redirects",},
				);
			});
		}
	});
}
