import type { AccountInfo } from "@azure/msal-browser";
import type { CardHook, CardRequirements, LoginHook } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseAzureLoginParams = {
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loggingIn: boolean;
  loginError: string | null;
};

export interface UseAzureLogin extends CardHook, LoginHook<AccountInfo> {
  readonly cardId: "azure_login";
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | null;
  // Narrowed from CardHook (optional there) — every card provides these.
  cardRequirements: CardRequirements;
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to Azure")
}

/*
 * The Azure sign-in card. The session itself lives in useAzureAccount (shared with the
 * subscription and app-registration cards); this only projects it onto a card entry so
 * the card registry can gate everything else behind "signed in to Azure".
 */
export function useAzureLogin({ account, login, logout, loggingIn, loginError }: UseAzureLoginParams): UseAzureLogin {
  return {
    cardId: "azure_login" as const,
    account,
    login,
    logout,
    loggingIn,
    loginError,
    cardRequirements: [],
    cardDependencyLabel: "Sign in to Azure",
    done: !!account,
  };
}
