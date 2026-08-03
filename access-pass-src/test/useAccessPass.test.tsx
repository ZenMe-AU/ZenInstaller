import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAzureAccessPass } from "../hooks/useAccessPass";
import type { AccountInfo } from "@azure/msal-browser";

const getMsalMock = vi.fn();
const listUsersManagedBySignedInUserMock = vi.fn();
const createTemporaryAccessPassForUserMock = vi.fn();
const removeNonPasswordAuthenticationMethodsMock = vi.fn();
const resetUserPasswordMock = vi.fn();
const temporaryAccessPassMethodExistsMock = vi.fn();

vi.mock("../../access-pass-src/api/accessPassMsal", () => ({
  getMsal: (...args: unknown[]) => getMsalMock(...args),
}));

vi.mock("../../access-pass-src/api/accessPassGraph", () => ({
  listUsersManagedBySignedInUser: (...args: unknown[]) => listUsersManagedBySignedInUserMock(...args),
  createTemporaryAccessPassForUser: (...args: unknown[]) => createTemporaryAccessPassForUserMock(...args),
  generateRandomPassword: () => "RANDOM_PASSWORD_123",
  removeNonPasswordAuthenticationMethods: (...args: unknown[]) => removeNonPasswordAuthenticationMethodsMock(...args),
  resetUserPassword: (...args: unknown[]) => resetUserPasswordMock(...args),
  temporaryAccessPassMethodExists: (...args: unknown[]) => temporaryAccessPassMethodExistsMock(...args),
  MSA_TENANT: "9188040d-6c67-4c5b-b112-36a304b66dad",
}));

type HarnessResult = ReturnType<typeof useAzureAccessPass>;

type HarnessProps = {
  validEnvs: readonly string[];
};

