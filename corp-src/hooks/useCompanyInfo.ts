import type { CardHook, CardRequirements } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseCompanyInfoParams = {
  variableValues: Record<string, string>; // github.presentVariableValues — NAME + DNS are this card's own keys.
};

export interface UseCompanyInfo extends CardHook {
  readonly cardId: "company_info";
  corpName: string;
  dnsName: string;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string;
}

/*
 * The company-info card: a thin projection of useGithubEnvironment's shared variable
 * store onto the two keys (NAME, DNS) this card owns — mirrors useAzureLogin/
 * useAzureSubscription's relationship to useAzureAccount.
 */
export function useCompanyInfo({ variableValues }: UseCompanyInfoParams): UseCompanyInfo {
  const corpName = variableValues.NAME ?? "";
  const dnsName = variableValues.DNS ?? "";
  return {
    cardId: "company_info" as const,
    corpName,
    dnsName,
    cardRequirements: ["github_login", "repo"],
    cardDependencyLabel: "Set company info",
    done: !!corpName && !!dnsName,
  };
}
