// Has browser viewport and URL configuration

export const HOME_URL ="http://localhost:5173/";
export const ACCESS_PASS_URL ="http://localhost:5173/accessPass.html";
export const CORP_URL ="http://localhost:5173/";
export const MOCK_BACKEND_URL = "http://localhost:7071";
export const GITHUB_API_URL = "https://api.github.com";
export const GITHUB_API_URL_REGEX = "https://api\\.github\\.com";
export const AZURE_MANAGEMENT_URL = "https://management.azure.com";
export const MICROSOFT_GRAPH_URL = "https://graph.microsoft.com";
export const MICROSOFT_LOGIN_URL = "https://login.microsoftonline.com";
export const AZURE_MANAGEMENT_SCOPE = `${AZURE_MANAGEMENT_URL}/user_impersonation`;
export const GRAPH_APPLICATION_SCOPE = `${MICROSOFT_GRAPH_URL}/application.readwrite.all`;
export const GRAPH_APP_ROLE_ASSIGNMENT_SCOPE = `${MICROSOFT_GRAPH_URL}/approleassignment.readwrite.all`;

export const SUBSCRIPTION_ID = "Azure subscription 1";
export const TENANT_ID = "bb637822-08bf-4a44-a545-07c062d76976";

export const viewports = {
  Desktop: {width: 1920,height: 1080,},
  Mobile: {width: 414,height: 896,},
} as const;

export type ViewportName = keyof typeof viewports;
export type ViewportSize = (typeof viewports)[ViewportName];