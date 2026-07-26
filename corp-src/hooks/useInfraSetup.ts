import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import {
  ensureResourceGroup,
  resourceGroupExists,
  ensureLogAnalyticsWorkspace,
  ensureSubscriptionDiagnostics,
  ensureAppInsights,
  ensureStorageAccount,
  ensureStorageContainer,
  ensureRbacRoleAtScope,
  hasRbacRoleAtScope,
  storageAccountScope,
  resourceGroupScope,
  listLocations,
  type AzureLocation,
} from "../api/azureArm";
import { getExistingSP } from "../api/azureGraph";
import {
  getRootResourceGroupName,
  getLogAnalyticsWorkspaceName,
  getStorageAccountName,
  getAppInsightsName,
  DIAGNOSTIC_SETTING_NAME,
  DEFAULT_AZURE_LOCATION,
  TFSTATE_CONTAINER,
} from "../logic/naming";
import type { SetupStep } from "./useAzureSetup";

export type InfraSetupResult = {
  corpName: string;
  subscriptionId: string;
};

export type InfraRbacStatus = "unknown" | "rg-not-found" | "missing-role" | "ready";

const RESULT_KEY = "zeninstaller_infra_result";

function saveResult(r: InfraSetupResult | null) {
  if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
  else localStorage.removeItem(RESULT_KEY);
}
function loadResult(): InfraSetupResult | null {
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null");
  } catch {
    return null;
  }
}

/*
 * The root Azure infrastructure a corp needs before Terraform can run: resource group,
 * observability (Log Analytics, diagnostics, App Insights), the private storage account,
 * and the Terraform state container + its RBAC grant. The DNS/Entra domain is a separate
 * card (useCreateDomainSetup); it locks behind this one because the DNS zone lives in the RG.
 */
