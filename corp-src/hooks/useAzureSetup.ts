import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "../api/msal";
import { LOGIN_SCOPES, APP_SCOPES, ARM_SCOPES } from "../config/azureConfig";
import {
  listSubscriptions,
  listTenants,
  getExistingApp,
  getAppNameByAppId,
  createAppRegistration,
  getExistingSP,
  createServicePrincipal,
  ensureFederatedCredential,
  ensureRbacRole,
  isConsentError,
  MSA_TENANT,
  type Subscription,
  type AzureTenant,
} from "../api/azureGraph";
import type { Account, CardHook, CardRequirements } from "../types";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
export type SetupStep = { id: string; label: string; status: StepStatus; detail?: string };
export type AzureSetupResult = { clientId: string; tenantId: string; subscriptionIds: string[] };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAzureSetup extends CardHook {
  readonly cardId: "azure_setup";
  azureAccount: AccountInfo | null;
  tenants: AzureTenant[];
  subscriptions: Subscription[];
  selectedSubscriptionId: string;
  setSelectedSubscriptionId: (id: string) => void;
  appName: string;
  setAppName: (name: string) => void;
  environments: string[];
  setEnvironments: (envs: string[]) => void;
  steps: SetupStep[];
  result: AzureSetupResult | null;
  running: boolean;
  loggingIn: boolean;
  loginError: string | null;
  subsError: string | null;
  availableTenants: string[];
  manualTenantId: string;
  setManualTenantId: (id: string) => void;
  tenantIdError: string | null;
  confirmTenantId: (tenantIdArg?: string) => Promise<void>;
  selectTenant: (tenantId: string) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  reset: () => void;
  run: () => Promise<void>;
  changeTenant: () => void;
  prefillAppName: (appId: string) => Promise<void>;
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Complete the Azure app registration")
  done: boolean;
}

const SESSION_KEY = "zeninstaller_arm_tenant";
const RESULT_KEY = "zeninstaller_azure_result";

function saveResult(r: AzureSetupResult | null) {
  if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
  else localStorage.removeItem(RESULT_KEY);
}
function loadResult(): AzureSetupResult | null {
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null");
  } catch {
    return null;
  }
}

// Maps a raw MSAL/AADSTS failure to user-facing text — never surface the raw trace/correlation-id blob.
function friendlySubsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("AADSTS90072")) {
    return "This account isn't a member of that tenant — sign in with a different account, or have an admin add it as a guest first.";
  }
  return "Couldn't load subscriptions for this tenant — check the tenant ID or your access, then try again.";
}

