import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "../api/msal";
import { DOMAIN_SCOPES } from "../config/azureConfig";
import {
  ensureResourceGroup,
  ensureLogAnalyticsWorkspace,
  ensureSubscriptionDiagnostics,
  ensureAppInsights,
  ensureDnsZone,
  ensureDnsTxtRecord,
  ensureStorageAccount,
  listLocations,
  type AzureLocation,
} from "../api/azureArm";
import {
  getEntraDomain,
  createEntraDomain,
  getDomainVerificationTxt,
  verifyEntraDomain,
  setPrimaryEntraDomain,
} from "../api/azureGraph";
import {
  getRootResourceGroupName,
  getLogAnalyticsWorkspaceName,
  getStorageAccountName,
  getAppInsightsName,
  DIAGNOSTIC_SETTING_NAME,
  DEFAULT_AZURE_LOCATION,
} from "../logic/naming";
import type { SetupStep } from "./useAzureSetup";

export type CreateDomainResult = {
  corpName: string;
  dnsName: string;
  subscriptionId: string;
  nameServers: string[];
  domainVerified: boolean;
  isPrimary: boolean;
};

const RESULT_KEY = "zeninstaller_create_domain_result";

function saveResult(r: CreateDomainResult | null) {
  if (r) localStorage.setItem(RESULT_KEY, JSON.stringify(r));
  else localStorage.removeItem(RESULT_KEY);
}
function loadResult(): CreateDomainResult | null {
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) ?? "null");
  } catch {
    return null;
  }
}

const isConsentError = (msg: string) =>
  msg.includes("interaction_required") || msg.includes("consent_required") || msg.includes("AADSTS65001");

