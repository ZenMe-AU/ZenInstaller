// Mirrors ZBCorpArchitecture util/namingConvention.cjs — keep in sync.

export function getRootResourceGroupName(corpName: string): string {
  return `root-${corpName}`;
}

export function getLogAnalyticsWorkspaceName(corpName: string): string {
  return `${corpName}-law`;
}

export function getStorageAccountName(corpName: string): string {
  return `${corpName}pvt`.toLowerCase();
}

export function getAppInsightsName(corpName: string): string {
  return `${corpName}-appinsights`;
}

export const TFSTATE_CONTAINER = "terraformstate";
export const DIAGNOSTIC_SETTING_NAME = "standard-diagnostics-setting";
export const DEFAULT_AZURE_LOCATION = "australiaeast";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

// Our own naming scheme for a GitHub Actions federated-credential's display name in Entra
// (unrelated to ZBCorpArchitecture — this one isn't dictated by an external contract).
export function getFederatedCredentialName(org: string, repo: string, environment: string): string {
  const base = `${slug(org)}-${slug(repo)}-${slug(environment)}`;
  return base.length <= 113 ? `github-${base}` : base.slice(0, 120);
}
