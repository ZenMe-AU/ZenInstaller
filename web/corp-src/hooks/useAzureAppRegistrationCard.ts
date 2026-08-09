import { useCallback, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "../api/msal";
import { AZURE_CLIENT_ID, APP_SCOPES } from "../config/azureConfig";
import {
  getExistingApp,
  getAppNameByAppId,
  createAppRegistration,
  getExistingSP,
  createServicePrincipal,
  ensureFederatedCredential,
  ensureRbacRole,
} from "../api/azureGraph";
import { isConsentError } from "../logic/consent";
import { createResultStorage } from "../logic/resultStorage";
import { useStepRunner } from "./util/useStepRunner";
import { useRbacCheck, type RbacCheckStatus } from "./util/useRbacCheck";
import type {
  Account,
  AzureConfigHook,
  AzureTarget,
  CardHook,
  CardRequirements,
  CardStatus,
  SetupStep,
} from "../types";
import { PIPELINE } from "../logic/pipeline";

export type AzureAppRegistrationResult = { clientId: string; tenantId: string; subscriptionIds: string[] };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAzureAppRegistrationCardParams extends AzureTarget {
  githubAccount: Account | null;
  githubRepo: string;
  variableValues: Record<string, string>; // github.presentVariableValues — reads AZURE_CLIENT_ID / AZURE_PLAN_CLIENT_ID.
  manualTenantId: string; // azure.manualTenantId — last-resort tenant fallback before any saved/result tenant exists.
  subscriptionLabel?: string; // Display name for the target subscription — shown on the RBAC step; falls back to the id.
}

// steps / running / run / reset come from AzureConfigHook.
export interface UseAzureAppRegistrationCard extends CardHook, AzureConfigHook {
  readonly cardId: "azure_app_registration";
  azureAccount: AccountInfo | null;
  appName: string;
  setAppName: (name: string) => void;
  environments: string[];
  setEnvironments: (envs: string[]) => void;
  result: AzureAppRegistrationResult | null;
  prefillAppName: (appId: string) => Promise<void>;
  spClientId: string;
  tenantId?: string; // The resolved effective tenant — fed to useCoreInfraCard / useCreateDomainCard.
  rbacStatus: RbacCheckStatus;
  rbacMissingRoles: string[];
  planClientIdMismatch: boolean; // AZURE_PLAN_CLIENT_ID has drifted from AZURE_CLIENT_ID (the app's own flow always keeps them equal).
  variablesComplete: boolean; // Both AZURE_APP_KEYS are saved on GitHub — reported by CloudVariableDetail via onVariablesComplete.
  onVariablesComplete: (complete: boolean) => void;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Complete the Azure app registration")
}

const RESULT_KEY = "zeninstaller_azure_result";

const { save: saveResult, load: loadResult } = createResultStorage<AzureAppRegistrationResult>(RESULT_KEY);

/*
 * The GitHub Actions app registration: create the app + service principal, federate it to
 * the repo's environments, and grant it RBAC on the target subscription. The Azure session
 * and the subscription pick live in useAzureAccount / useAzureSubscriptionCard — this card locks
 * behind both, so the account and subscription it's handed are already confirmed.
 *
 * Also owns the live RBAC check (useRbacCheck) and the "connection variables saved" flag —
 * both used to be held in App.tsx and re-injected into this card's `done` after the fact;
 * pulling them in here means `done` has exactly one definition, computed once.
 */
export function useAzureAppRegistrationCard({
  azureAccount,
  githubAccount,
  githubRepo,
  subscriptionId,
  subscriptionLabel,
  tenantId,
  variableValues,
  manualTenantId,
}: UseAzureAppRegistrationCardParams): UseAzureAppRegistrationCard {
  const [appName, setAppName] = useState("zeninstaller-github");
  const defaultSelected = ["PROD", "TEST"].filter((e) => PIPELINE.validEnvs.includes(e));
  const [environments, setEnvironments] = useState<string[]>(
    defaultSelected.length > 0 ? defaultSelected : ["PROD", "TEST"],
  );
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const [result, setResult] = useState<AzureAppRegistrationResult | null>(loadResult);
  const [variablesComplete, setVariablesComplete] = useState(false);

  // MSA (personal) accounts sign in via the consumer tenant, so the real AAD tenant is resolved
  // from whichever of these is known: the saved GitHub var, a prior successful run, or the tenant
  // the user has picked but not yet confirmed via a run.
  const effectiveTenantId = tenantId || result?.tenantId || manualTenantId.trim() || undefined;

  // The app's own save flow always writes AZURE_PLAN_CLIENT_ID equal to AZURE_CLIENT_ID — a saved
  // mismatch means something else touched it (stale value, manual edit), so treat it as drift too.
  const spClientId = variableValues.AZURE_CLIENT_ID || result?.clientId || "";
  const planClientId = variableValues.AZURE_PLAN_CLIENT_ID || result?.clientId || "";
  const planClientIdMismatch = !!spClientId && !!planClientId && spClientId !== planClientId;

  // Live check: does the app reg exist in this tenant, and does its SP hold RBAC on the selected subscription?
  const { status: rbacStatus, missingRoles: rbacMissingRoles } = useRbacCheck({
    azureAccount,
    spClientId,
    subscriptionId,
    tenantId: effectiveTenantId,
  });

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
    resetSteps();
    setResult(null);
    saveResult(null);
  }, [resetSteps]);

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
    if (!azureAccount || !subscriptionId || !githubAccount) return;
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
      await ensureRbacRole(azureAccount, subscriptionId, spObjectId, "Contributor", effectiveTenantId);
      await ensureRbacRole(azureAccount, subscriptionId, spObjectId, "User Access Administrator", effectiveTenantId);
      updateStep("rbac", "done", subscriptionLabel || subscriptionId);

      const r = { clientId: appId, tenantId: resolvedTenantId, subscriptionIds: [subscriptionId] };
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
    subscriptionId,
    subscriptionLabel,
    effectiveTenantId,
    githubAccount,
    githubRepo,
    appName,
    environments,
    setSteps,
    setRunning,
    updateStep,
    requestAppConsent,
  ]);

  const done = variablesComplete && rbacStatus === "ready" && !planClientIdMismatch;

  const azureConfigured = !!AZURE_CLIENT_ID;
  // Assumes prerequisites are met — App locks this card (via cardRequirements) whenever they're not,
  // which overrides this status to "idle" regardless of what's computed here.
  const status: CardStatus = !azureConfigured
    ? "error"
    : !variablesComplete
      ? "warning"
      : rbacStatus === "sp-not-found" || rbacStatus === "missing-role" || planClientIdMismatch
        ? "warning" // vars saved but the app reg is gone from this tenant, the SP lost access, or AZURE_PLAN_CLIENT_ID drifted
        : "complete"; // filled in — validated (true) or not yet run (null) both count as complete
  const summary = !azureConfigured
    ? "Unavailable"
    : rbacStatus === "sp-not-found"
      ? "Not found in the selected tenant — recreate it"
      : rbacStatus === "missing-role"
        ? "Missing access on the selected subscription"
        : planClientIdMismatch
          ? "AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID"
          : result
            ? "App registration ready"
            : "Create the app registration";

  return {
    cardId: "azure_app_registration" as const,
    azureAccount,
    appName,
    setAppName,
    environments,
    setEnvironments,
    steps,
    result,
    running,
    reset,
    run,
    prefillAppName,
    spClientId,
    tenantId: effectiveTenantId,
    rbacStatus,
    rbacMissingRoles,
    planClientIdMismatch,
    variablesComplete,
    onVariablesComplete: setVariablesComplete,
    status,
    summary,
    cardRequirements: ["github_login", "azure_login", "repo", "azure_subscription"],
    cardDependencyLabel: "Complete the Azure app registration",
    done,
  };
}
