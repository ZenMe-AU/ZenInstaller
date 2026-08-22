import { InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";
import { AZURE_CLIENT_ID } from "../config/azureConfig";
import type { AzureAccount } from "../types";

export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // Microsoft consumer tenant (MSA accounts)

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

export async function ensureScopeConsent(
  account: AzureAccount,
  scopes: string[],
  overrideTenantId?: string,
): Promise<boolean> {
  const msal = await getMsal();
  if (!msal) return false;
  const tenant = overrideTenantId || account.tenantId;
  const authority = tenant !== MSA_TENANT ? `https://login.microsoftonline.com/${tenant}` : undefined;
  const request = {
    scopes,
    account,
    ...(authority ? { authority } : {}),
    loginHint: account.username,
  };

  try {
    await msal.acquireTokenSilent(request);
    return false;
  } catch (err) {
    if (!(err instanceof InteractionRequiredAuthError)) throw err;
  }

  // Navigates away; nothing after this runs. The user re-runs the card on their way back.
  await msal.acquireTokenRedirect(request);
  return true;
}
