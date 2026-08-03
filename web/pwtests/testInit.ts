// Has browser viewport and URL configuration

export const ACCESS_PASS_URL ="http://localhost:5173/accessPass.html";

export const viewports = {
  Desktop: {width: 1920,height: 1080,},
  Mobile: {width: 414,height: 896,},
} as const;

export type ViewportName = keyof typeof viewports;

export type ViewportSize = (typeof viewports)[ViewportName];