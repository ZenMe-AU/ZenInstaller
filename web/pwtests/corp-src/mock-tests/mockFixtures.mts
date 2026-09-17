import type { BrowserContext, Page, Route } from "@playwright/test";

const mockUser = { login: "mock-user", id: 12345 };
const mockTenantId = "00000000-0000-0000-0000-000000000001";
const mockSubscriptionId = "mock-subscription";
const mockAppId = "00000000-0000-0000-0000-000000000002";
const mockAppObjectId = "00000000-0000-0000-0000-000000000003";
const mockSpObjectId = "00000000-0000-0000-0000-000000000004";

type MockGitHubOptions = {
	initialVariables?: Record<string, string>;
};

export type MockGitHubState = {
	variables: Record<string, string>;
	repositoryName: string | null;
	branches: Set<string>;
};

export type MockAzureState = {
	appDisplayName: string | null;
	servicePrincipalCreated: boolean;
	federatedSubjects: Set<string>;
	rbacAssigned: boolean;
};

async function json(route: Route, body: unknown, status = 200) {
	await route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});
}

export async function installMockGitHub(
	page: Page,
	context: BrowserContext,
	options: MockGitHubOptions = {},
): Promise<MockGitHubState> {
	await context.addInitScript(() => {
		sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "direct", token: "ghp_mock" }));
	});

	const state: MockGitHubState = {
		variables: { ...options.initialVariables },
		repositoryName: null,
		branches: new Set(["main"]),
	};

	await page.route("https://api.github.com/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;

		if (["HEAD", "OPTIONS"].includes(request.method())) {
			await route.continue();
			return;
		}

		if (path === "/user" && request.method() === "GET") return json(route, mockUser);
		if (path === "/user/orgs" && request.method() === "GET") return json(route, []);
		if (/^\/(?:user\/repos|orgs\/[^/]+\/repos)$/.test(path) && request.method() === "GET") {
			const repositories = [
				{ id: 111111, name: "existing-unrelated-repo", owner: { type: "User" } },
			];
			if (state.repositoryName) {
				repositories.push({
					id: 987654321,
					name: state.repositoryName,
					owner: { type: "User" },
				});
			}
			return json(route, repositories);
		}
		if (path === "/repos/ZenMe-AU/ZenbloxCore/generate" && request.method() === "POST") {
			const body = request.postDataJSON() as { name: string };
			state.repositoryName = body.name;
			return json(route, { id: 987654321, name: body.name }, 201);
		}
		const variableMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/environments\/[^/]+\/variables(?:\/([^/]+))?$/);
		if (variableMatch) {
			const variableName = variableMatch[1];
			if (request.method() === "GET") {
				return json(route, {
					total_count: Object.keys(state.variables).length,
					variables: Object.entries(state.variables).map(([name, value]) => ({ name, value })),
				});
			}
			if (request.method() === "POST") {
				const body = request.postDataJSON() as { name: string; value: string };
				state.variables[body.name] = body.value;
				return json(route, {}, 201);
			}
			if (request.method() === "PATCH" && variableName) {
				const body = request.postDataJSON() as { value: string };
				state.variables[variableName] = body.value;
				return json(route, {});
			}
			if (request.method() === "DELETE" && variableName) {
				delete state.variables[variableName];
				return route.fulfill({ status: 204 });
			}
		}
		if (path.includes("/environments") && request.method() === "GET") {
			return json(route, { total_count: 2, environments: [
				{ name: "PROD", id: 1001 },
				{ name: "TEST", id: 1002 },
			] });
		}
		if (/\/environments\/(?:PROD|TEST)$/.test(path) && request.method() === "PUT") return json(route, {});
		if (path.endsWith("/branches") && request.method() === "GET") {
			return json(route, Array.from(state.branches, (name) => ({
				name,
				commit: { sha: `${name.toLowerCase()}-mock-sha` },
				protected: name === "main",
			})));
		}
		if (/\/git\/ref\/heads\/[^/]+$/.test(path) && request.method() === "GET") {
			const branch = path.split("/").pop() ?? "main";
			return json(route, { object: { sha: `${branch.toLowerCase()}-mock-sha` } });
		}
		if (path.endsWith("/git/refs") && request.method() === "POST") {
			const body = request.postDataJSON() as { ref: string };
			state.branches.add(body.ref.replace("refs/heads/", ""));
			return json(route, {}, 201);
		}
		if (path.endsWith("/actions/oidc/customization/sub") && request.method() === "PUT") {
			return json(route, {});
		}
		if (request.method() === "GET" && path.startsWith("/repos/")) {
			return json(route, {
				id: 987654321,
				name: state.repositoryName ?? path.split("/")[3],
				template_repository: { full_name: "ZenMe-AU/ZenbloxCore" },
			});
		}
		if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
			throw new Error(`Unexpected GitHub write request blocked: ${request.method()} ${request.url()}`);
		}
		await route.abort("blockedbyclient");
	});

	return state;
}

