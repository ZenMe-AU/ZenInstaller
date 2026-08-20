import { BrowserAuthError, InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";
import { AZURE_CLIENT_ID } from "../config/azureConfig";
import type { AzureAccount } from "../types";

let _msal: PublicClientApplication | null = null;
let _initialized = false;

export async function getMsal(): Promise<PublicClientApplication | null> {
  if (!AZURE_CLIENT_ID) return null;
  if (!_msal) {
    _msal = new PublicClientApplication({
      auth: {
        clientId: AZURE_CLIENT_ID,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
  }
  if (!_initialized) {
    await _msal.initialize();
    _initialized = true;
  }
  return _msal;
}

// Popup blocked or unavailable — fall back to a redirect. A deliberate cancel is not a failure to retry.
const POPUP_UNAVAILABLE = ["popup_window_error", "empty_window_error", "block_nested_popups"];

export async function ensureScopeConsent(
  account: AzureAccount,
  scopes: string[],
  overrideTenantId?: string,
): Promise<boolean> {
  const msal = await getMsal();
  if (!msal) return false;
  const request = {
    scopes,
    account,
    authority: `https://login.microsoftonline.com/${overrideTenantId || account.tenantId}`,
  };

  try {
    await msal.acquireTokenSilent(request);
    return false;
  } catch (err) {
    if (!(err instanceof InteractionRequiredAuthError)) throw err;
  }

  try {
    await msal.acquireTokenPopup(request);
    return true;
  } catch (err) {
    const code = err instanceof BrowserAuthError ? err.errorCode : "";
    if (!POPUP_UNAVAILABLE.includes(code)) throw err;
    // Navigates away; nothing after this runs.
    await msal.acquireTokenRedirect(request);
    return true;
  }
}
