import { useCallback, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "../api/msal";
import { APP_SCOPES } from "../config/azureConfig";
import {
  getExistingApp,
  getAppNameByAppId,
  createAppRegistration,
  getExistingSP,
  createServicePrincipal,
  ensureFederatedCredential,
  ensureRbacRole,
  isConsentError,
} from "../api/azureGraph";
import { createResultStorage } from "../logic/resultStorage";
import { useStepRunner } from "./useStepRunner";
import type { Account, AzureConfigHook, AzureTarget, CardHook, CardRequirements, SetupStep } from "../types";

export type AzureAppRegistrationResult = { clientId: string; tenantId: string; subscriptionIds: string[] };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAzureAppRegistrationParams extends AzureTarget {
  githubAccount: Account | null;
  githubRepo: string;
  validEnvs: readonly string[];
  subscriptionLabel?: string; // Display name for the target subscription — shown on the RBAC step; falls back to the id.
}

// steps / running / run / reset come from AzureConfigHook.
export interface UseAzureAppRegistration extends CardHook, AzureConfigHook {
  readonly cardId: "azure_app_registration";
  azureAccount: AccountInfo | null;
  appName: string;
  setAppName: (name: string) => void;
  environments: string[];
  setEnvironments: (envs: string[]) => void;
  result: AzureAppRegistrationResult | null;
  prefillAppName: (appId: string) => Promise<void>;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Complete the Azure app registration")
}

const RESULT_KEY = "zeninstaller_azure_result";

const { save: saveResult, load: loadResult } = createResultStorage<AzureAppRegistrationResult>(RESULT_KEY);

/*
 * The GitHub Actions app registration: create the app + service principal, federate it to
 * the repo's environments, and grant it RBAC on the target subscription. The Azure session
 * and the subscription pick live in useAzureAccount / useAzureSubscription — this card locks
 * behind both, so the account and subscription it's handed are already confirmed.
 */
export function useAzureAppRegistration({
  azureAccount,
  githubAccount,
  githubRepo,
  validEnvs,
  subscriptionId,
  subscriptionLabel,
  tenantId,
}: UseAzureAppRegistrationParams): UseAzureAppRegistration {
  const [appName, setAppName] = useState("zeninstaller-github");
  const defaultSelected = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [environments, setEnvironments] = useState<string[]>(defaultSelected.length > 0 ? defaultSelected : ["PROD", "TEST"]);
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const [result, setResult] = useState<AzureAppRegistrationResult | null>(loadResult);

  // Resolve the app registration's display name from a known client id and prefill appName.
  const prefillAppName = useCallback(
    async (appId: string) => {
      if (!azureAccount || !appId) return;
      try {
        const name = await getAppNameByAppId(azureAccount, appId, tenantId);
        if (name) setAppName(name);
      } catch {
        /* keep default name */
      }
    },
    [azureAccount, tenantId],
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
      authority: `https://login.microsoftonline.com/${tenantId || azureAccount.tenantId}`,
    });
  }, [azureAccount, tenantId]);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId || !githubAccount) return;
    setRunning(true);

    const org = githubAccount.login;
    const resolvedTenantId = tenantId ?? azureAccount.tenantId;

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
      const existing = await getExistingApp(azureAccount, appName, tenantId);
      if (existing) {
        appId = existing.appId;
        appObjectId = existing.id;
        updateStep("app", "done", `Existing: ${appId}`);
      } else {
        // No pipeline-wide app permissions requested up front — cards that need one (e.g. domain) grant it themselves.
        const created = await createAppRegistration(azureAccount, appName, [], tenantId);
        appId = created.appId;
        appObjectId = created.id;
        updateStep("app", "done", appId);
      }

      currentStep = "sp";
      updateStep("sp", "running");
      const existingSP = await getExistingSP(azureAccount, appId, tenantId);
      if (existingSP) {
        spObjectId = existingSP.id;
        updateStep("sp", "done", "Already exists");
      } else {
        const sp = await createServicePrincipal(azureAccount, appId, tenantId);
        spObjectId = sp.id;
        updateStep("sp", "done", spObjectId);
      }

      currentStep = "creds";
      updateStep("creds", "running");
      for (const env of environments) {
        await ensureFederatedCredential(azureAccount, appObjectId, org, githubRepo, env, tenantId);
      }
      updateStep("creds", "done", environments.join(", "));

      currentStep = "rbac";
      updateStep("rbac", "running");
      await ensureRbacRole(azureAccount, subscriptionId, spObjectId, "Contributor", tenantId);
      await ensureRbacRole(azureAccount, subscriptionId, spObjectId, "User Access Administrator", tenantId);
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
    azureAccount, subscriptionId, subscriptionLabel, tenantId, githubAccount, githubRepo,
    appName, environments, setSteps, setRunning, updateStep, requestAppConsent,
  ]);

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
    cardRequirements: ["github_login", "azure_login", "repo", "azure_subscription"],
    cardDependencyLabel: "Complete the Azure app registration",
    done: !!result, // Best-effort in isolation — App.tsx refines this with the live RBAC check once available.
  };
}
