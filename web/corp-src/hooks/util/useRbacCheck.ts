import { useEffect, useState } from "react";
import { getExistingSP, hasRbacRole } from "../../api/azureGraph";
import type { AzureSpTarget } from "../../types";

export type RbacCheckStatus = "unknown" | "sp-not-found" | "missing-role" | "ready";
export type RbacCheckResult = { status: RbacCheckStatus; missingRoles: string[] };

const IDLE: RbacCheckResult = { status: "unknown", missingRoles: [] };

/*
 * Live check, once a subscription is confirmed, for whether the app registration's SP
 * actually exists in the *currently selected tenant* and holds Contributor + User Access
 * Administrator on the *currently selected subscription*. Catches two drift cases: the
 * saved client id belonging to a different tenant (app must be recreated there), and the
 * SP existing but lacking access after a subscription switch within the same tenant.
 * "unknown" = not enough info yet, or a transient/consent error — don't flag as broken.
 * `missingRoles` names exactly which role(s) are absent, so "I already granted Contributor"
 * can be diagnosed precisely instead of a generic "no access" verdict.
 */
export type UseRbacCheckParams = AzureSpTarget;

export function useRbacCheck({
  azureAccount,
  spClientId,
  subscriptionId,
  tenantId,
}: UseRbacCheckParams): RbacCheckResult {
  const [result, setResult] = useState<RbacCheckResult>(IDLE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!azureAccount || !spClientId || !subscriptionId) {
        if (!cancelled) setResult(IDLE);
        return;
      }
      if (!cancelled) setResult(IDLE);
      try {
        const sp = await getExistingSP(azureAccount, spClientId, tenantId);
        if (cancelled) return;
        if (!sp) {
          setResult({ status: "sp-not-found", missingRoles: [] });
          return;
        }
        const [contributor, uaa] = await Promise.all([
          hasRbacRole(azureAccount, subscriptionId, sp.id, "Contributor", tenantId),
          hasRbacRole(azureAccount, subscriptionId, sp.id, "User Access Administrator", tenantId),
        ]);
        const missingRoles = [...(contributor ? [] : ["Contributor"]), ...(uaa ? [] : ["User Access Administrator"])];
        if (!cancelled) setResult({ status: missingRoles.length === 0 ? "ready" : "missing-role", missingRoles });
      } catch {
        // Consent/token errors (e.g. before ARM consent) — leave unknown rather than flag missing.
        if (!cancelled) setResult(IDLE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [azureAccount, spClientId, subscriptionId, tenantId]);

  return result;
}
