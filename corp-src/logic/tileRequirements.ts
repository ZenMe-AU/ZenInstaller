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

// Repo-clone and env-selection are both satisfied by the same merged tile, so
// when both are missing, show one combined line instead of two separate ones.
function repoEnvRequirements(f: TileFlags): Requirement[] {
  const needRepo = !f.isCloneRepo;
  const needEnv = !f.envSelected;
  if (needRepo && needEnv) return [{ label: "Select repository and environment", target: "repo" }];
  if (needRepo) return [{ label: "Select the target repository", target: "repo" }];
  if (needEnv) return [{ label: "Choose an environment", target: "repo" }];
  return [];
}

// The prerequisites a tile is still missing. An empty list means the tile is
// unlocked. Order follows the natural dependency chain.
export function tileRequirements(id: CardId, f: TileFlags): Requirement[] {
  const github: Requirement[] = f.isAuthed ? [] : [{ label: "Sign in to GitHub", target: "auth" }];
  const env: Requirement[] = f.envSelected ? [] : [{ label: "Choose an environment", target: "repo" }];
  const azure: Requirement[] = f.azureSignedIn ? [] : [{ label: "Sign in to Azure", target: "azure_login" }];

  switch (id) {
    case "repo":
      return github;
    case "company_info":
      return [...github, ...repoEnvRequirements(f)];
    case "azure_setup":
      return [...github, ...repoEnvRequirements(f), ...azure];
    case "create_domain":
      return [...azure, ...env, ...(f.hasCompanyInfo ? [] : [{ label: "Set company info", target: "company_info" as CardId }])];
    case "tf_backend":
      return [
        ...azure,
        ...env,
        ...(f.domainStorageReady ? [] : [{ label: "Complete corp domain setup", target: "create_domain" as CardId }]),
        ...(f.hasAzureClientId ? [] : [{ label: "Set app registration detail", target: "azure_setup" as CardId }]),
      ];
    default:
      return [];
  }
}
