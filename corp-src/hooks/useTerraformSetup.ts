import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { ensureStorageContainer, ensureRbacRoleAtScope, storageAccountScope } from "../api/azureArm";
import { getExistingSP } from "../api/azureGraph";
import { getRootResourceGroupName, getStorageAccountName, TFSTATE_CONTAINER } from "../logic/naming";
import type { SetupStep } from "./useAzureSetup";

export type TerraformSetupResult = {
  corpName: string;
  subscriptionId: string;
};

const RESULT_KEY = "zeninstaller_tf_backend_result";

function saveResult(r: TerraformSetupResult | null) {
  if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
  else localStorage.removeItem(RESULT_KEY);
}
function loadResult(): TerraformSetupResult | null {
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function useTerraformSetup({
  azureAccount,
  subscriptionId,
  corpName,
  spClientId,
  tenantId,
}: {
  azureAccount: AccountInfo | null;
  subscriptionId: string;
  corpName: string;
  /** Client id of the GitHub Actions app registration (AZURE_CLIENT_ID variable). */
  spClientId: string;
  /** Target AAD tenant — required for MSA (personal) accounts where account.tenantId is the consumer tenant. */
  tenantId?: string;
}) {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TerraformSetupResult | null>(loadResult);

  const resultMatches = !!result && result.corpName === corpName && result.subscriptionId === subscriptionId;
  const done = resultMatches;

  useEffect(() => {
    if (result && !resultMatches) setSteps([]);
  }, [result, resultMatches]);

  const resourceGroupName = getRootResourceGroupName(corpName);
  const storageAccountName = getStorageAccountName(corpName);

  const updateStep = useCallback((id: string, status: SetupStep["status"], detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId || !corpName || !spClientId) return;
    setRunning(true);

    const initialSteps: SetupStep[] = [
      { id: "container", label: `Create ${TFSTATE_CONTAINER} container in ${storageAccountName}`, status: "pending" },
      { id: "rbac", label: "Grant GitHub Actions access to Terraform state", status: "pending" },
    ];
    setSteps(initialSteps);

    let currentStep = "container";
    try {
      currentStep = "container";
      updateStep("container", "running");
      const container = await ensureStorageContainer(azureAccount, subscriptionId, resourceGroupName, storageAccountName, TFSTATE_CONTAINER, tenantId);
      updateStep("container", container === "exists" ? "skipped" : "done", container === "exists" ? "Already exists" : undefined);

      currentStep = "rbac";
      updateStep("rbac", "running");
      const sp = await getExistingSP(azureAccount, spClientId, tenantId);
      if (!sp) throw new Error(`Service principal for app ${spClientId} not found — run the Azure card first`);
      const scope = storageAccountScope(subscriptionId, resourceGroupName, storageAccountName);
      const rbac = await ensureRbacRoleAtScope(azureAccount, scope, sp.id, "Storage Blob Data Contributor", tenantId);
      updateStep("rbac", rbac === "exists" ? "skipped" : "done", rbac === "exists" ? "Already assigned" : "Storage Blob Data Contributor");

      const r: TerraformSetupResult = { corpName, subscriptionId };
      setResult(r);
      saveResult(r);
    } catch (err) {
      updateStep(currentStep, "error", err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }, [azureAccount, subscriptionId, corpName, spClientId, tenantId, resourceGroupName, storageAccountName, updateStep]);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    saveResult(null);
  }, []);

  return {
    steps,
    running,
    done,
    run,
    reset,
    resourceGroupName,
    storageAccountName,
    containerName: TFSTATE_CONTAINER,
  };
}
