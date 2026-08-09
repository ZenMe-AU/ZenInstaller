import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAzureSubscriptionCard, type UseAzureSubscriptionCard } from "../hooks/useAzureSubscriptionCard";
import type { AccountInfo } from "@azure/msal-browser";

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		listSubscriptions: vi.fn(),
	},
}));

vi.mock("../api/azureGraph", () => ({
	listSubscriptions: apiMocks.listSubscriptions,
}));

vi.mock("../config/azureConfig", () => ({
	AZURE_CLIENT_ID: "client-id",
}));

function HookHarness(props: { onUpdate: (value: UseAzureSubscriptionCard) => void } & Parameters<typeof useAzureSubscriptionCard>[0]) {
	const value = useAzureSubscriptionCard(props);
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useAzureSubscriptionCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.listSubscriptions.mockResolvedValue([{ id: "sub-1", displayName: "Main" }]);
	});

	it("loads subscriptions and marks a saved subscription complete", async () => {
		let latest: UseAzureSubscriptionCard | null = null;
		const root = createRoot(document.createElement("div"));
		const account = { username: "org@example.com", tenantId: "tenant-1" } as AccountInfo;

		await act(async () => {
			root.render(
				<HookHarness
					azureAccount={account}
					confirmedTenantId="tenant-1"
					manualTenantId="tenant-1"
					savedSubscriptionId="sub-1"
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(apiMocks.listSubscriptions).toHaveBeenCalledWith(account, "tenant-1");
		expect(latest?.selectedSubscriptionId).toBe("sub-1");
		expect(latest?.subscriptionLabel).toBe("Main");
		expect(latest?.status).toBe("complete");
		expect(latest?.summary).toBe("Main");
		expect(latest?.done).toBe(true);

		await act(async () => {
			expect(latest?.restore.subscription.apply("Main")).toBe(true);
		});

		await act(async () => {
			root.unmount();
		});
	});
});