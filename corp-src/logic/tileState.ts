import type { CardId, CardStatus } from "../types";
import type { TileFlags } from "./tileRequirements";

// Raw hook-state pulled together once in App and fed to every derivation below —
// cardStatus, the lock flags, and the face summaries all read overlapping slices
// of the same underlying state, so they share one input shape.
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

  isCloneRepo: boolean;
  repoStatus: CardStatus;
  repoFullName: string | null;
  envSelected: boolean;
  envName?: string;

  hasCompanyInfo: boolean;
  corpName: string;
  dnsName: string;

  domainResourcesDone: boolean;
  domainVerified: boolean;
  domainIsPrimary: boolean;

  tfDone: boolean;
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

  return {
    auth: f.isAuthed ? "complete" : "loading",
    // Azure-dependent cards need VITE_AZURE_CLIENT_ID at build time — when it's
    // missing, keep the cards visible but show a "contact admin" error instead
    // of hiding them (a missing card reads as broken, not as "step complete").
    azure_login: !f.azureConfigured ? "error" : f.azureSignedIn ? "complete" : "idle",
    repo: repoEnvStatus,
    company_info: !f.envSelected ? "idle" : f.hasCompanyInfo ? "complete" : "warning",
    azure_setup: !f.azureConfigured
      ? "error"
      : !targetReady
        ? "idle"
        : !f.azureSetupDone
          ? "warning"
          : f.azureSecretsValid === false
            ? "error"
            : "complete", // filled in — validated (true) or not yet run (null) both count as complete
    create_domain: !targetReady ? "idle" : f.domainResourcesDone && f.domainVerified && f.domainIsPrimary ? "complete" : "warning",
    tf_backend: !targetReady ? "idle" : f.tfDone ? "complete" : "warning",
  };
}

export function deriveTileFlags(f: TileStateInput): TileFlags {
  return {
    isAuthed: f.isAuthed,
    isCloneRepo: f.isCloneRepo,
    envSelected: f.envSelected,
    azureSignedIn: f.azureSignedIn,
    hasCompanyInfo: f.hasCompanyInfo,
    domainStorageReady: f.domainResourcesDone,
    hasAzureClientId: f.hasAzureClientId,
  };
}

export function deriveTileSummaries(f: TileStateInput): Partial<Record<CardId, string>> {
  const domainComplete = f.domainResourcesDone && f.domainVerified && f.domainIsPrimary;
  return {
    auth: f.isAuthed ? `Signed in as ${f.userLogin ?? ""}` : "Connect your GitHub account",
    azure_login: !f.azureConfigured ? "Unavailable" : f.azureSignedIn ? (f.azureUsername ?? "Signed in") : "Sign in to Azure",
    repo:
      f.repoFullName && f.envName ? `${f.repoFullName} · ${f.envName}` : f.repoFullName ? f.repoFullName : "Select repository and environment",
    company_info: f.hasCompanyInfo ? `${f.corpName} · ${f.dnsName}` : "Set company info",
    azure_setup: !f.azureConfigured ? "Unavailable" : f.appRegResultPresent ? "App registration ready" : "Create the app registration",
    create_domain: domainComplete ? "Domain verified and primary" : "Set up the corp domain",
    tf_backend: f.tfDone ? "Terraform state container ready" : "Set up the terraform backend",
  };
}
