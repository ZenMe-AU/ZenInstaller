import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { useAzureAccount, type UseAzureAccount } from "../hooks/useAzureAccount";

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		getMsal: vi.fn(),
		listTenants: vi.fn(),
		getToken: vi.fn(),
	},
}));

vi.mock("../api/msal", () => ({
	getMsal: apiMocks.getMsal,
}));

vi.mock("../api/azureGraph", () => ({
	MSA_TENANT: "msa-tenant",
	listTenants: apiMocks.listTenants,
	getToken: apiMocks.getToken,
}));

vi.mock("../config/azureConfig", () => ({
	LOGIN_SCOPES: ["login.scope"],
	ARM_SCOPES: ["arm.scope"],
}));

function HookHarness(props: { onUpdate: (value: UseAzureAccount) => void }) {
	const value = useAzureAccount();
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useAzureAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.listTenants.mockResolvedValue([{ tenantId: "tenant-1", displayName: "Tenant One" }]);
		apiMocks.getToken.mockResolvedValue("arm-token");
	});

	it("restores an existing account, confirms ARM, and supports login/logout", async () => {
		const account = {
			username: "org@example.com",
			tenantId: "tenant-1",
			homeAccountId: "home",
			environment: "login.microsoftonline.com",
			localAccountId: "local",
		} as AccountInfo;
		const msal = {
			handleRedirectPromise: vi.fn().mockResolvedValue(null),
			getAllAccounts: vi.fn().mockReturnValue([account]),
			loginRedirect: vi.fn().mockResolvedValue(undefined),
			acquireTokenSilent: vi.fn().mockResolvedValue(undefined),
			clearCache: vi.fn().mockResolvedValue(undefined),
		};
		apiMocks.getMsal.mockResolvedValue(msal);

		let latest: UseAzureAccount | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(latest?.account?.username).toBe("org@example.com");
		expect(latest?.tenants).toEqual([{ tenantId: "tenant-1", displayName: "Tenant One" }]);
		expect(latest?.confirmedTenantId).toBe("");
		expect(latest?.tenantsLoaded).toBe(true);
		expect(latest?.loggingIn).toBe(false);

		await act(async () => {
			await latest?.login();
		});
		expect(msal.loginRedirect).toHaveBeenCalled();

		await act(async () => {
			await latest?.logout();
		});
		expect(msal.clearCache).toHaveBeenCalled();
		expect(latest?.account).toBeNull();

		await act(async () => {
			root.unmount();
		});
	});
});