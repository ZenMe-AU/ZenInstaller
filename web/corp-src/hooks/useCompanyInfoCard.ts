import type { CardHook, CardRequirements, CardStatus } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseCompanyInfoCardParams = {
  variableValues: Record<string, string>; // githubVariables.values — NAME + DNS are this card's own keys.
  envSelected: boolean; // !!github.selectedEnv — this card has no cardRequirements gating it, so it reads this directly.
};

export interface UseCompanyInfoCard extends CardHook {
  readonly cardId: "company_info";
  corpName: string;
  dnsName: string;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

/*
 * The company-info card: a thin projection of GitHub environment variables
 * store onto the two keys (NAME, DNS) this card owns — mirrors useAzureLoginCard/
 * useAzureSubscriptionCard's relationship to useAzureAccount.
 */
export function useCompanyInfoCard({ variableValues, envSelected }: UseCompanyInfoCardParams): UseCompanyInfoCard {
  const corpName = variableValues.NAME ?? "";
  const dnsName = variableValues.DNS ?? "";
  const done = !!corpName && !!dnsName;
  const status: CardStatus = !envSelected ? "idle" : done ? "complete" : "warning";
  const summary = done ? `${corpName} · ${dnsName}` : "Set company info";
  return {
    cardId: "company_info" as const,
    corpName,
    dnsName,
    status,
    summary,
    cardRequirements: ["github_login", "repo"],
    cardDependencyLabel: "Set company info",
    done,
  };
}