export async function installMockBackend(page: Page, context?: BrowserContext) {
	if (context) {
		await context.addInitScript(() => {
			sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "backend" }));
		});
	}
	const variables: Record<string, string> = {};
	await page.route("http://localhost:7071/**", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (path === "/getUser") return json(route, { user: mockUser });
		if (path === "/getOrgs") return json(route, { orgList: [] });
		if (path === "/getRepos") return json(route, { repoList: [] });
		if (path === "/checkTemplate") return json(route, { isTemplate: true, templateName: "ZenMe-AU/ZenbloxCore" });
		if (path === "/getBranches") return json(route, { branches: [] });
		if (path === "/generateRepo") {
			return json(route, {
				data: { id: 987654321, name: "mock-repository" },
				envSuccess: true,
				results: { envs: [] },
			}, 200);
		}
		if (path === "/createBranch") {
			return json(route, { branch: { name: "PROD", commit: "mock-sha", protected: false } });
		}
		if (path === "/getVariables") return json(route, { variables });
		if (path === "/createVariable" || path === "/updateVariable") {
			const body = request.postDataJSON() as { name: string; value: string };
			variables[body.name] = body.value;
			return json(route, {});
		}
		if (path === "/deleteVariable") {
			const body = request.postDataJSON() as { name: string };
			delete variables[body.name];
			return json(route, {});
		}
		if (path === "/logout") return json(route, {});
		return json(route, {});
	});
}

export async function installMockAzure(page: Page): Promise<MockAzureState> {
	const state: MockAzureState = {
		appDisplayName: null,
		servicePrincipalCreated: false,
		federatedSubjects: new Set(),
		rbacAssigned: false,
	};

	await page.route("https://management.azure.com/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/subscriptions")) {
			return json(route, {
				value: [{ subscriptionId: mockSubscriptionId, displayName: "Mock subscription", tenantId: mockTenantId, state: "Enabled" }],
			});
		}
		if (path.endsWith("/tenants")) {
			return json(route, { value: [{ tenantId: mockTenantId, displayName: "Mock tenant" }] });
		}
		if (path.includes("/roleAssignments") && route.request().method() === "GET") {
			return json(route, {
				value: state.rbacAssigned
					? [{ properties: { roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/acdd72a7-3385-48ef-bd42-f606fba81ae7" } }]
					: [],
			});
		}
		if (path.includes("/roleAssignments/") && route.request().method() === "PUT") {
			state.rbacAssigned = true;
			return json(route, {});
		}
		return json(route, {});
	});
	await page.route("https://graph.microsoft.com/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		if (path === "/v1.0/applications" && request.method() === "GET") {
			const filter = url.searchParams.get("$filter") ?? "";
			if (filter.startsWith("displayName eq")) {
				return json(route, {
					value: state.appDisplayName ? [{ appId: mockAppId, id: mockAppObjectId }] : [],
				});
			}
			if (filter.startsWith("appId eq")) {
				return json(route, { value: state.appDisplayName ? [{ displayName: state.appDisplayName }] : [] });
			}
		}
		if (path === "/v1.0/applications" && request.method() === "POST") {
			const body = request.postDataJSON() as { displayName: string };
			state.appDisplayName = body.displayName;
			return json(route, { appId: mockAppId, id: mockAppObjectId }, 201);
		}
		if (path === "/v1.0/servicePrincipals" && request.method() === "GET") {
			return json(route, { value: state.servicePrincipalCreated ? [{ id: mockSpObjectId }] : [] });
		}
		if (path === "/v1.0/servicePrincipals" && request.method() === "POST") {
			state.servicePrincipalCreated = true;
			return json(route, { id: mockSpObjectId }, 201);
		}
		if (path.endsWith("/federatedIdentityCredentials") && request.method() === "GET") {
			return json(route, { value: Array.from(state.federatedSubjects, (subject) => ({ subject })) });
		}
		if (path.endsWith("/federatedIdentityCredentials") && request.method() === "POST") {
			const body = request.postDataJSON() as { subject: string };
			state.federatedSubjects.add(body.subject);
			return json(route, {}, 201);
		}
		if (request.method() === "GET") return json(route, { value: [] });
		return json(route, {}, 201);
	});

	return state;
}