export function useAzureSetup({
  githubAccount,
  githubRepo,
  validEnvs,
}: {
  githubAccount: Account | null;
  githubRepo: string;
  validEnvs: readonly string[];
}): UseAzureSetup {
  const [azureAccount, setAzureAccount] = useState<AccountInfo | null>(null);
  const [tenants, setTenants] = useState<AzureTenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState("");
  const [appName, setAppName] = useState("zeninstaller-github");
  const defaultSelected = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [environments, setEnvironments] = useState<string[]>(defaultSelected.length > 0 ? defaultSelected : ["PROD", "TEST"]);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [result, setResult] = useState<AzureSetupResult | null>(loadResult);
  const [running, setRunning] = useState(false);
  const [loggingIn, setLoggingIn] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [manualTenantId, setManualTenantId] = useState("");
  const [tenantIdError, setTenantIdError] = useState<string | null>(null);

  // Tenant IDs the signed-in account already exposes — the MSA fallback when ARM /tenants can't run.
  const availableTenants = useMemo(() => {
    if (!azureAccount?.tenantProfiles) return [];
    return Array.from(azureAccount.tenantProfiles.keys()).filter((id) => id !== MSA_TENANT);
  }, [azureAccount]);

  const effectiveTenantId = manualTenantId.trim() || undefined;

  const updateStep = useCallback((id: string, status: StepStatus, detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  const loadSubs = useCallback(async (account: AccountInfo, overrideTenantId?: string) => {
    const subs = await listSubscriptions(account, overrideTenantId);
    setSubscriptions(subs);
    if (subs.length === 1) setSelectedSubscriptionId(subs[0].id);
    if (subs.length === 0) setSubsError("No subscriptions found for this account.");
  }, []);

  // Fetch the tenant list via ARM (display names); fall back to the account's known tenant IDs for MSA.
  const loadTenants = useCallback(async (account: AccountInfo) => {
    try {
      const list = await listTenants(account);
      if (list.length > 0) {
        setTenants(list);
        return;
      }
    } catch {
      /* MSA / consent — fall through to the tenantProfiles fallback */
    }
    if (account.tenantProfiles) {
      const ids = Array.from(account.tenantProfiles.keys()).filter((id) => id !== MSA_TENANT);
      setTenants(ids.map((id) => ({ tenantId: id, displayName: id })));
    }
  }, []);

  // Load the tenant list once signed in.
  useEffect(() => {
    if (azureAccount) void loadTenants(azureAccount);
  }, [azureAccount, loadTenants]);

  // Auto-select first tenant and attempt silent load when account is MSA and nothing is pre-filled.
  useEffect(() => {
    if (!azureAccount || azureAccount.tenantId !== MSA_TENANT) return;
    if (manualTenantId || availableTenants.length === 0) return;
    const tid = availableTenants[0];
    setManualTenantId(tid);
    // Surface a friendly error rather than leaving the user staring at "no subscriptions" with
    // no explanation — the tenant dropdown (same tenantProfiles list) lets them pick another.
    loadSubs(azureAccount, tid).catch((err) => setSubsError(friendlySubsError(err)));
  }, [azureAccount, availableTenants]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: handle redirect callback OR restore existing session
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const msal = await getMsal();
        if (!msal || cancelled) return;
        const result = await msal.handleRedirectPromise();
        if (cancelled) return;

        const savedTenant = sessionStorage.getItem(SESSION_KEY) || undefined;

        const tryLoadSubs = async (account: AccountInfo, tenant: string | undefined) => {
          try {
            await loadSubs(account, tenant);
            if (tenant) sessionStorage.removeItem(SESSION_KEY);
          } catch (err) {
            // ARM consent not yet granted — redirect for ARM
            const msg = err instanceof Error ? err.message : "";
            if ((msg.includes("AADSTS65001") || msg.includes("interaction_required")) && tenant) {
              await msal.acquireTokenRedirect({
                scopes: ARM_SCOPES,
                authority: `https://login.microsoftonline.com/${tenant}`,
              });
            }
          }
        };

        const msaTenant = (acc: AccountInfo) => (acc.tenantId === MSA_TENANT ? (loadResult()?.tenantId ?? undefined) : undefined);

        if (result?.account) {
          setAzureAccount(result.account);
          const tenant = savedTenant ?? msaTenant(result.account);
          if (tenant) setManualTenantId(tenant);
          await tryLoadSubs(result.account, tenant);
        } else {
          const accounts = msal.getAllAccounts();
          if (accounts.length > 0) {
            const preferredTid = savedTenant ?? loadResult()?.tenantId;
            const account =
              (preferredTid ? accounts.find((a) => a.tenantId === preferredTid) : undefined) ??
              accounts.find((a) => a.tenantId !== MSA_TENANT) ??
              accounts[0];
            setAzureAccount(account);
            const tenant = savedTenant ?? msaTenant(account);
            if (tenant) setManualTenantId(tenant);
            await tryLoadSubs(account, tenant);
          }
        }
      } catch (err) {
        console.error("MSAL init error:", err);
      } finally {
        if (!cancelled) setLoggingIn(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [loadSubs]);

  const login = useCallback(async () => {
    setLoginError(null);
    setSubsError(null);
    try {
      const msal = await getMsal();
      if (!msal) return;
      await msal.loginRedirect({
        scopes: LOGIN_SCOPES,
        authority: "https://login.microsoftonline.com/common",
        prompt: "select_account",
      });
    } catch (err) {
      console.error("loginRedirect failed:", err);
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  }, []);

  const confirmTenantId = useCallback(
    async (tenantIdArg?: string) => {
      if (!azureAccount) return;
      const tid = (tenantIdArg ?? manualTenantId).trim();
      if (!tid) {
        setTenantIdError("Please enter your Tenant ID");
        return;
      }
      setTenantIdError(null);
      setSubsError(null);

      const msal = await getMsal();
      if (!msal) return;

      // Use tenant-specific account from cache if available (avoids re-consent on repeat visits)
      const accounts = msal.getAllAccounts();
      const tenantAccount = accounts.find((a) => a.tenantId === tid) ?? azureAccount;

      try {
        // Silent ARM acquire first (listTenants/listSubscriptions are ARM-only) — may create a new AAD tenant account in MSAL cache
        await msal.acquireTokenSilent({
          scopes: ARM_SCOPES,
          account: tenantAccount,
          authority: `https://login.microsoftonline.com/${tid}`,
        });
        // Re-query cache and pick best account before loading subs
        const refreshed = msal.getAllAccounts();
        const bestAccount = refreshed.find((a) => a.tenantId === tid) ?? tenantAccount;
        if (bestAccount !== azureAccount) setAzureAccount(bestAccount);
        await loadSubs(bestAccount, tid);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const needsConsent = msg.includes("AADSTS65001") || msg.includes("interaction_required") || msg.includes("MSA_NEEDS_TENANT");
        if (!needsConsent) {
          setSubsError(friendlySubsError(err));
          return;
        }
      }

      // No cached token for this tenant → redirect for consent
      sessionStorage.setItem(SESSION_KEY, tid);
      try {
        await msal.loginRedirect({
          scopes: ARM_SCOPES,
          authority: `https://login.microsoftonline.com/${tid}`,
          prompt: "consent",
        });
      } catch (err) {
        sessionStorage.removeItem(SESSION_KEY);
        setTenantIdError(err instanceof Error ? err.message : "Failed to redirect");
      }
    },
    [azureAccount, manualTenantId, loadSubs],
  );

  // Pick a tenant from the dropdown → reset subs and load the chosen tenant's subscriptions.
  const selectTenant = useCallback(
    (tid: string) => {
      setManualTenantId(tid);
      setSubscriptions([]);
      setSelectedSubscriptionId("");
      setSubsError(null);
      void confirmTenantId(tid);
    },
    [confirmTenantId],
  );

  const changeTenant = useCallback(() => {
    setSubscriptions([]);
    setSelectedSubscriptionId("");
    setSubsError(null);
    setTenantIdError(null);
  }, []);

  // Resolve the app registration's display name from a known client id and prefill appName.
  const prefillAppName = useCallback(
    async (appId: string) => {
      if (!azureAccount || !appId) return;
      try {
        const name = await getAppNameByAppId(azureAccount, appId, effectiveTenantId);
        if (name) setAppName(name);
      } catch {
        /* keep default name */
      }
    },
    [azureAccount, effectiveTenantId],
  );

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    saveResult(null);
  }, []);

  const clearSession = useCallback(async () => {
    const msal = await getMsal();
    if (msal) await msal.clearCache().catch(() => {});
    setAzureAccount(null);
    setTenants([]);
    setSubscriptions([]);
    setSelectedSubscriptionId("");
    setResult(null);
    saveResult(null);
    setSteps([]);
    setSubsError(null);
    setManualTenantId("");
    setTenantIdError(null);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  // Redirects for Application/AppRoleAssignment.ReadWrite.All incremental consent; user re-runs after returning.
  const requestAppConsent = useCallback(async () => {
    if (!azureAccount) return;
    const msal = await getMsal();
    if (!msal) return;
    await msal.acquireTokenRedirect({
      scopes: APP_SCOPES,
      account: azureAccount,
      authority: `https://login.microsoftonline.com/${effectiveTenantId || azureAccount.tenantId}`,
    });
  }, [azureAccount, effectiveTenantId]);

  const run = useCallback(async () => {
    if (!azureAccount || !selectedSubscriptionId || !githubAccount) return;
    setRunning(true);

    const org = githubAccount.login;
    const resolvedTenantId = effectiveTenantId ?? azureAccount.tenantId;

    const initialSteps: SetupStep[] = [
      { id: "app", label: "Create app registration", status: "pending" },
      { id: "sp", label: "Create service principal", status: "pending" },
      { id: "creds", label: "Add federated credentials", status: "pending" },
      { id: "rbac", label: "Assign RBAC roles", status: "pending" },
    ];
    setSteps(initialSteps);

    let appId = "";
    let appObjectId = "";
    let spObjectId = "";
    let currentStep = "app";

    try {
      currentStep = "app";
      updateStep("app", "running");
      const existing = await getExistingApp(azureAccount, appName, effectiveTenantId);
      if (existing) {
        appId = existing.appId;
        appObjectId = existing.id;
        updateStep("app", "done", `Existing: ${appId}`);
      } else {
        // No pipeline-wide app permissions requested up front — cards that need one (e.g. domain) grant it themselves.
        const created = await createAppRegistration(azureAccount, appName, [], effectiveTenantId);
        appId = created.appId;
        appObjectId = created.id;
        updateStep("app", "done", appId);
      }

      currentStep = "sp";
      updateStep("sp", "running");
      const existingSP = await getExistingSP(azureAccount, appId, effectiveTenantId);
      if (existingSP) {
        spObjectId = existingSP.id;
        updateStep("sp", "done", "Already exists");
      } else {
        const sp = await createServicePrincipal(azureAccount, appId, effectiveTenantId);
        spObjectId = sp.id;
        updateStep("sp", "done", spObjectId);
      }

      currentStep = "creds";
      updateStep("creds", "running");
      for (const env of environments) {
        await ensureFederatedCredential(azureAccount, appObjectId, org, githubRepo, env, effectiveTenantId);
      }
      updateStep("creds", "done", environments.join(", "));

      currentStep = "rbac";
      updateStep("rbac", "running");
      await ensureRbacRole(azureAccount, selectedSubscriptionId, spObjectId, "Contributor", effectiveTenantId);
      await ensureRbacRole(azureAccount, selectedSubscriptionId, spObjectId, "User Access Administrator", effectiveTenantId);
      updateStep("rbac", "done", subscriptions.find((s) => s.id === selectedSubscriptionId)?.displayName ?? selectedSubscriptionId);

      const r = { clientId: appId, tenantId: resolvedTenantId, subscriptionIds: [selectedSubscriptionId] };
      setResult(r);
      saveResult(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (isConsentError(msg)) {
        updateStep(currentStep, "error", "Additional consent required — redirecting to Microsoft...");
        await requestAppConsent().catch(() => updateStep(currentStep, "error", "Consent redirect failed — try again"));
      } else {
        updateStep(currentStep, "error", msg);
      }
    } finally {
      setRunning(false);
    }
  }, [
    azureAccount,
    selectedSubscriptionId,
    subscriptions,
    githubAccount,
    appName,
    environments,
    githubRepo,
    effectiveTenantId,
    updateStep,
    requestAppConsent,
  ]);

  return {
    cardId: "azure_setup" as const,
    azureAccount,
    tenants,
    subscriptions,
    selectedSubscriptionId,
    setSelectedSubscriptionId,
    appName,
    setAppName,
    environments,
    setEnvironments,
    steps,
    result,
    running,
    loggingIn,
    loginError,
    subsError,
    availableTenants,
    manualTenantId,
    setManualTenantId,
    tenantIdError,
    confirmTenantId,
    selectTenant,
    login,
    logout,
    reset,
    run,
    changeTenant,
    prefillAppName,
    cardRequirements: ["auth", "azure_login", "repo", "subscription"],
    cardDependencyLabel: "Complete the Azure app registration",
    done: !!result, // Best-effort in isolation — App.tsx refines this with the live RBAC check once available.
  };
}
