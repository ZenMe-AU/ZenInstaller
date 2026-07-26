import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getExistingSP, hasRbacRole } from "../api/azureGraph";

export type RbacCheckStatus = "unknown" | "sp-not-found" | "missing-role" | "ready";

/*
 * Live check, once a subscription is confirmed, for whether the app registration's SP
 * actually exists in the *currently selected tenant* and holds Contributor + User Access
 * Administrator on the *currently selected subscription*. Catches two drift cases: the
 * saved client id belonging to a different tenant (app must be recreated there), and the
 * SP existing but lacking access after a subscription switch within the same tenant.
 * "unknown" = not enough info yet, or a transient/consent error — don't flag as broken.
 */
export function useRbacCheck({
  azureAccount,
  spClientId,
  subscriptionId,
  tenantId,
}: {
  azureAccount: AccountInfo | null;
  spClientId: string;
  subscriptionId: string;
  tenantId?: string;
}): RbacCheckStatus {
  const [status, setStatus] = useState<RbacCheckStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!azureAccount || !spClientId || !subscriptionId) {
        if (!cancelled) setStatus("unknown");
        return;
      }
      if (!cancelled) setStatus("unknown");
      try {
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (cancelled) return;
        if (!sp) {
          setStatus("sp-not-found");
          return;
        }
        const [contributor, uaa] = await Promise.all([
          hasRbacRole(azureAccount, subscriptionId, sp.id, "Contributor", tenantId),
          hasRbacRole(azureAccount, subscriptionId, sp.id, "User Access Administrator", tenantId),
        ]);
        if (!cancelled) setStatus(contributor && uaa ? "ready" : "missing-role");
      } catch {
        // Consent/token errors (e.g. before ARM consent) — leave unknown rather than flag missing.
        if (!cancelled) setStatus("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, spClientId, subscriptionId, tenantId]);

  return status;
}
