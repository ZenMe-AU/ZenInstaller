import type { CardId } from "../types";

// Flags describing the current progress, derived once in App from hook state.
export type TileFlags = {
  isAuthed: boolean;
  isCloneRepo: boolean;
  envSelected: boolean;
  azureSignedIn: boolean;
  hasCompanyInfo: boolean; // NAME + DNS present
  hasSubscription: boolean;
  appRegDone: boolean;
  domainStorageReady: boolean;
  hasAzureClientId: boolean;
};

// A missing prerequisite, plus the tile that resolves it (so it can be clicked to jump there).
export type Requirement = { label: string; target: CardId };

// The prerequisites a tile is still missing. An empty list means the tile is
// unlocked. Order follows the natural dependency chain.
export function tileRequirements(id: CardId, f: TileFlags): Requirement[] {
  const github: Requirement[] = f.isAuthed ? [] : [{ label: "Sign in to GitHub", target: "auth" }];
  const repo: Requirement[] = f.isCloneRepo ? [] : [{ label: "Select the target repository", target: "repo" }];
  const env: Requirement[] = f.envSelected ? [] : [{ label: "Choose an environment", target: "repo" }];
  const azure: Requirement[] = f.azureSignedIn ? [] : [{ label: "Sign in to Azure", target: "azure_login" }];

  switch (id) {
    case "repo":
      return github;
    case "company_info":
    case "secrets":
      return [...github, ...repo, ...env];
    case "azure_setup":
      return [...github, ...repo, ...env, ...azure];
    case "azure_vars":
      return f.appRegDone ? [] : [{ label: "Create the Azure app registration", target: "azure_setup" }];
    case "create_domain":
      return [
        ...azure,
        ...env,
        ...(f.hasCompanyInfo ? [] : [{ label: "Set company NAME and DNS", target: "company_info" as CardId }]),
        ...(f.hasSubscription ? [] : [{ label: "Select a subscription", target: "azure_setup" as CardId }]),
      ];
    case "tf_backend":
      return [
        ...azure,
        ...env,
        ...(f.domainStorageReady ? [] : [{ label: "Complete corp domain setup", target: "create_domain" as CardId }]),
        ...(f.hasAzureClientId ? [] : [{ label: "Save AZURE_CLIENT_ID", target: "azure_setup" as CardId }]),
      ];
    default:
      return [];
  }
}
