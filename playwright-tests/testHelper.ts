import { expect, test, type Browser, type Locator, type Page, type TestInfo,} from "@playwright/test";
import { restoreSessionStorage } from "./authState";
import { getAccessPassUserAuth,} from "./accessPassUsers";
import type { AccessPassUser, EntraTargetUser, } from "./accessPassUsers";
import { ACCESS_PASS_URL, type ViewportSize, } from "./testInit";
import fs from "fs";

export type PageSnapshotOptions = {
  userId: string;
  viewportName: string;
  testFolder?: string;
  mask?: Locator[];
};

/**
 * Converts values such as:
 *
 * "User loads Access Pass page"
 *
 * into:
 *
 * "User-loads-Access-Pass-page"
 */
function safePathSegment(value: string,): string {
  const safeValue = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g,"-",)
    .replace(/^[-_.]+|[-_.]+$/g,"",);

  return safeValue || "unnamed";
}


/**
 * Escapes characters that have a special meaning inside regular
 * expressions.
 */
export function escapeRegExp(value: string,): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&",);
}

/**
 * Returns locators containing account information that should be
 * hidden in Playwright screenshots.
 */
export function sensitiveTextMasks(page: Page,): Locator[] {
  return [page.getByTestId("txtAzureUsername",),
    page.getByText(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,),
  ];
}

/**
 * Waits for the page to reach a stable visual state and compares it
 * against its stored screenshot baseline.
 */
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

const userFolder =
    safePathSegment(
      options.userId,
    );

  const viewportFolder =
    safePathSegment(
      options.viewportName,
    );

  const testFolder =
    safePathSegment(
      options.testFolder ??
        testInfo.title,
    );

  /*
   * Include the project in the filename because Chromium, Firefox
   * and WebKit may render differently.
   */
  const projectName =
    safePathSegment(
      testInfo.project.name ||
        "default",
    );

  const normalisedSnapshotName =
    snapshotName.endsWith(".png")
      ? snapshotName
      : `${snapshotName}.png`;

  const snapshotFileName =
    `${projectName}-${normalisedSnapshotName}`;

  const relativeSnapshotPath = [
    userFolder,
    viewportFolder,
    testFolder,
    "screenshots",
    snapshotFileName,
  ];

  const expectedSnapshotPath = testInfo.snapshotPath(...relativeSnapshotPath);

  if (!fs.existsSync(expectedSnapshotPath)) {
    console.log("");
    console.log("Snapshot baseline missing");
    console.log(`Test: ${testInfo.title}`);
    console.log(`Snapshot: ${snapshotName}`,);
    console.log(`Expected path: ${expectedSnapshotPath}`,);
    console.log("Run with --update-snapshots to approve the generated screenshot.",);
    console.log("");
  }

  await expect(page).toHaveScreenshot(
    relativeSnapshotPath,
    {
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      mask: options.mask ?? [],
      maskColor: "rgb(0, 0, 0)",
    },
  );
}

/**
 * Creates a new isolated browser context using a saved Microsoft
 * authentication state.
 */
export async function openAuthenticatedAccessPassPage(
  browser: Browser,
  user: AccessPassUser,
  viewport: ViewportSize,
) {
  const auth =getAccessPassUserAuth(user);

  const context =await browser.newContext({
      storageState:
        auth.storageStateFile,
      viewport,
      deviceScaleFactor: 1,
    });

  const page =await context.newPage();

  await restoreSessionStorage(page,auth.sessionStorageFile,);
  await page.goto(ACCESS_PASS_URL,{waitUntil: "domcontentloaded",},);
  
  return {page,context,};
}

/**
 * Confirms that the Access Pass page recognises the expected
 * authenticated Microsoft account.
 */
