import type { CardId } from "../types";

// Flags describing the current progress, derived once in App from hook state.
export type cardStatusFlags = {
  isAuthed: boolean;
  isCloneRepo: boolean;
  envSelected: boolean;
  azureSignedIn: boolean;
  subscriptionSelected: boolean;
  hasCompanyInfo: boolean; // NAME + DNS present
  azureSetupReady: boolean; // app registration exists in the tenant AND holds RBAC on the selected subscription
  infraDone: boolean;
};

// A missing prerequisite, plus the tile that resolves it (so it can be clicked to jump there).
export type Requirement = { label: string; target: CardId };

/*
 * Repo-clone and env-selection are both satisfied by the same merged tile, so
 * when both are missing, show one combined line instead of two separate ones.
 */
function repoEnvRequirements(f: cardStatusFlags): Requirement[] {
  const needRepo = !f.isCloneRepo;
  const needEnv = !f.envSelected;
  if (needRepo && needEnv) return [{ label: "Select repository and environment", target: "repo" }];
  if (needRepo) return [{ label: "Select the target repository", target: "repo" }];
  if (needEnv) return [{ label: "Choose an environment", target: "repo" }];
  return [];
}

/*
 * Prerequisites a tile is still missing (empty = unlocked). Fixed order — GitHub, Azure,
 * repo/env, subscription, company info, app registration, infra — regardless of which tile asks.
 */
export function tileRequirements(id: CardId, f: cardStatusFlags): Requirement[] {
  const github: Requirement[] = f.isAuthed ? [] : [{ label: "Sign in to GitHub", target: "auth" }];
  const azure: Requirement[] = f.azureSignedIn ? [] : [{ label: "Sign in to Azure", target: "azure_login" }];
  const env: Requirement[] = f.envSelected ? [] : [{ label: "Choose an environment", target: "repo" }];
  const subscription: Requirement[] = f.subscriptionSelected ? [] : [{ label: "Select a subscription", target: "subscription" }];
  const companyInfo: Requirement[] = f.hasCompanyInfo ? [] : [{ label: "Set company info", target: "company_info" }];
  const appReg: Requirement[] = f.azureSetupReady ? [] : [{ label: "Complete the Azure app registration", target: "azure_setup" }];
  const infra: Requirement[] = f.infraDone ? [] : [{ label: "Set up Core infrastructure", target: "infra" }];

  switch (id) {
    case "subscription":
      return [...azure, ...repoEnvRequirements(f)];
    case "repo":
      return github;
    case "company_info":
      return [...github, ...repoEnvRequirements(f)];
    case "azure_setup":
      return [...github, ...azure, ...repoEnvRequirements(f), ...subscription];
    case "infra":
      return [...azure, ...env, ...subscription, ...companyInfo, ...appReg];
    case "create_domain":
      return [...azure, ...env, ...subscription, ...companyInfo, ...infra];
    default:
      return [];
  }
}
