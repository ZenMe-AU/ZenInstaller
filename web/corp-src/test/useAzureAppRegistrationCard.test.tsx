import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AzureAccount } from "../types";
import {
	useAzureAppRegistrationCard,
	type UseAzureAppRegistrationCard,
} from "../hooks/useAzureAppRegistrationCard";

async function waitFor(assertion: () => void, timeoutMs = 1500) {
	const start = Date.now();
	for (;;) {
		try {
			assertion();
			return;
		} catch (error) {
			if (Date.now() - start >= timeoutMs) {
				throw error;
			}
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}
}

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		getMsal: vi.fn(),
		getExistingApp: vi.fn(),
		getAppNameByAppId: vi.fn(),
		createAppRegistration: vi.fn(),
		getExistingSP: vi.fn(),
		createServicePrincipal: vi.fn(),
		ensureFederatedCredential: vi.fn(),
		ensureRbacRole: vi.fn(),
		isConsentError: vi.fn(),
		rbacStatus: "ready" as const,
		rbacMissingRoles: [] as string[],
	},
}));

vi.mock("../api/msal", () => ({
	getMsal: apiMocks.getMsal,
}));

vi.mock("../api/azureGraph", () => ({
	getExistingApp: apiMocks.getExistingApp,
	getAppNameByAppId: apiMocks.getAppNameByAppId,
	createAppRegistration: apiMocks.createAppRegistration,
	getExistingSP: apiMocks.getExistingSP,
	createServicePrincipal: apiMocks.createServicePrincipal,
	ensureFederatedCredential: apiMocks.ensureFederatedCredential,
	ensureRbacRole: apiMocks.ensureRbacRole,
}));

vi.mock("../logic/consent", () => ({
	isConsentError: apiMocks.isConsentError,
}));

vi.mock("../hooks/util/useRbacCheck", () => ({
	useRbacCheck: vi.fn(() => ({ status: apiMocks.rbacStatus, missingRoles: apiMocks.rbacMissingRoles })),
}));

vi.mock("../config/azureConfig", () => ({
	AZURE_CLIENT_ID: "client-id",
	APP_SCOPES: ["app.scope"],
}));

vi.mock("../logic/pipeline", () => ({
	PIPELINE: {
		validEnvs: ["PROD", "TEST"],
	},
}));

