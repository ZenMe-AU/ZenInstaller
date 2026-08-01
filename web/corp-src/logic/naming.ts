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
