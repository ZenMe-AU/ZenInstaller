import type { CardHook } from "../types";
import type { UseGithubRepo } from "./useGithubRepo";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseRepoParams = {
  githubRepo: UseGithubRepo;
  envReady: boolean; // from useGithubEnvironment — the repo card is only done once an env is also chosen.
};

// No own fields — this card has nothing to render beyond its CardHook chrome.
// No cardRequirements — the repo card is never locked behind GitHub sign-in today
// (a pre-existing gap, left as-is; see corp-src/App.tsx's card composition comment).
export interface UseRepo extends CardHook {
  readonly cardId: "repo";
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
}

/*
 * The repo card: self-reports `done` from useGithubRepo + useGithubEnvironment, which
 * both live upstream of it (App calls useGithubRepo, then useGithubEnvironment, then
 * this). Everything the card actually renders — accounts, repos, branches, the env
 * picker — comes straight from those two shared hooks, not from here.
 */
export function useRepo({ githubRepo, envReady }: UseRepoParams): UseRepo {
  return {
    cardId: "repo" as const,
    cardDependencyLabel: "Choose an environment",
    done: githubRepo.isCloneRepo && envReady,
  };
}
