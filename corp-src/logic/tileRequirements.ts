import type { CardId } from "../types";

// Flags describing the current progress, derived once in App from hook state.
export type TileFlags = {
  isAuthed: boolean;
  isCloneRepo: boolean;
  envSelected: boolean;
  azureSignedIn: boolean;
  hasCompanyInfo: boolean; // NAME + DNS present
  domainStorageReady: boolean;
  hasAzureClientId: boolean;
};

// A missing prerequisite, plus the tile that resolves it (so it can be clicked to jump there).
export type Requirement = { label: string; target: CardId };

/*
 * Repo-clone and env-selection are both satisfied by the same merged tile, so
 * when both are missing, show one combined line instead of two separate ones.
 */
function repoEnvRequirements(f: TileFlags): Requirement[] {
  const needRepo = !f.isCloneRepo;
  const needEnv = !f.envSelected;
  if (needRepo && needEnv) return [{ label: "Select repository and environment", target: "repo" }];
  if (needRepo) return [{ label: "Select the target repository", target: "repo" }];
  if (needEnv) return [{ label: "Choose an environment", target: "repo" }];
  return [];
}

/*
 * Prerequisites a tile is still missing (empty = unlocked). Fixed order — GitHub, Azure,
 * repo/env, company info, app registration, domain — regardless of which tile is asking.
 */
export function tileRequirements(id: CardId, f: TileFlags): Requirement[] {
  const github: Requirement[] = f.isAuthed ? [] : [{ label: "Sign in to GitHub", target: "auth" }];
  const azure: Requirement[] = f.azureSignedIn ? [] : [{ label: "Sign in to Azure", target: "azure_login" }];
  const env: Requirement[] = f.envSelected ? [] : [{ label: "Choose an environment", target: "repo" }];
  const companyInfo: Requirement[] = f.hasCompanyInfo ? [] : [{ label: "Set company info", target: "company_info" }];
  const appReg: Requirement[] = f.hasAzureClientId ? [] : [{ label: "Set app registration detail", target: "azure_setup" }];
  const domain: Requirement[] = f.domainStorageReady ? [] : [{ label: "Verify corp domain", target: "create_domain" }];

  switch (id) {
    case "repo":
      return github;
    case "company_info":
      return [...github, ...repoEnvRequirements(f)];
    case "azure_setup":
      return [...github, ...azure, ...repoEnvRequirements(f)];
    case "create_domain":
      return [...azure, ...env, ...companyInfo];
    case "tf_backend":
      return [...azure, ...env, ...appReg, ...domain];
    default:
      return [];
  }
}