export function useCreateDomainSetup({
  azureAccount,
  defaultSubscriptionId,
  corpName,
  dnsName,
  tenantId,
}: {
  azureAccount: AccountInfo | null;
  /** Subscription to prefill from — typically the AZURE_SUBSCRIPTION_ID env variable. Overridable via setSubscriptionId. */
  defaultSubscriptionId: string;
  corpName: string;
  dnsName: string;
  /** Target AAD tenant — required for MSA (personal) accounts where account.tenantId is the consumer tenant. */
  tenantId?: string;
}) {
  const [subscriptionId, setSubscriptionIdState] = useState(defaultSubscriptionId);
  const userPickedSubRef = useRef(false);

  // Keep in sync with the env-derived default until the user explicitly picks one in this card.
  useEffect(() => {
    if (!userPickedSubRef.current && defaultSubscriptionId) setSubscriptionIdState(defaultSubscriptionId);
  }, [defaultSubscriptionId]);

  const setSubscriptionId = useCallback((id: string) => {
    userPickedSubRef.current = true;
    setSubscriptionIdState(id);
  }, []);

  const [location, setLocation] = useState(DEFAULT_AZURE_LOCATION);
  const [locations, setLocations] = useState<AzureLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CreateDomainResult | null>(loadResult);
  const [nameServers, setNameServers] = useState<string[]>(loadResult()?.nameServers ?? []);
  const [domainVerified, setDomainVerified] = useState<boolean>(loadResult()?.domainVerified ?? false);
  const [isPrimary, setIsPrimary] = useState<boolean>(loadResult()?.isPrimary ?? false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // A persisted result only counts if it matches the current NAME/DNS/subscription.
  const resultMatches = !!result && result.corpName === corpName && result.dnsName === dnsName && result.subscriptionId === subscriptionId;
  const resourcesDone = resultMatches;

  // Drop stale persisted state when the target changes.
  useEffect(() => {
    if (result && !resultMatches) {
      setNameServers([]);
      setDomainVerified(false);
      setIsPrimary(false);
      setSteps([]);
    }
  }, [result, resultMatches]);

  const resourceGroupName = getRootResourceGroupName(corpName);
  const lawName = getLogAnalyticsWorkspaceName(corpName);
  const storageAccountName = getStorageAccountName(corpName);
  const appInsightsName = getAppInsightsName(corpName);

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

  // Once a subscription is known (default or user-picked), check Microsoft Graph directly for
  // whether this domain is already done — verified AND set primary — instead of only trusting
  // localStorage, which won't reflect setup done previously, on another device, or by hand.
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkStatusError, setCheckStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!azureAccount || !subscriptionId || !corpName || !dnsName) return;
    let cancelled = false;
    setCheckingStatus(true);
    setCheckStatusError(null);
    getEntraDomain(azureAccount, dnsName, tenantId)
      .then((domain) => {
        if (cancelled || !domain) return;
        setDomainVerified(domain.isVerified);
        setIsPrimary(domain.isDefault);
        if (domain.isVerified && domain.isDefault) {
          const r: CreateDomainResult = { corpName, dnsName, subscriptionId, nameServers: [], domainVerified: true, isPrimary: true };
          setResult(r);
          saveResult(r);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        // Consent errors are expected before Domain.ReadWrite.All has been granted —
        // don't surface or redirect here; run()/verify() prompt for consent on user action.
        if (!isConsentError(msg)) setCheckStatusError(msg || "Failed to check domain status");
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, subscriptionId, corpName, dnsName, tenantId]);

  const updateStep = useCallback((id: string, status: SetupStep["status"], detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  // Redirects for Domain.ReadWrite.All incremental consent; user re-runs after returning.
  const requestDomainConsent = useCallback(async () => {
    if (!azureAccount) return;
    const msal = await getMsal();
    if (!msal) return;
    await msal.acquireTokenRedirect({
      scopes: DOMAIN_SCOPES,
      account: azureAccount,
      authority: `https://login.microsoftonline.com/${tenantId || azureAccount.tenantId}`,
    });
  }, [azureAccount, tenantId]);

  const run = useCallback(async () => {
    if (!azureAccount || !subscriptionId || !corpName || !dnsName) return;
    setRunning(true);
    setVerifyError(null);

    const initialSteps: SetupStep[] = [
      { id: "rg", label: `Create resource group ${resourceGroupName}`, status: "pending" },
      { id: "law", label: `Create Log Analytics workspace ${lawName}`, status: "pending" },
      { id: "diag", label: "Configure subscription activity-log diagnostics", status: "pending" },
      { id: "appins", label: `Create Application Insights ${appInsightsName}`, status: "pending" },
      { id: "dns", label: `Create DNS zone ${dnsName}`, status: "pending" },
      { id: "domain", label: "Add custom domain to Entra ID", status: "pending" },
      { id: "txt", label: "Create domain-verification TXT record", status: "pending" },
      { id: "primary", label: "Set as primary domain", status: "pending" },
      { id: "storage", label: `Create storage account ${storageAccountName}`, status: "pending" },
    ];
    setSteps(initialSteps);

    let currentStep = "rg";
    try {
      currentStep = "rg";
      updateStep("rg", "running");
      const rgResult = await ensureResourceGroup(azureAccount, subscriptionId, resourceGroupName, location, tenantId);
      updateStep("rg", rgResult === "exists" ? "skipped" : "done", rgResult === "exists" ? "Already exists" : undefined);

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

      currentStep = "dns";
      updateStep("dns", "running");
      const zone = await ensureDnsZone(azureAccount, subscriptionId, resourceGroupName, dnsName, tenantId);
      setNameServers(zone.nameServers);
      updateStep("dns", zone.result === "exists" ? "skipped" : "done", zone.nameServers.join(", "));

      currentStep = "domain";
      updateStep("domain", "running");
      let domain = await getEntraDomain(azureAccount, dnsName, tenantId);
      if (domain) {
        updateStep("domain", "skipped", domain.isVerified ? "Already added and verified" : "Already added — not yet verified");
      } else {
        domain = await createEntraDomain(azureAccount, dnsName, tenantId);
        updateStep("domain", "done");
      }
      setDomainVerified(domain.isVerified);

      currentStep = "txt";
      if (domain.isVerified) {
        updateStep("txt", "skipped", "Domain already verified");
      } else {
        updateStep("txt", "running");
        const txtToken = await getDomainVerificationTxt(azureAccount, dnsName, tenantId);
        if (!txtToken) throw new Error("No TXT verification record returned by Microsoft Graph");
        const txt = await ensureDnsTxtRecord(azureAccount, subscriptionId, resourceGroupName, dnsName, txtToken, tenantId);
        updateStep("txt", txt === "exists" ? "skipped" : "done", txtToken);
      }

      currentStep = "primary";
      let primaryNow = false;
      if (!domain.isVerified) {
        updateStep("primary", "skipped", "Set automatically after domain verification");
      } else if (domain.isDefault) {
        updateStep("primary", "skipped", "Already the primary domain");
        primaryNow = true;
      } else {
        updateStep("primary", "running");
        await setPrimaryEntraDomain(azureAccount, dnsName, tenantId);
        updateStep("primary", "done");
        primaryNow = true;
      }
      setIsPrimary(primaryNow);

      currentStep = "storage";
      updateStep("storage", "running");
      const storage = await ensureStorageAccount(azureAccount, subscriptionId, resourceGroupName, storageAccountName, location, tenantId);
      updateStep("storage", storage === "exists" ? "skipped" : "done", storage === "exists" ? "Already exists" : undefined);

      const r: CreateDomainResult = {
        corpName,
        dnsName,
        subscriptionId,
        nameServers: zone.nameServers,
        domainVerified: domain.isVerified,
        isPrimary: primaryNow,
      };
      setResult(r);
      saveResult(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (isConsentError(msg)) {
        updateStep(currentStep, "error", "Additional consent required — redirecting to Microsoft...");
        await requestDomainConsent().catch(() => updateStep(currentStep, "error", "Consent redirect failed — try again"));
      } else {
        updateStep(currentStep, "error", msg);
      }
    } finally {
      setRunning(false);
    }
  }, [
    azureAccount, subscriptionId, corpName, dnsName, location, tenantId,
    resourceGroupName, lawName, storageAccountName, appInsightsName,
    updateStep, requestDomainConsent,
  ]);

  // Verifies the domain (if needed) and promotes it to primary — one button drives both.
  const verify = useCallback(async () => {
    if (!azureAccount || !dnsName) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const domain = domainVerified
        ? await getEntraDomain(azureAccount, dnsName, tenantId)
        : await verifyEntraDomain(azureAccount, dnsName, tenantId);
      if (!domain) throw new Error(`Domain ${dnsName} not found in tenant`);
      setDomainVerified(domain.isVerified);

      let primary = domain.isDefault;
      if (!domain.isVerified) {
        setVerifyError("Verification did not complete — DNS may still be propagating. Try again shortly.");
      } else if (!primary) {
        try {
          await setPrimaryEntraDomain(azureAccount, dnsName, tenantId);
          primary = true;
        } catch (err) {
          setVerifyError(`Domain verified, but setting it as primary failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }
      setIsPrimary(primary);

      if (result) {
        const r = { ...result, domainVerified: domain.isVerified, isPrimary: primary };
        setResult(r);
        saveResult(r);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setVerifyError(
        isConsentError(msg)
          ? "Additional consent required — run the setup once to grant it."
          : "Verification failed — make sure your registrar's NS records point to the Azure DNS name servers, then retry after DNS propagates.",
      );
      if (!isConsentError(msg)) console.warn("[create-domain] verify failed:", msg);
    } finally {
      setVerifying(false);
    }
  }, [azureAccount, dnsName, tenantId, domainVerified, result]);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    saveResult(null);
    setNameServers([]);
    setDomainVerified(false);
    setIsPrimary(false);
    setVerifyError(null);
  }, []);

  return {
    subscriptionId,
    setSubscriptionId,
    checkingStatus,
    checkStatusError,
    location,
    setLocation,
    locations,
    locationsLoading,
    locationsError,
    steps,
    running,
    resourcesDone,
    nameServers,
    domainVerified,
    isPrimary,
    verifying,
    verifyError,
    verify,
    run,
    reset,
    resourceGroupName,
    lawName,
    storageAccountName,
    appInsightsName,
  };
}
