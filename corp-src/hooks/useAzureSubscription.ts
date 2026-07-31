import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { listSubscriptions, type Subscription } from "../api/azureGraph";
import type { CardHook, CardRequirements } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type UseAzureSubscriptionParams = {
  azureAccount: AccountInfo | null;
  confirmedTenantId: string | null;
  manualTenantId: string;
  savedTenantId: string; // AZURE_TENANT_ID as saved on the GitHub environment.
  savedSubscriptionId: string; // AZURE_SUBSCRIPTION_ID as saved on the GitHub environment.
};

export interface UseAzureSubscription extends CardHook {
  readonly cardId: "azure_subscription";
  subscriptions: Subscription[];
  selectedSubscriptionId: string;
  setSelectedSubscriptionId: (id: string) => void;
  subsError: string | null;
  subscriptionDrift: boolean;
  subscriptionNoAccess: boolean;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Select a subscription")
}

// Maps a raw MSAL/AADSTS failure to user-facing text — never surface the raw trace/correlation-id blob.
function friendlySubsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("AADSTS90072")) {
    return "This account isn't a member of that tenant — sign in with a different account, or have an admin add it as a guest first.";
  }
  return "Couldn't load subscriptions for this tenant — check the tenant ID or your access, then try again.";
}

export function useAzureSubscription({
  azureAccount,
  confirmedTenantId,
  manualTenantId,
  savedTenantId,
  savedSubscriptionId,
}: UseAzureSubscriptionParams): UseAzureSubscription {
  const pickedTenant = manualTenantId.trim();

  const [loaded, setLoaded] = useState<{ tenant: string; subs: Subscription[]; error: string | null } | null>(null);
  const [picked, setPicked] = useState<{ tenant: string; id: string } | null>(null);

  const forThisTenant = loaded?.tenant === pickedTenant;
  const subscriptions = forThisTenant ? loaded.subs : [];
  const subsError = forThisTenant ? loaded.error : null;
  const selectedSubscriptionId = picked?.tenant === pickedTenant ? picked.id : "";

  const setSelectedSubscriptionId = (id: string) => setPicked({ tenant: pickedTenant, id });

  // Reload whenever the account or the confirmed tenant changes — the list is per-tenant.
  useEffect(() => {
    if (!azureAccount || confirmedTenantId === null) return;
    let cancelled = false;
    const tenant = confirmedTenantId;
    listSubscriptions(azureAccount, tenant || undefined)
      .then((subs) => {
        if (cancelled) return;
        setLoaded({ tenant, subs, error: subs.length === 0 ? "No subscriptions found for this account." : null });
        if (subs.length === 1) setPicked({ tenant, id: subs[0].id });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ tenant, subs: [], error: friendlySubsError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [azureAccount, confirmedTenantId]);

  const subscriptionConfirmed = !!savedSubscriptionId && savedSubscriptionId === selectedSubscriptionId && savedTenantId === pickedTenant;

  return {
    cardId: "azure_subscription" as const,
    subscriptions,
    selectedSubscriptionId,
    setSelectedSubscriptionId,
    subsError,
    subscriptionDrift: !!selectedSubscriptionId && !subscriptionConfirmed,
    subscriptionNoAccess: !!pickedTenant && !!subsError && subscriptions.length === 0,
    cardRequirements: ["azure_login", "repo"],
    cardDependencyLabel: "Select a subscription",
    done: subscriptionConfirmed,
  };
}
