import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "../api/msal";
import { GRAPH_SCOPES, ARM_SCOPES } from "../config/azureConfig";
import {
  listSubscriptions,
  getExistingApp,
  createAppRegistration,
  getExistingSP,
  createServicePrincipal,
  ensureFederatedCredential,
  ensureRbacRole,
  grantAdminConsent,
  MSA_TENANT,
  type Subscription,
} from "../api/azureGraph";
import { getAllPermissions } from "../config/azureConfig";
import type { Account, StageDefinition } from "../types";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
export type SetupStep = { id: string; label: string; status: StepStatus; detail?: string };
export type AzureSetupResult = { clientId: string; tenantId: string; subscriptionIds: string[] };

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

export function useAzureSetup({
  githubAccount,
  githubRepo,
  validEnvs,
  stages = [],
}: {
  githubAccount: Account | null;
  githubRepo: string;
  validEnvs: readonly string[];
  stages?: StageDefinition[];
}) {
  const [azureAccount, setAzureAccount] = useState<AccountInfo | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [appName, setAppName] = useState("github-actions-deployer");
  const defaultSelected = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [environments, setEnvironments] = useState<string[]>(defaultSelected.length > 0 ? defaultSelected : ["PROD", "TEST"]);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [result, setResult] = useState<AzureSetupResult | null>(loadResult);
  const [running, setRunning] = useState(false);
  const [loggingIn, setLoggingIn] = useState(true);
  const [consentFailed, setConsentFailed] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [manualTenantId, setManualTenantId] = useState("");
  const [tenantIdError, setTenantIdError] = useState<string | null>(null);

  const availableTenants = useMemo(() => {
    if (!azureAccount?.tenantProfiles) return [];
    return Array.from(azureAccount.tenantProfiles.keys()).filter((id) => id !== MSA_TENANT);
  }, [azureAccount]);

  // Auto-select first tenant and attempt silent load when account is MSA and nothing is pre-filled
  useEffect(() => {
    if (!azureAccount || azureAccount.tenantId !== MSA_TENANT) return;
    if (manualTenantId || availableTenants.length === 0) return;
    const tid = availableTenants[0];
    setManualTenantId(tid);
    loadSubs(azureAccount, tid).catch(() => {
      /* silent failure — user clicks Load */
    });
  }, [azureAccount, availableTenants]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsTenantId = (azureAccount?.tenantId === MSA_TENANT || manualTenantId !== "") && subscriptions.length === 0;
  const effectiveTenantId = needsTenantId ? manualTenantId.trim() : undefined;

  const updateStep = useCallback((id: string, status: StepStatus, detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  const loadSubs = useCallback(async (account: AccountInfo, overrideTenantId?: string) => {
    const subs = await listSubscriptions(account, overrideTenantId);
    setSubscriptions(subs);
    if (subs.length === 1) setSelectedSubs([subs[0].id]);
    if (subs.length === 0) setSubsError("No subscriptions found for this account.");
  }, []);

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
        scopes: GRAPH_SCOPES,
        authority: "https://login.microsoftonline.com/common",
        prompt: "select_account",
      });
    } catch (err) {
      console.error("loginRedirect failed:", err);
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  }, []);

  const confirmTenantId = useCallback(async () => {
    if (!azureAccount) return;
    const tid = manualTenantId.trim();
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
      // Silent GRAPH acquire first — may create a new AAD tenant account in MSAL cache
      await msal.acquireTokenSilent({
        scopes: GRAPH_SCOPES,
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
        setSubsError(msg);
        return;
      }
    }

    // No cached token for this tenant → redirect for consent
    sessionStorage.setItem(SESSION_KEY, tid);
    try {
      await msal.loginRedirect({
        scopes: GRAPH_SCOPES,
        authority: `https://login.microsoftonline.com/${tid}`,
        prompt: "consent",
      });
    } catch (err) {
      sessionStorage.removeItem(SESSION_KEY);
      setTenantIdError(err instanceof Error ? err.message : "Failed to redirect");
    }
  }, [azureAccount, manualTenantId, loadSubs]);

  const changeTenant = useCallback(() => {
    setSubscriptions([]);
    setSelectedSubs([]);
    setSubsError(null);
    setTenantIdError(null);
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    saveResult(null);
    setConsentFailed(false);
  }, []);

  const clearSession = useCallback(async () => {
    const msal = await getMsal();
    if (msal) await msal.clearCache().catch(() => {});
    setAzureAccount(null);
    setSubscriptions([]);
    setSelectedSubs([]);
    setResult(null);
    saveResult(null);
    setSteps([]);
    setConsentFailed(false);
    setSubsError(null);
    setManualTenantId("");
    setTenantIdError(null);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const run = useCallback(async () => {
    if (!azureAccount || selectedSubs.length === 0 || !githubAccount) return;
    setRunning(true);
    setConsentFailed(false);

    const org = githubAccount.login;
    const resolvedTenantId = effectiveTenantId ?? azureAccount.tenantId;

    const initialSteps: SetupStep[] = [
      { id: "app", label: "Create app registration", status: "pending" },
      { id: "sp", label: "Create service principal", status: "pending" },
      { id: "creds", label: `Add federated credentials (${environments.join(", ")})`, status: "pending" },
      { id: "rbac", label: `Assign RBAC roles (${selectedSubs.length} subscription${selectedSubs.length > 1 ? "s" : ""})`, status: "pending" },
      { id: "consent", label: "Grant admin consent", status: "pending" },
    ];
    setSteps(initialSteps);

    let appId = "";
    let appObjectId = "";
    let spObjectId = "";
    let currentStep = "app";

    const permissions = getAllPermissions(stages);

    try {
      currentStep = "app";
      updateStep("app", "running");
      const existing = await getExistingApp(azureAccount, appName, effectiveTenantId);
      if (existing) {
        appId = existing.appId;
        appObjectId = existing.id;
        updateStep("app", "done", `Existing: ${appId}`);
      } else {
        const created = await createAppRegistration(azureAccount, appName, permissions, effectiveTenantId);
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
      updateStep("creds", "done");

      currentStep = "rbac";
      updateStep("rbac", "running");
      for (const sub of selectedSubs) {
        await ensureRbacRole(azureAccount, sub, spObjectId, "Contributor", effectiveTenantId);
        await ensureRbacRole(azureAccount, sub, spObjectId, "User Access Administrator", effectiveTenantId);
      }
      updateStep("rbac", "done");

      currentStep = "consent";
      updateStep("consent", "running");
      try {
        await grantAdminConsent(azureAccount, spObjectId, permissions, effectiveTenantId);
        updateStep("consent", "done");
      } catch {
        updateStep("consent", "error", "Grant manually: Entra ID → App registrations → API permissions → Grant admin consent");
        setConsentFailed(true);
      }

      const r = { clientId: appId, tenantId: resolvedTenantId, subscriptionIds: selectedSubs };
      setResult(r);
      saveResult(r);
    } catch (err) {
      updateStep(currentStep, "error", err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }, [azureAccount, selectedSubs, githubAccount, appName, environments, githubRepo, effectiveTenantId, stages, updateStep]);

  return {
    azureAccount,
    subscriptions,
    selectedSubs,
    setSelectedSubs,
    appName,
    setAppName,
    environments,
    setEnvironments,
    steps,
    result,
    running,
    loggingIn,
    consentFailed,
    loginError,
    subsError,
    needsTenantId,
    availableTenants,
    manualTenantId,
    setManualTenantId,
    tenantIdError,
    confirmTenantId,
    login,
    logout,
    reset,
    run,
    changeTenant,
  };
}
