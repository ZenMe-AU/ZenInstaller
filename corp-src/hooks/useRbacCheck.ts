import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { getExistingSP, hasRbacRole } from "../api/azureGraph";

/*
 * Live check for whether the app registration's SP actually holds Contributor +
 * User Access Administrator on the *currently selected* subscription. Catches the
 * "switched subscription within the same tenant" drift: the client id is unchanged
 * and the AZURE_* vars are still saved, so the card would otherwise read as complete
 * while the SP has no access on the new subscription. `null` = unknown/checking.
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
}): boolean | null {
  const [rbacReady, setRbacReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!azureAccount || !spClientId || !subscriptionId) {
        if (!cancelled) setRbacReady(null);
        return;
      }
      if (!cancelled) setRbacReady(null);
      try {
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (cancelled) return;
        if (!sp) {
          setRbacReady(false);
          return;
        }
        const [contributor, uaa] = await Promise.all([
          hasRbacRole(azureAccount, subscriptionId, sp.id, "Contributor", tenantId),
          hasRbacRole(azureAccount, subscriptionId, sp.id, "User Access Administrator", tenantId),
        ]);
        if (!cancelled) setRbacReady(contributor && uaa);
      } catch {
        // Consent/token errors (e.g. before ARM consent) — leave unknown rather than flag missing.
        if (!cancelled) setRbacReady(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, spClientId, subscriptionId, tenantId]);

  return rbacReady;
}
