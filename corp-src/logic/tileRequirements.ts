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

// Human-readable list of the prerequisites a tile is still missing. An empty
// list means the tile is unlocked. The order follows the natural dependency chain.
export function tileRequirements(id: CardId, f: TileFlags): string[] {
  const github = f.isAuthed ? [] : ["Sign in to GitHub"];
  const repo = f.isCloneRepo ? [] : ["Select the target repository"];
  const env = f.envSelected ? [] : ["Choose an environment"];
  const azure = f.azureSignedIn ? [] : ["Sign in to Azure"];

  switch (id) {
    case "repo":
      return github;
    case "company_info":
    case "secrets":
      return [...github, ...repo, ...env];
    case "azure_setup":
      return [...github, ...repo, ...env, ...azure];
    case "azure_vars":
      return f.appRegDone ? [] : ["Create the Azure app registration"];
    case "create_domain":
      return [
        ...azure,
        ...env,
        ...(f.hasCompanyInfo ? [] : ["Set company NAME and DNS"]),
        ...(f.hasSubscription ? [] : ["Select a subscription"]),
      ];
    case "tf_backend":
      return [
        ...azure,
        ...env,
        ...(f.domainStorageReady ? [] : ["Complete corp domain setup"]),
        ...(f.hasAzureClientId ? [] : ["Save AZURE_CLIENT_ID"]),
      ];
    default:
      return [];
  }
}
