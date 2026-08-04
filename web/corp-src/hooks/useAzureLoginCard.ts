import { useEffect, useRef } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import type { CardHook, CardRequirements, CardStatus, LoginHook } from "../types";
import { AZURE_CLIENT_ID } from "../config/azureConfig";
import type { AzureTenant } from "../api/azureGraph";
import { tenantDisplayName } from "../logic/tenant";
import { useAzureAccount, type UseAzureAccount } from "./useAzureAccount";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseAzureLoginCardParams = {
  savedTenantId: string; // AZURE_TENANT_ID as saved on the GitHub environment — auto-applied once known.
};

export interface UseAzureLoginCard extends UseAzureAccount, CardHook, LoginHook<AccountInfo> {
  readonly cardId: "azure_login";
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to Azure")
  summary: string;

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
}

/*
 * The Azure sign-in card — signing in AND picking the tenant, together, since nothing
 * downstream can run without both. The session/tenant state itself lives in
 * useAzureAccount (shared with the subscription and app-registration cards); this
 * projects it onto a card entry, gating everything else behind "signed in + tenant
 * confirmed", and owns the saved-tenant auto-prefill.
 */
export function useAzureLoginCard({ savedTenantId }: UseAzureLoginCardParams): UseAzureLoginCard {
  const azure = useAzureAccount();
  // Which saved tenant value we've already tried to auto-apply, so a fresh save can retrigger it once.
  const appliedSavedTenantRef = useRef<string | null>(null);
  useEffect(() => {
    if (!savedTenantId || appliedSavedTenantRef.current === savedTenantId) return;
    appliedSavedTenantRef.current = savedTenantId;
    azure.selectTenant(savedTenantId);
    // azure itself is a fresh object every render — only its (useCallback-memoized) selectTenant matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTenantId, azure.selectTenant]);

  const done = !!azure.account && azure.confirmedTenantId !== null && !!azure.manualTenantId;
  const azureConfigured = !!AZURE_CLIENT_ID;
  const status: CardStatus = !azureConfigured
    ? "error"
    : azure.account && done
      ? "complete"
      : azure.account
        ? "warning"
        : "idle";
  const summary = !azureConfigured
    ? "Unavailable"
    : !azure.account
      ? "Sign in to Azure"
      : done
        ? [azure.account.username, tenantDisplayName(azure.tenants, azure.confirmedTenantId)]
            .filter(Boolean)
            .join(" · ") || "Signed in"
        : "Select a tenant";

  return {
    ...azure,
    // cardHook
    cardId: "azure_login" as const,
    status,
    summary,
    cardRequirements: [],
    cardDependencyLabel: "Sign in to Azure",
    done,

    savedTenantId,
  };
}
