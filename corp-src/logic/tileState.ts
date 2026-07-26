import type { CardId, CardStatus } from "../types";
import type { TileFlags } from "./tileRequirements";

/*
 * Raw hook-state pulled together once in App and fed to every derivation below —
 * cardStatus, lock flags, and summaries share this one input shape.
 */
export type TileStateInput = {
  isAuthed: boolean;
  userLogin?: string;

  azureConfigured: boolean;
  azureSignedIn: boolean;
  azureUsername?: string;
  azureSetupDone: boolean;
  azureSecretsValid: boolean | null;
  appRegResultPresent: boolean;
  hasAzureClientId: boolean;
  rbacReady: boolean | null; // false = SP confirmed missing RBAC on the selected subscription

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

export function deriveCardStatus(f: TileStateInput): Record<CardId, CardStatus> {
  // Merged Repository & environment tile: complete only when the repo is cloned AND an env is picked.
  const repoEnvStatus: CardStatus = !f.isAuthed
    ? "idle"
    : f.isCloneRepo && f.envSelected
      ? "complete"
      : f.repoStatus === "idle"
        ? "idle"
        : "loading";

  const targetReady = f.isAuthed && f.isCloneRepo && f.envSelected;
  // Target-level prereqs shared by the two setup tiles (env + a chosen subscription).
  const setupReady = targetReady && f.subscriptionSelected;
  const domainComplete = f.domainVerified && f.domainIsPrimary;

  return {
    auth: f.isAuthed ? "complete" : "loading",
    /*
     * Azure-dependent cards need VITE_AZURE_CLIENT_ID at build time — when missing, keep
     * them visible with a "contact admin" error instead of hiding them as if unused.
     */
    azure_login: !f.azureConfigured ? "error" : f.azureSignedIn ? "complete" : "idle",
    subscription: !f.azureConfigured
      ? "error"
      : f.subscriptionSelected
        ? "complete"
        : f.subscriptionDrift || f.subscriptionNoAccess
          ? "warning"
          : "idle",
    repo: repoEnvStatus,
    company_info: !f.envSelected ? "idle" : f.hasCompanyInfo ? "complete" : "warning",
    azure_setup: !f.azureConfigured
      ? "error"
      : !targetReady
        ? "idle"
        : !f.azureSetupDone
          ? "warning"
          : f.rbacReady === false
            ? "warning" // vars saved but the SP lost access after a subscription switch
            : f.azureSecretsValid === false
              ? "error"
              : "complete", // filled in — validated (true) or not yet run (null) both count as complete
    infra: !f.azureConfigured ? "error" : !setupReady ? "idle" : f.infraDone ? "complete" : "warning",
    create_domain: !f.azureConfigured ? "error" : !setupReady ? "idle" : domainComplete ? "complete" : "warning",
  };
}

export function deriveTileFlags(f: TileStateInput): TileFlags {
  return {
    isAuthed: f.isAuthed,
    isCloneRepo: f.isCloneRepo,
    envSelected: f.envSelected,
    azureSignedIn: f.azureSignedIn,
    subscriptionSelected: f.subscriptionSelected,
    hasCompanyInfo: f.hasCompanyInfo,
    hasAzureClientId: f.hasAzureClientId,
    infraDone: f.infraDone,
  };
}

export function deriveTileSummaries(f: TileStateInput): Partial<Record<CardId, string>> {
  const domainComplete = f.domainVerified && f.domainIsPrimary;
  return {
    auth: f.isAuthed ? `Signed in as ${f.userLogin ?? ""}` : "Connect your GitHub account",
    azure_login: !f.azureConfigured ? "Unavailable" : f.azureSignedIn ? (f.azureUsername ?? "Signed in") : "Sign in to Azure",
    subscription: !f.azureConfigured
      ? "Unavailable"
      : f.subscriptionSelected
        ? (f.subscriptionLabel ?? "Subscription selected")
        : f.subscriptionDrift
          ? "Unsaved change — save to apply"
          : f.subscriptionNoAccess
            ? "No subscriptions in this tenant"
            : "Select a subscription",
    repo:
      f.repoFullName && f.envName ? `${f.repoFullName} · ${f.envName}` : f.repoFullName ? f.repoFullName : "Select repository and environment",
    company_info: f.hasCompanyInfo ? `${f.corpName} · ${f.dnsName}` : "Set company info",
    azure_setup: !f.azureConfigured
      ? "Unavailable"
      : f.rbacReady === false
        ? "Missing access on the selected subscription"
        : f.appRegResultPresent
          ? "App registration ready"
          : "Create the app registration",
    infra: !f.azureConfigured ? "Unavailable" : f.infraDone ? "Infrastructure ready" : "Set up corp infrastructure",
    create_domain: !f.azureConfigured ? "Unavailable" : domainComplete ? "Domain verified and primary" : "Set up the corp domain",
  };
}