export async function expectAuthenticatedAccessPassState(
  page: Page,
  user: AccessPassUser,
): Promise<void> {
  await expect(page
      .getByText("Access Pass")
      .first(),
  ).toBeVisible();

  await expect(page
      .getByText(new RegExp(`signed in as ${escapeRegExp(user.email,)}`,"i",),)
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  await expect(
    page.getByText(/Azure Login/i)
      .first(),
  ).toBeVisible();

  await expect(
    page.getByText(/Azure Access Pass/i)
      .first(),
  ).toBeVisible();
}

/**
 * Gets the account used by the Connecting Azure journey.
 *
 * ACCESS_PASS_AUTH_USER can select a particular configured account.
 * Otherwise, the first configured user is returned.
 */
export function getAzureJourneyUser(users: AccessPassUser[],): AccessPassUser {
  const requestedUserId =process.env.ACCESS_PASS_AUTH_USER;

  if (requestedUserId) {
    const requestedUser =
      users.find(
        (user) =>
          user.id === requestedUserId,
      );

    if (!requestedUser) {throw new Error(`ACCESS_PASS_AUTH_USER="${requestedUserId}" was not found in access-pass-users.local.json`,);}

    return requestedUser;
  }

  const firstUser = users[0];

  if (!firstUser) {throw new Error("No Access Pass users found. Add at least one user to playwright-tests/data/access-pass-users.local.json",);}

  return firstUser;
}

/**
 * Opens the tenant editor when available, enters the configured
 * tenant ID and submits it.
 */
export async function changeTenantIdIfAvailable(
  page: Page,
  tenantId: string,
): Promise<boolean> {
  const changeTenantText =
    page
      .getByText(/change tenant id/i,)
      .first();

  if (
    await changeTenantText
      .isVisible()
      .catch(() => false)
  ) {
    await changeTenantText.click();
  }

  const tenantInput = page.getByPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",);

  if (!(await tenantInput
        .isVisible()
        .catch(() => false)
    )
  ) {
    console.log("Tenant ID input is not visible. This account may already be using an Entra tenant.",);

    return false;
  }

  await tenantInput.fill("");
  await tenantInput.fill(tenantId);

  const loadTenantButton =
    page.getByRole("button", {name: /load tenant|confirm tenant|save tenant/i,});

  await expect(loadTenantButton,).toBeEnabled();
  await loadTenantButton.click();

  return true;
}

/**
 * Confirms that the Entra user-selection section has loaded.
 */
export async function expectEntraUserListLoaded(
  page: Page,
): Promise<void> {
  await expect(page
      .getByText(/Select Entra user/i,)
      .first(),
  ).toBeVisible({timeout: 45_000,});
}

/**
 * Finds a target Entra user by UPN and returns the Create Access Pass
 * button associated with that user's table row.
 */
export async function expectEntraUserAvailable(
  page: Page,
  target: EntraTargetUser,
) {
  await expectEntraUserListLoaded(page,);

  const targetEmail = page
    .getByText(
      new RegExp(
        `^\\s*${escapeRegExp(target.email)}\\s*$`,
        "i",
      ),
    )
    .first();

  try {
    await expect(
      targetEmail,
      `Expected Entra user email to appear: ${target.email}`,
    ).toBeVisible({
      timeout: 45_000,
    });
  } catch (error) {
    const signedInText = await page
      .getByText(/signed in as/i)
      .allTextContents()
      .catch(() => []);

    const visibleText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    
    console.log("");
    console.log(`Missing target Entra user: ${target.email}`);
    console.log(`Signed-in information: ${signedInText.join(" | ")}`);
    console.log("Visible page text:");
    console.log(visibleText.slice(0, 5000));
    console.log("");

    throw error;
  }

/*
   * Find the nearest table row, ARIA row or responsive container
   * that also contains the Create Access Pass button.
   */
  const userContainer = targetEmail.locator(
    `xpath=ancestor::*[
      self::tr
      or @role='row'
      or .//button[
        contains(
          translate(
            normalize-space(.),
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            'abcdefghijklmnopqrstuvwxyz'
          ),
          'create access pass'
        )
      ]
    ][1]`,
  );

  await expect(
    userContainer,
    `Could not find the action container for ${target.email}`,
  ).toBeVisible({
    timeout: 10_000,
  });

  if (target.displayName) {
    await expect(
      userContainer.getByText(
        target.displayName,
        {
          exact: true,
        },
      ),
    ).toBeVisible();
  }

  const createAccessPassButton =
    userContainer.getByRole("button", {
      name: /create access pass/i,
    });

  await expect(
    createAccessPassButton,
  ).toBeVisible();

  await expect(
    createAccessPassButton,
  ).toBeEnabled();

  return {
    userContainer,
    createAccessPassButton,
  };
}

function getExpectedEntraMessage(
  user: AccessPassUser,): RegExp {
  if (!user.expectedEntraMessage) {
    throw new Error(`No expectedEntraMessage configured for ${user.id}.`,);
  }

  return new RegExp(user.expectedEntraMessage,"i",);
}

async function expectNoAccessPassActions(
  page: Page,
): Promise<void> {
  await expect(page.getByRole("button",{name:/create access pass/i,},),).toHaveCount(0);
}

async function expectEmptyEntraState(
  page: Page,
  user: AccessPassUser,
): Promise<void> {
  await expect(page
      .getByText(
        getExpectedEntraMessage(user, ),)
      .first(),
  ).toBeVisible({
    timeout: 45_000,
  });

  await expectNoAccessPassActions(page,);
}

async function expectForbiddenEntraState(
  page: Page,
  user: AccessPassUser,
): Promise<void> {
  await expect(
    page
      .getByText(
        getExpectedEntraMessage(
          user,
        ),
      )
      .first(),
  ).toBeVisible({
    timeout: 45_000,
  });

  await expectNoAccessPassActions(
    page,
  );
}

/**
 * Asserts the tenant result configured for an authenticated account.
 */
export async function expectConfiguredTenantOutcome(
  page: Page,
  user: AccessPassUser,
): Promise<void> {
  switch (user.expectedEntraResult) {
    case "users": {
      await expectEntraUserListLoaded(page,);
      /*
       * The fallback keeps this helper compatible while
       * targetEntraUsers remains optional in AccessPassUser.
       */
      const targets = user.targetEntraUsers ?? [];

      for (const target of targets) {
        await test.step(
          `Verify target user ${target.email}`,
          async () => {
            await expectEntraUserAvailable(
              page,
              target,
            );
          },
        );
      }

      return;
    }

    case "empty": {
      await expectEmptyEntraState(
        page,
        user,
      );

      return;
    }

    case "forbidden": {
      await expectForbiddenEntraState(
        page,
        user,
      );

      return;
    }

    default: {
      throw new Error(
        `Unsupported expected Entra result: ${String(
          user.expectedEntraResult,
        )}`,
      );
    }
  }
}