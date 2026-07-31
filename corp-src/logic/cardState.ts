import type { CardId, CardStatus } from "../types";
import type { RbacCheckStatus } from "../hooks/useRbacCheck";

/*
 * Raw hook-state pulled together once in App and fed to every derivation below —
 * cardStatus, lock flags, and summaries share this one input shape.
 */
export type CardStateInput = {
  isAuthed: boolean;
  userLogin?: string;

  azureConfigured: boolean;
  azureSignedIn: boolean;
  azureUsername?: string;
  azureSetupDone: boolean;
  azureSecretsValid: boolean | null;
  appRegResultPresent: boolean;
  hasAzureClientId: boolean;
  rbacStatus: RbacCheckStatus; // "sp-not-found" = app reg doesn't exist in this tenant; "missing-role" = exists but lacks RBAC on this subscription
  planClientIdMismatch: boolean; // AZURE_PLAN_CLIENT_ID has drifted from AZURE_CLIENT_ID (the app's own flow always keeps them equal)

  isCloneRepo: boolean;
  repoStatus: CardStatus;
  repoFullName: string | null;
  envSelected: boolean;
  envName?: string;

  subscriptionSelected: boolean; // confirmed = saved GitHub vars match the current tenant/subscription pick
  subscriptionLabel?: string;
  subscriptionDrift: boolean; // a pick exists that differs from the saved vars
  subscriptionNoAccess: boolean; // a tenant is chosen but exposes no subscriptions

  hasCompanyInfo: boolean;
  corpName: string;
  dnsName: string;

  infraDone: boolean;

  domainVerified: boolean;
  domainIsPrimary: boolean;
};

export function deriveCardStatus(f: CardStateInput): Record<CardId, CardStatus> {
  // Merged Repository & environment card: complete only when the repo is cloned AND an env is picked.
  const repoEnvStatus: CardStatus = !f.isAuthed ? "idle" : f.isCloneRepo && f.envSelected ? "complete" : f.repoStatus === "idle" ? "idle" : "loading";

  const targetReady = f.isAuthed && f.isCloneRepo && f.envSelected;
  // Target-level prereqs shared by the two setup cards (env + a chosen subscription).
  const setupReady = targetReady && f.subscriptionSelected;
  const domainComplete = f.domainVerified && f.domainIsPrimary;

  return {
    github_login: f.isAuthed ? "complete" : "loading",
    /*
     * Azure-dependent cards need VITE_AZURE_CLIENT_ID at build time — when missing, keep
     * them visible with a "contact admin" error instead of hiding them as if unused.
     */
    azure_login: !f.azureConfigured ? "error" : f.azureSignedIn ? "complete" : "idle",
    azure_subscription: !f.azureConfigured
      ? "error"
      : f.subscriptionSelected
        ? "complete"
        : f.subscriptionDrift || f.subscriptionNoAccess
          ? "warning"
          : "idle",
    repo: repoEnvStatus,
    company_info: !f.envSelected ? "idle" : f.hasCompanyInfo ? "complete" : "warning",
    azure_app_registration: !f.azureConfigured
      ? "error"
      : !targetReady
        ? "idle"
        : !f.azureSetupDone
          ? "warning"
          : f.rbacStatus === "sp-not-found" || f.rbacStatus === "missing-role" || f.planClientIdMismatch
            ? "warning" // vars saved but the app reg is gone from this tenant, the SP lost access, or AZURE_PLAN_CLIENT_ID drifted
            : f.azureSecretsValid === false
              ? "error"
              : "complete", // filled in — validated (true) or not yet run (null) both count as complete
    core_infra: !f.azureConfigured ? "error" : !setupReady ? "idle" : f.infraDone ? "complete" : "warning",
    create_domain: !f.azureConfigured ? "error" : !setupReady ? "idle" : domainComplete ? "complete" : "warning",
  };
}

export function deriveCardSummaries(f: CardStateInput): Partial<Record<CardId, string>> {
  const domainComplete = f.domainVerified && f.domainIsPrimary;
  return {
    github_login: f.isAuthed ? `Signed in as ${f.userLogin ?? ""}` : "Connect your GitHub account",
    azure_login: !f.azureConfigured ? "Unavailable" : f.azureSignedIn ? (f.azureUsername ?? "Signed in") : "Sign in to Azure",
    azure_subscription: !f.azureConfigured
      ? "Unavailable"
      : f.subscriptionSelected
        ? (f.subscriptionLabel ?? "Subscription selected")
        : f.subscriptionDrift
          ? "Unsaved change — save to apply"
          : f.subscriptionNoAccess
            ? "No subscriptions in this tenant"
            : "Select a subscription",
    repo: f.repoFullName && f.envName ? `${f.repoFullName} · ${f.envName}` : f.repoFullName ? f.repoFullName : "Select repository and environment",
    company_info: f.hasCompanyInfo ? `${f.corpName} · ${f.dnsName}` : "Set company info",
    azure_app_registration: !f.azureConfigured
      ? "Unavailable"
      : f.rbacStatus === "sp-not-found"
        ? "Not found in the selected tenant — recreate it"
        : f.rbacStatus === "missing-role"
          ? "Missing access on the selected subscription"
          : f.planClientIdMismatch
            ? "AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID"
            : f.appRegResultPresent
              ? "App registration ready"
              : "Create the app registration",
    core_infra: !f.azureConfigured ? "Unavailable" : f.infraDone ? "Infrastructure ready" : "Set up corp infrastructure",
    create_domain: !f.azureConfigured ? "Unavailable" : domainComplete ? "Domain verified and primary" : "Set up the corp domain",
  };
}
