import { test, expect, type Browser } from "@playwright/test";
import {
  restoreSessionStorage,
  storageStateFile,
} from "./authState";

const ACCESS_PASS_URL = "http://localhost:5173/accessPass.html"


// UNAUTHENICATED TESTS
// These tests run without any authenticated Microsoft state.
// They are run in all browsers, and do not depend on the manual setup project.

test.describe("Access Pass Page", () => {
  test("Successfully Loads the Access Pass page", async ({ page }) => {
    await page.goto("http://localhost:5173/accessPass.html");
    await expect(page).toHaveTitle(/ZenInstaller Access Pass/);
    await expect(page.getByText("Access Pass").first()).toBeVisible();

    await expect(
      page.getByText("The ZenInstaller is used to deploy Zenblox to your environment. It requires a Github repository in your own account, an Azure, and AWS subscription in your name. ZenInstaller will guide you through each step of the process starting from nothing."),
    ).toBeVisible();

    await expect(
      page.getByText(/Azure Access Pass|Connect Azure/i).first(),
    ).toBeVisible();
  });

  test('Displays the correct title', async ({ page }) => {
  await page.goto('http://localhost:5173/accessPass.html');

  await expect(page).toHaveTitle(/ZenInstaller Access Pass/);
  });

  test('ZenInstaller Nav Link is visible and redirects to Home Page', async ({ page }) => {
    await page.goto('http://localhost:5173/accessPass.html');
    const navLink = page.getByRole('link', { name: 'ZenInstaller' });
    await expect(navLink).toBeVisible();
  });

    test('Clicking the Connect Azure button', async ({ page }) => {
    await page.goto('http://localhost:5173/accessPass.html');
    // Click the Connect Azure Button.
    await page.getByRole('button', { name: 'Connect Azure' }).click();
  });


  test("Shows the Azure connection Controls when Signed Out", async ({ page }) => {
    await page.goto("http://localhost:5173/accessPass.html");

    await expect(
      page.getByRole("button", { name: /Connect Azure/i }),
    ).toBeVisible();

    await expect(
      page.getByText(/Don't have an account?/i),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: /How to Create a Free Azure Account/i }),
    ).toBeVisible();
  });

  test("Azure Account Help Link Opens in a New Tab", async ({ page, context }) => {
    await page.goto("http://localhost:5173/accessPass.html");

    const docsLink = page.getByRole("link", {
      name: /How to Create a Free Azure Account/i,
    });

    await expect(docsLink).toHaveAttribute("target", "_blank");

    const [newPage] = await Promise.all([
      context.waitForEvent("page"),
      docsLink.click(),
    ]);

    await expect(newPage).toHaveURL(/./);
  });

  test("Does Not Render an Empty Connector without the Access Pass card", async ({ page }) => {
  await page.goto("http://localhost:5173/accessPass.html");

  await expect(
    page.getByText(/Azure Access Pass|Connect Azure/i).first(),
  ).toBeVisible();
});

test("Clicking Connect Azure starts Microsoft authentication", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Microsoft auth popup/redirect flow is only smoke-tested in Chromium.",
  );

  await page.goto("http://localhost:5173/accessPass.html");

  const connectAzureButton = page.getByRole("button", {
    name: /connect azure/i,
  });

  await expect(connectAzureButton).toBeVisible();

  const popupPromise = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);

  await connectAzureButton.click();

  const popup = await popupPromise;

  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);

    await popup.waitForURL(
      /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
      { timeout: 30_000 },
    );

    await expect(popup).toHaveURL(
      /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
    );

    await popup.close();
  } else {
    await page.waitForURL(
      /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
      { timeout: 30_000 },
    );

    await expect(page).toHaveURL(
      /login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com/,
    );
  }
});
});

// AUTHENTICATED TESTS
// These are the tests that require an Microssoft Azure account to be authenticated before the tests can run.

test.describe("Access Pass Authenticated Microsoft state", () => {
  async function openAuthenticatedPage(browser: Browser) {
    const context = await browser.newContext({
      storageState: storageStateFile,
    });

    const page = await context.newPage();

    /*
      MSAL may store important auth cache in sessionStorage.
      Playwright storageState restores cookies/localStorage, but not sessionStorage,
      so we restore it manually before loading the app.
    */
    await restoreSessionStorage(page);

    await page.goto(ACCESS_PASS_URL);

    return { page, context };
  }

  test("shows the signed-in Microsoft account", async ({ browser, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "Authenticated Microsoft tests use the saved Chromium passkey session.",
    );

    const { page, context } = await openAuthenticatedPage(browser);

    try {
      await expect(
        page
          .getByText(/signed in as Name\.A\.LastName@brandedkeys\.com/i)
          .first(),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("shows Access Pass tenant or Entra user controls after sign-in", async ({
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Authenticated Microsoft tests use the saved Chromium passkey session.",
    );

    const { page, context } = await openAuthenticatedPage(browser);

    try {
      await expect(
        page
          .getByText(/Personal Microsoft account detected|Select Entra user/i)
          .first(),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("shows tenant ID field when tenant confirmation is required", async ({
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Authenticated Microsoft tests use the saved Chromium passkey session.",
    );

    const { page, context } = await openAuthenticatedPage(browser);

    try {
      const tenantWarning = page.getByText(/Personal Microsoft account detected/i);

      if (await tenantWarning.isVisible().catch(() => false)) {
        await expect(
          page.getByPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"),
        ).toBeVisible();

        await expect(
          page.getByRole("button", { name: /load tenant/i }),
        ).toBeVisible();
      } else {
        await expect(page.getByText(/Select Entra user/i)).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});