export async function signInMockAzure(page: Page) {
	const localUrl = page.url();
	await page.route("https://login.microsoftonline.com/**", async (route) => {
		await route.abort("blockedbyclient");
	});
	const authorizeRequest = page.waitForRequest((request) => {
		const url = new URL(request.url());
		return url.hostname === "login.microsoftonline.com" && url.searchParams.has("client_id");
	});
	await page.getByRole("button", { name: "Sign in with Azure", exact: true }).click();
	const clientId = new URL((await authorizeRequest).url()).searchParams.get("client_id");
	if (!clientId) throw new Error("The mocked Azure sign-in did not include a client ID.");

	await page.goto(localUrl);
	await page.evaluate(({ clientId, tenantId }) => {
		const environment = "login.microsoftonline.com";
		const homeAccountId = `mock-home.${tenantId}`;
		const accountKey = `msal.3|${homeAccountId}|${environment}|${tenantId}`.toLowerCase();
		const accessTokenKey = [
			"msal.3",
			homeAccountId,
			environment,
			"accesstoken",
			clientId,
			tenantId,
			"https://management.azure.com/user_impersonation",
			"",
		].join("|").toLowerCase();
		const graphTarget = [
			"https://graph.microsoft.com/application.readwrite.all",
			"https://graph.microsoft.com/approleassignment.readwrite.all",
		].join(" ");
		const graphAccessTokenKey = [
			"msal.3",
			homeAccountId,
			environment,
			"accesstoken",
			clientId,
			tenantId,
			graphTarget,
			"",
		].join("|").toLowerCase();
		const now = Math.floor(Date.now() / 1000);
		const username = "mock-user@example.com";

		for (const key of Object.keys(sessionStorage)) {
			if (key.startsWith("msal.")) sessionStorage.removeItem(key);
		}

		sessionStorage.setItem("msal.3.account.keys", JSON.stringify([accountKey]));
		sessionStorage.setItem(accountKey, JSON.stringify({
			homeAccountId,
			environment,
			realm: tenantId,
			localAccountId: "mock-user-id",
			username,
			authorityType: "MSSTS",
			name: "Mock Azure User",
			tenantProfiles: [{
				tenantId,
				localAccountId: "mock-user-id",
				username,
				name: "Mock Azure User",
				isHomeTenant: true,
			}],
		}));
		sessionStorage.setItem(`msal.3.token.keys.${clientId}`, JSON.stringify({
			idToken: [],
			accessToken: [accessTokenKey, graphAccessTokenKey],
			refreshToken: [],
		}));
		const token = {
			homeAccountId,
			credentialType: "AccessToken",
			secret: "mock-access-token",
			cachedAt: now.toString(),
			expiresOn: (now + 3600).toString(),
			extendedExpiresOn: (now + 7200).toString(),
			environment,
			clientId,
			realm: tenantId,
			target: "https://management.azure.com/user_impersonation",
			tokenType: "Bearer",
		};
		sessionStorage.setItem(accessTokenKey, JSON.stringify(token));
		sessionStorage.setItem(graphAccessTokenKey, JSON.stringify({ ...token, target: graphTarget }));
	}, { clientId, tenantId: mockTenantId });

	await page.reload();
}

export { mockSubscriptionId, mockTenantId };
