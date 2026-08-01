import { useEffect, useRef } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import type { CardHook, CardRequirements, LoginHook } from "../types";
import type { AzureTenant } from "../api/azureGraph";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseAzureLoginParams = {
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loggingIn: boolean;
  loginError: string | null;
  tenants: AzureTenant[];
  manualTenantId: string;
  setManualTenantId: (id: string) => void;
  confirmedTenantId: string | null;
  selectTenant: (tenantId: string) => void;
  tenantIdError: string | null;
  savedTenantId: string; // AZURE_TENANT_ID as saved on the GitHub environment — auto-applied once known.
};

export interface UseAzureLogin extends CardHook, LoginHook<AccountInfo> {
  readonly cardId: "azure_login";
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | null;
  tenants: AzureTenant[];
  manualTenantId: string;
  setManualTenantId: (id: string) => void;
  confirmedTenantId: string | null;
  selectTenant: (tenantId: string) => void;
  tenantIdError: string | null;
  savedTenantId: string;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to Azure")
}

/*
 * The Azure sign-in card — signing in AND picking the tenant, together, since nothing
 * downstream can run without both. The session/tenant state itself lives in
 * useAzureAccount (shared with the subscription and app-registration cards); this
 * projects it onto a card entry, gating everything else behind "signed in + tenant
 * confirmed", and owns the saved-tenant auto-prefill.
 */
export function useAzureLogin({
  account,
  login,
  logout,
  loggingIn,
  loginError,
  tenants,
  manualTenantId,
  setManualTenantId,
  confirmedTenantId,
  selectTenant,
  tenantIdError,
  savedTenantId,
}: UseAzureLoginParams): UseAzureLogin {
  // Which saved tenant value we've already tried to auto-apply, so a fresh save can retrigger it once.
  const appliedSavedTenantRef = useRef<string | null>(null);
  useEffect(() => {
    if (!savedTenantId || appliedSavedTenantRef.current === savedTenantId) return;
    appliedSavedTenantRef.current = savedTenantId;
    selectTenant(savedTenantId);
  }, [savedTenantId, selectTenant]);

  return {
    cardId: "azure_login" as const,
    account,
    login,
    logout,
    loggingIn,
    loginError,
    tenants,
    manualTenantId,
    setManualTenantId,
    confirmedTenantId,
    selectTenant,
    tenantIdError,
    savedTenantId,
    cardRequirements: [],
    cardDependencyLabel: "Sign in to Azure",
    done: !!account && confirmedTenantId !== null,
  };
}