function HookHarness(
	props: {
		onUpdate: (value: UseAzureAppRegistrationCard) => void;
	} & Parameters<typeof useAzureAppRegistrationCard>[0],
) {
	const value = useAzureAppRegistrationCard(props);
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

function baseProps(
	overrides: Partial<Parameters<typeof useAzureAppRegistrationCard>[0]> = {},
): Parameters<typeof useAzureAppRegistrationCard>[0] {
	return {
		azureAccount: { tenantId: "tenant-home" } as AzureAccount,
		githubAccount: { id: 1, login: "org-one", type: "User" },
		githubRepo: "repo-one",
		subscriptionId: "sub-1",
		subscriptionLabel: "Main subscription",
		tenantId: "tenant-1",
		variableValues: {},
		manualTenantId: "",
		...overrides,
	};
}

describe("useAzureAppRegistrationCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();

		apiMocks.getExistingApp.mockResolvedValue({ appId: "existing-app", id: "app-obj" });
		apiMocks.getAppNameByAppId.mockResolvedValue("Prefilled App");
		apiMocks.createAppRegistration.mockResolvedValue({ appId: "created-app", id: "app-created" });
		apiMocks.getExistingSP.mockResolvedValue({ id: "sp-existing" });
		apiMocks.createServicePrincipal.mockResolvedValue({ id: "sp-created" });
		apiMocks.ensureFederatedCredential.mockResolvedValue(undefined);
		apiMocks.ensureRbacRole.mockResolvedValue(undefined);
		apiMocks.isConsentError.mockReturnValue(false);
		apiMocks.getMsal.mockResolvedValue({
			acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
		});
		apiMocks.rbacStatus = "ready";
		apiMocks.rbacMissingRoles = [];
	});

	it("uses default environments when pipeline valid envs include PROD/TEST", async () => {
		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps()}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		expect(latest?.environments).toEqual(["PROD", "TEST"]);

		await act(async () => {
			root.unmount();
		});
	});

	it("falls back to PROD/TEST when pipeline valid envs do not include them", async () => {
		const includesSpy = vi.spyOn(Array.prototype, "includes").mockImplementation(function (this: string[], value: string) {
			if (this.length === 2 && this[0] === "PROD" && this[1] === "TEST") {
				return false;
			}
			return this.indexOf(value) >= 0;
		});

		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps()}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		expect(latest?.environments).toEqual(["PROD", "TEST"]);
		expect(includesSpy).toHaveBeenCalled();
		includesSpy.mockRestore();

		await act(async () => {
			root.unmount();
		});
	});

	it("derives client ids from variable values first, then reports mismatch drift", async () => {
		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps({
						variableValues: {
							AZURE_CLIENT_ID: "client-a",
							AZURE_PLAN_CLIENT_ID: "client-b",
						},
					})}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		expect(latest?.spClientId).toBe("client-a");
		expect(latest?.planClientIdMismatch).toBe(true);

		await act(async () => {
			root.unmount();
		});
	});

	it("falls back to saved result client id when variables are empty", async () => {
		localStorage.setItem(
			"zeninstaller_azure_result",
			JSON.stringify({ clientId: "saved-client", tenantId: "tenant-1", subscriptionIds: ["sub-1"] }),
		);

		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps({ variableValues: {} })}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		expect(latest?.spClientId).toBe("saved-client");
		expect(latest?.planClientIdMismatch).toBe(false);

		await act(async () => {
			root.unmount();
		});
	});

	it("resets steps and clears persisted result", async () => {
		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps()}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		await waitFor(() => {
			expect(latest?.result?.clientId).toBe("existing-app");
			expect((latest?.steps.length ?? 0) > 0).toBe(true);
			expect(localStorage.getItem("zeninstaller_azure_result")).not.toBeNull();
		});

		await act(async () => {
			latest?.reset();
		});

		expect(latest?.result).toBeNull();
		expect(latest?.steps).toEqual([]);
		expect(localStorage.getItem("zeninstaller_azure_result")).toBeNull();

		await act(async () => {
			root.unmount();
		});
	});

	it("returns early when required run inputs are missing", async () => {
		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps({ azureAccount: null, githubAccount: null, subscriptionId: "" })}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		expect(latest?.running).toBe(false);
		expect(latest?.steps).toEqual([]);
		expect(apiMocks.getExistingApp).not.toHaveBeenCalled();

		await act(async () => {
			root.unmount();
		});
	});

	it("uses existing app/SP path without creating new resources", async () => {
		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps({ tenantId: undefined, manualTenantId: "" })}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		await waitFor(() => {
			expect(apiMocks.getExistingApp).toHaveBeenCalled();
			expect(apiMocks.createAppRegistration).not.toHaveBeenCalled();
			expect(apiMocks.getExistingSP).toHaveBeenCalled();
			expect(apiMocks.createServicePrincipal).not.toHaveBeenCalled();
			expect(apiMocks.ensureFederatedCredential).toHaveBeenCalledTimes(2);
			expect(apiMocks.ensureRbacRole).toHaveBeenNthCalledWith(
				1,
				expect.anything(),
				"sub-1",
				"sp-existing",
				"Contributor",
				undefined,
			);
			expect(latest?.result?.tenantId).toBe("tenant-home");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("creates app and service principal when they do not exist", async () => {
		apiMocks.getExistingApp.mockResolvedValueOnce(null);
		apiMocks.getExistingSP.mockResolvedValueOnce(null);

		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps({ tenantId: "tenant-2" })}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		await waitFor(() => {
			expect(apiMocks.createAppRegistration).toHaveBeenCalledWith(
				expect.anything(),
				"zeninstaller-github",
				[],
				"tenant-2",
			);
			expect(apiMocks.createServicePrincipal).toHaveBeenCalledWith(
				expect.anything(),
				"created-app",
				"tenant-2",
			);
			expect(latest?.result?.clientId).toBe("created-app");
			expect(latest?.result?.tenantId).toBe("tenant-2");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("marks the current step with non-consent errors", async () => {
		apiMocks.getExistingApp.mockRejectedValueOnce(new Error("boom"));
		apiMocks.isConsentError.mockReturnValueOnce(false);

		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps()}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		await waitFor(() => {
			expect(latest?.running).toBe(false);
			expect(latest?.steps.find((s) => s.id === "app")?.status).toBe("error");
			expect(latest?.steps.find((s) => s.id === "app")?.detail).toBe("boom");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("attempts consent redirect and keeps consent message when MSAL is unavailable", async () => {
		apiMocks.getExistingApp.mockRejectedValueOnce(new Error("interaction_required"));
		apiMocks.isConsentError.mockReturnValueOnce(true);
		apiMocks.getMsal.mockResolvedValueOnce(null);

		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps()}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		await waitFor(() => {
			expect(latest?.steps.find((s) => s.id === "app")?.detail).toBe(
				"Additional consent required — redirecting to Microsoft...",
			);
			expect(apiMocks.getMsal).toHaveBeenCalled();
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("reports consent redirect failure when redirect throws", async () => {
		apiMocks.getExistingApp.mockRejectedValueOnce(new Error("AADSTS65001"));
		apiMocks.isConsentError.mockReturnValueOnce(true);
		apiMocks.getMsal.mockResolvedValueOnce({
			acquireTokenRedirect: vi.fn().mockRejectedValue(new Error("redirect failed")),
		});

		let latest: UseAzureAppRegistrationCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					{...baseProps()}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await latest?.run();
		});

		await waitFor(() => {
			expect(latest?.steps.find((s) => s.id === "app")?.detail).toBe("Consent redirect failed — try again");
			expect(latest?.running).toBe(false);
		});

		await act(async () => {
			root.unmount();
		});
	});
});