export function useInfraSetup({
  azureAccount,
  subscriptionId,
  corpName,
  spClientId,
  tenantId,
}: {
  azureAccount: AccountInfo | null;
  subscriptionId: string;
  corpName: string;
  spClientId: string; // Client id of the GitHub Actions app registration (AZURE_CLIENT_ID variable), for the state-container RBAC grant.
  tenantId?: string; // Target AAD tenant — required for MSA (personal) accounts where account.tenantId is the consumer tenant.
}) {
  const [location, setLocation] = useState(DEFAULT_AZURE_LOCATION);
  const [locations, setLocations] = useState<AzureLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InfraSetupResult | null>(loadResult);
  const [infraRbacStatus, setInfraRbacStatus] = useState<InfraRbacStatus>("unknown");

  const resultMatches = !!result && result.corpName === corpName && result.subscriptionId === subscriptionId;
  // Live rather than localStorage-trusting: the resource group could've been deleted, or the SP's
  // access revoked, since this last ran (or on another device where nothing was ever persisted here).
  const done = infraRbacStatus === "ready";

  useEffect(() => {
    if (result && !resultMatches) setSteps([]);
  }, [result, resultMatches]);

  const resourceGroupName = getRootResourceGroupName(corpName);
  const lawName = getLogAnalyticsWorkspaceName(corpName);
  const storageAccountName = getStorageAccountName(corpName);
  const appInsightsName = getAppInsightsName(corpName);

  // Live check: does the resource group exist, and does the SP hold Contributor on it (directly or
  // inherited from the subscription)? Mirrors useRbacCheck's sp-not-found/missing-role split.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!azureAccount || !subscriptionId || !spClientId || !resourceGroupName) {
        if (!cancelled) setInfraRbacStatus("unknown");
        return;
      }
      if (!cancelled) setInfraRbacStatus("unknown");
      try {
        const exists = await resourceGroupExists(azureAccount, subscriptionId, resourceGroupName, tenantId);
        if (cancelled) return;
        if (!exists) {
          setInfraRbacStatus("rg-not-found");
          return;
        }
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (cancelled) return;
        if (!sp) {
          setInfraRbacStatus("missing-role");
          return;
        }
        const hasRole = await hasRbacRoleAtScope(azureAccount, resourceGroupScope(subscriptionId, resourceGroupName), sp.id, "Contributor", tenantId);
        if (!cancelled) setInfraRbacStatus(hasRole ? "ready" : "missing-role");
      } catch {
        // Consent/token errors — leave unknown rather than flag broken.
        if (!cancelled) setInfraRbacStatus("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, spClientId, resourceGroupName, tenantId]);

  // Load the subscription's available regions once an account + subscription are known.
  useEffect(() => {
    if (!azureAccount || !subscriptionId) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLocationsLoading(true);
    setLocationsError(null);
    listLocations(azureAccount, subscriptionId, tenantId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch((err) => {
        if (!cancelled) setLocationsError(err instanceof Error ? err.message : "Failed to load Azure regions");
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, tenantId]);

  const updateStep = useCallback((id: string, status: SetupStep["status"], detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId || !corpName || !spClientId) return;
    setRunning(true);

    const initialSteps: SetupStep[] = [
      { id: "rg", label: `Create resource group ${resourceGroupName}`, status: "pending" },
      { id: "rg-rbac", label: "Grant GitHub Actions access to the resource group", status: "pending" },
      { id: "law", label: `Create Log Analytics workspace ${lawName}`, status: "pending" },
      { id: "diag", label: "Configure subscription activity-log diagnostics", status: "pending" },
      { id: "appins", label: `Create Application Insights ${appInsightsName}`, status: "pending" },
      { id: "storage", label: `Create storage account ${storageAccountName}`, status: "pending" },
      { id: "container", label: `Create ${TFSTATE_CONTAINER} container`, status: "pending" },
      { id: "rbac", label: "Grant GitHub Actions access to Terraform state", status: "pending" },
    ];
    setSteps(initialSteps);

    let currentStep = "rg";
    let sp: Awaited<ReturnType<typeof getExistingSP>> = null;
    try {
      currentStep = "rg";
      updateStep("rg", "running");
      const rgResult = await ensureResourceGroup(azureAccount, subscriptionId, resourceGroupName, location, tenantId);
      updateStep("rg", rgResult === "exists" ? "skipped" : "done", rgResult === "exists" ? "Already exists" : undefined);

      currentStep = "rg-rbac";
      updateStep("rg-rbac", "running");
      sp = await getExistingSP(azureAccount, spClientId, tenantId);
      if (!sp) throw new Error(`Service principal for app ${spClientId} not found — run the Azure card first`);
      const rgScope = resourceGroupScope(subscriptionId, resourceGroupName);
      const rgRbac = await ensureRbacRoleAtScope(azureAccount, rgScope, sp.id, "Contributor", tenantId);
      updateStep("rg-rbac", rgRbac === "exists" ? "skipped" : "done", rgRbac === "exists" ? "Already assigned" : "Contributor");

      currentStep = "law";
      updateStep("law", "running");
      const law = await ensureLogAnalyticsWorkspace(azureAccount, subscriptionId, resourceGroupName, lawName, location, tenantId);
      updateStep("law", law.result === "exists" ? "skipped" : "done", law.result === "exists" ? "Already exists" : undefined);

      currentStep = "diag";
      updateStep("diag", "running");
      const diag = await ensureSubscriptionDiagnostics(azureAccount, subscriptionId, DIAGNOSTIC_SETTING_NAME, law.id, tenantId);
      updateStep("diag", diag === "exists" ? "skipped" : "done", diag === "exists" ? "Already configured" : undefined);

      currentStep = "appins";
      updateStep("appins", "running");
      const appins = await ensureAppInsights(azureAccount, subscriptionId, resourceGroupName, appInsightsName, location, law.id, tenantId);
      updateStep("appins", appins === "exists" ? "skipped" : "done", appins === "exists" ? "Already exists" : undefined);

      currentStep = "storage";
      updateStep("storage", "running");
      const storage = await ensureStorageAccount(azureAccount, subscriptionId, resourceGroupName, storageAccountName, location, tenantId);
      updateStep("storage", storage === "exists" ? "skipped" : "done", storage === "exists" ? "Already exists" : undefined);

      currentStep = "container";
      updateStep("container", "running");
      const container = await ensureStorageContainer(azureAccount, subscriptionId, resourceGroupName, storageAccountName, TFSTATE_CONTAINER, tenantId);
      updateStep("container", container === "exists" ? "skipped" : "done", container === "exists" ? "Already exists" : undefined);

      currentStep = "rbac";
      updateStep("rbac", "running");
      const scope = storageAccountScope(subscriptionId, resourceGroupName, storageAccountName);
      const rbac = await ensureRbacRoleAtScope(azureAccount, scope, sp.id, "Storage Blob Data Contributor", tenantId);
      updateStep("rbac", rbac === "exists" ? "skipped" : "done", rbac === "exists" ? "Already assigned" : "Storage Blob Data Contributor");

      const r: InfraSetupResult = { corpName, subscriptionId };
      setResult(r);
      saveResult(r);
    } catch (err) {
      updateStep(currentStep, "error", err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }, [
    azureAccount, subscriptionId, corpName, spClientId, location, tenantId,
    resourceGroupName, lawName, storageAccountName, appInsightsName, updateStep,
  ]);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    saveResult(null);
  }, []);

  return {
    location,
    setLocation,
    locations,
    locationsLoading,
    locationsError,
    steps,
    running,
    done,
    infraRbacStatus,
    resultMatches,
    run,
    reset,
    resourceGroupName,
    lawName,
    storageAccountName,
    appInsightsName,
    containerName: TFSTATE_CONTAINER,
  };
}
