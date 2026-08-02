import type { CardHook, CardStatus } from "../types";
import type { UseGithubRepo } from "./useGithubRepo";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseRepoCardParams = {
  githubRepo: UseGithubRepo;
  envReady: boolean; // from useGithubEnvironment — the repo card is only done once an env is also chosen.
  isAuthed: boolean; // github_login's own done — this card has no cardRequirements, so it reads this directly.
  envName?: string; // github.selectedEnv?.name
};

// No own fields — this card has nothing to render beyond its CardHook chrome.
// No cardRequirements — the repo card is never locked behind GitHub sign-in today
// (a pre-existing gap, left as-is; see corp-src/App.tsx's card composition comment).
export interface UseRepoCard extends CardHook {
  readonly cardId: "repo";
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
}

/*
 * The repo card: self-reports `done` from useGithubRepo + useGithubEnvironment, which
 * both live upstream of it (App calls useGithubRepo, then useGithubEnvironment, then
 * this). Everything the card actually renders — accounts, repos, branches, the env
 * picker — comes straight from those two shared hooks, not from here.
 */
export function useRepoCard({ githubRepo, envReady, isAuthed, envName }: UseRepoCardParams): UseRepoCard {
  const envSelected = !!envName;
  // Merged Repository & environment card: complete only when the repo is cloned AND an env is picked.
  const status: CardStatus = !isAuthed
    ? "idle"
    : githubRepo.isCloneRepo && envSelected
      ? "complete"
      : githubRepo.status === "idle"
        ? "idle"
        : "loading";
  const summary =
    githubRepo.repoFullName && envName
      ? `${githubRepo.repoFullName} · ${envName}`
      : githubRepo.repoFullName
        ? githubRepo.repoFullName
        : "Select repository and environment";

  return {
    cardId: "repo" as const,
    status,
    summary,
    cardDependencyLabel: "Choose an environment",
    done: githubRepo.isCloneRepo && envReady,
  };
}