function renderUseAccessPassHook(props: HarnessProps = { validEnvs: ["PROD", "TEST"] }) {
  const state: { current?: HarnessResult } = {};

  function TestHarness() {
    const value = useAzureAccessPass({
      githubAccount: null,
      githubRepo: "ZenMe-AU/ZenInstaller",
      validEnvs: props.validEnvs,
      stages: [],
    });

    useEffect(() => {
      state.current = value;
    }, [value]);

    return null;
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  act(() => {
    root.render(<TestHarness />);
  });

  return {
    get result(): HarnessResult {
      if (!state.current) throw new Error("Hook result not ready");
      return state.current;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(check: () => boolean, timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await act(async () => {
      await Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

function createMockAccount(tenantId = "tenant-1", tenantProfiles?: Map<string, unknown>) {
  return {
    homeAccountId: `uid.${tenantId}`,
    environment: "login.microsoftonline.com",
    tenantId,
    username: "user@example.com",
    localAccountId: "local-account-id",
    name: "Test User",
    idTokenClaims: { tid: tenantId },
    tenantProfiles,
  } as unknown as AccountInfo;
}

function createMsalMock(accounts: AccountInfo[], redirectAccount?: AccountInfo) {
  return {
    handleRedirectPromise: vi.fn().mockResolvedValue(redirectAccount ? { account: redirectAccount } : null),
    getAllAccounts: vi.fn(() => accounts),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: "token" }),
    clearCache: vi.fn().mockResolvedValue(undefined),
  };
}

describe("useAzureAccessPass", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    listUsersManagedBySignedInUserMock.mockResolvedValue([{ id: "user-1", displayName: "Managed User" }]);
    createTemporaryAccessPassForUserMock.mockResolvedValue({ id: "tap-1", temporaryAccessPass: "TAP-123456" });
    removeNonPasswordAuthenticationMethodsMock.mockResolvedValue(2);
    resetUserPasswordMock.mockResolvedValue(undefined);
    temporaryAccessPassMethodExistsMock.mockResolvedValue(true);
  });

  it("stays signed out when no Azure account is present", async () => {
    const msal = createMsalMock([]);

    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    expect(harness.result.azureAccount).toBeNull();
    expect(harness.result.managerUsers).toHaveLength(0);
    expect(harness.result.selectedManagerUserId).toBe("");

    harness.unmount();
  });

  it("loads account and manager users on init", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    expect(harness.result.azureAccount?.tenantId).toBe("tenant-1");
    expect(harness.result.managerUsers).toHaveLength(1);
    expect(harness.result.selectedManagerUserId).toBe("user-1");

    harness.unmount();
  });

  it("surfaces redirect error when manager-user consent redirect fails", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);
    const redirectError = new Error("Failed to redirect for Graph consent");

    listUsersManagedBySignedInUserMock.mockRejectedValue(new Error("interaction_required"));
    msal.loginRedirect.mockRejectedValueOnce(redirectError);
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);
    await waitFor(() => harness.result.managerUsersError === "Failed to redirect for Graph consent");

    expect(msal.loginRedirect).toHaveBeenCalledTimes(1);
    expect(msal.loginRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: "https://login.microsoftonline.com/tenant-1",
        prompt: "consent",
      }),
    );
    expect(harness.result.managerUsers).toEqual([]);
    expect(harness.result.selectedManagerUserId).toBe("");

    harness.unmount();
  });

  it("creates TAP and persists result when run succeeds", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.run();
    });

    await waitFor(() => harness.result.running === false);

    expect(removeNonPasswordAuthenticationMethodsMock).toHaveBeenCalledWith(account, "user-1", undefined);
    expect(resetUserPasswordMock).toHaveBeenCalledWith(account, "user-1", "RANDOM_PASSWORD_123", undefined);
    expect(createTemporaryAccessPassForUserMock).toHaveBeenCalledWith(account, "user-1", undefined);

    expect(harness.result.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(harness.result.result).toMatchObject({
      accessPassValue: "TAP-123456",
      targetUserId: "user-1",
      tapMethodId: "tap-1",
      tenantId: "tenant-1",
    });

    const persisted = JSON.parse(localStorage.getItem("zeninstaller_azure_access_result") || "null");
    expect(persisted?.accessPassValue).toBe("TAP-123456");

    harness.unmount();
  });

  it("sets tenant error when confirmTenantId is called without a tenant ID", async () => {
    const tenantProfiles = new Map([["tenant-1", {}], ["tenant-2", {}]]);
    const account = createMockAccount("tenant-1", tenantProfiles);
    const msal = createMsalMock([account], account);

    listUsersManagedBySignedInUserMock.mockResolvedValue([]);
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.confirmTenantId();
    });

    expect(harness.result.tenantIdError).toBe("Please enter your Tenant ID");
    harness.unmount();
  });

  it("surfaces a friendly TAP authorization error when creation is forbidden", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    createTemporaryAccessPassForUserMock.mockRejectedValue(new Error("403 temporaryAccessPassMethods AccessDenied"));
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.run();
    });

    await waitFor(() => harness.result.running === false);

    const tapStep = harness.result.steps.find((s) => s.id === "tap");
    expect(tapStep?.status).toBe("error");
    expect(tapStep?.detail).toContain("Not authorized to create Temporary Access Pass");

    harness.unmount();
  });

  it("surfaces a consent-required message when TAP creation needs admin consent", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    createTemporaryAccessPassForUserMock.mockRejectedValue(new Error("AADSTS65001 consent_required"));
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.run();
    });

    await waitFor(() => harness.result.running === false);

    const tapStep = harness.result.steps.find((s) => s.id === "tap");
    expect(tapStep?.status).toBe("error");
    expect(tapStep?.detail).toBe("Graph admin consent is required for this tenant. Reconnect Azure and grant consent, then try again.");

    harness.unmount();
  });

  it("surfaces a user-not-found message when TAP endpoint returns 404", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    createTemporaryAccessPassForUserMock.mockRejectedValue(new Error("404 /users/user-1/authentication/temporaryAccessPassMethods"));
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.run();
    });

    await waitFor(() => harness.result.running === false);

    const tapStep = harness.result.steps.find((s) => s.id === "tap");
    expect(tapStep?.status).toBe("error");
    expect(tapStep?.detail).toBe("Selected user was not found in the current tenant context. Re-select the user and try again.");

    harness.unmount();
  });

  it("surfaces an auth-methods authorization message when delete methods is forbidden", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    removeNonPasswordAuthenticationMethodsMock.mockRejectedValue(new Error("403 /users/user-1/authentication/methods Forbidden"));
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.run();
    });

    await waitFor(() => harness.result.running === false);

    const removeMethodsStep = harness.result.steps.find((s) => s.id === "removeMethods");
    expect(removeMethodsStep?.status).toBe("error");
    expect(removeMethodsStep?.detail).toContain("Not authorized to remove existing sign-in methods");

    harness.unmount();
  });

  it("surfaces a password reset authorization message when passwordProfile update is forbidden", async () => {
    const account = createMockAccount("tenant-1", new Map([["tenant-1", {}]]));
    const msal = createMsalMock([account], account);

    resetUserPasswordMock.mockRejectedValue(new Error("403 passwordProfile update denied"));
    getMsalMock.mockResolvedValue(msal);

    const harness = renderUseAccessPassHook();

    await waitFor(() => harness.result.loggingIn === false);
    await waitFor(() => harness.result.managerUsersLoading === false);

    await act(async () => {
      await harness.result.run();
    });

    await waitFor(() => harness.result.running === false);

    const rotatePasswordStep = harness.result.steps.find((s) => s.id === "rotatePassword");
    expect(rotatePasswordStep?.status).toBe("error");
    expect(rotatePasswordStep?.detail).toContain("Not authorized to reset the user password");

    harness.unmount();
  });
});
