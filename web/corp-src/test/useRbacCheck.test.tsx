import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRbacCheck, type RbacCheckResult } from "../hooks/util/useRbacCheck";
import type { AzureAccount } from "../types";

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		getExistingSP: vi.fn(),
		hasRbacRole: vi.fn(),
	},
}));

vi.mock("../api/azureGraph", () => ({
	getExistingSP: apiMocks.getExistingSP,
	hasRbacRole: apiMocks.hasRbacRole,
}));

function HookHarness(props: { onUpdate: (value: RbacCheckResult) => void } & Parameters<typeof useRbacCheck>[0]) {
	const value = useRbacCheck(props);
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useRbacCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const azureAccount: AzureAccount = {
		homeAccountId: "home-1",
		environment: "login.microsoftonline.com",
		tenantId: "tenant-1",
		username: "admin@example.com",
		localAccountId: "local-1",
	};

	it("reports ready when the service principal has both roles", async () => {
		apiMocks.getExistingSP.mockResolvedValue({ id: "sp-1" });
		apiMocks.hasRbacRole.mockResolvedValue(true);

		let latest: RbacCheckResult | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
					azureAccount={azureAccount}
					spClientId="client-1"
					subscriptionId="sub-1"
					tenantId="tenant-1"
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(latest).toEqual({ status: "ready", missingRoles: [] });

		await act(async () => {
			root.unmount();
		});
	});

	it("reports missing roles when RBAC is incomplete", async () => {
		apiMocks.getExistingSP.mockResolvedValue({ id: "sp-1" });
		apiMocks.hasRbacRole.mockImplementation(async (_acc: unknown, _sub: string, _sp: string, role: string) => role !== "Contributor");

		let latest: RbacCheckResult | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
					azureAccount={azureAccount}
					spClientId="client-1"
					subscriptionId="sub-1"
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(latest).toEqual({ status: "missing-role", missingRoles: ["Contributor"] });

		await act(async () => {
			root.unmount();
		});
	});
});
