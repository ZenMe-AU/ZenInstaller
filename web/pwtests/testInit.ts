// Has browser viewport and URL configuration

export const HOME_URL ="http://localhost:5173/";
export const ACCESS_PASS_URL ="http://localhost:5173/accessPass.html";
export const CORP_URL ="http://localhost:5173/";

export const SUBSCRIPTION_ID = "Azure subscription 1";
export const TENANT_ID = "bb637822-08bf-4a44-a545-07c062d76976";

export const viewports = {
  Desktop: {width: 1920,height: 1080,},
  Mobile: {width: 414,height: 896,},
} as const;

export type ViewportName = keyof typeof viewports;
export type ViewportSize = (typeof viewports)[ViewportName];