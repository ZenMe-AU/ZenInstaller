import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import type { UseAzureAccount } from "../hooks/useAzureAccount";
import { useAzureLoginCard, type UseAzureLoginCard } from "../hooks/useAzureLoginCard";

const { mockHooks } = vi.hoisted(() => ({
	mockHooks: {
		useAzureAccount: vi.fn(),
	},
}));

vi.mock("../hooks/useAzureAccount", () => ({
	useAzureAccount: mockHooks.useAzureAccount,
}));

vi.mock("../config/azureConfig", () => ({
	AZURE_CLIENT_ID: "client-id",
}));

function HookHarness(props: { onUpdate: (value: UseAzureLoginCard) => void; savedTenantId: string }) {
	const value = useAzureLoginCard({ savedTenantId: props.savedTenantId });
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useAzureLoginCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("applies a saved tenant and exposes the projected login state", async () => {
		const selectTenant = vi.fn();
		const mockedAccount = {
			username: "org@example.com",
			homeAccountId: "home",
			tenantId: "tenant-home",
			tenantProfiles: new Map([["tenant-1", {}]]),
		} as AccountInfo;
		const mockedAzureAccount = {
			account: mockedAccount,
			confirmedTenantId: "tenant-1",
			manualTenantId: "tenant-1",
			selectTenant,
			tenants: [{ tenantId: "tenant-1", displayName: "Tenant One" }],
			tenantsLoaded: true,
			login: vi.fn(),
			logout: vi.fn(),
			refresh: vi.fn(),
			loggingIn: false,
			loginError: null,
			setManualTenantId: vi.fn(),
			tenantIdError: null,
		} satisfies UseAzureAccount;
		mockHooks.useAzureAccount.mockReturnValue(mockedAzureAccount);

		let latest: UseAzureLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(<HookHarness savedTenantId="tenant-1" onUpdate={(value) => { latest = value; }} />);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(selectTenant).toHaveBeenCalledWith("tenant-1");
		expect(latest?.cardId).toBe("azure_login");
		expect(latest?.status).toBe("complete");
		expect(latest?.summary).toBe("org@example.com · Tenant One");
		expect(latest?.done).toBe(true);
		expect(latest?.cardDependencyLabel).toBe("Select a tenant");
		expect(latest?.restore.tenant.apply("Tenant One")).toBe(true);

		await act(async () => {
			root.unmount();
		});
	});
});