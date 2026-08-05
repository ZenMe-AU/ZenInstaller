import type { CardHook, CardStatus, PendingRestore, User } from "../types";
import { useGithubRepo, type UseGithubRepo } from "./useGithubRepo";
import { useGithubEnvironment, type UseGithubEnvironment } from "./useGithubEnvironment";
import { getEnvSettingsUrl } from "../logic/github";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseRepoCardParams = {
  user: User | null;
};

export interface UseRepoCard extends CardHook {
  readonly cardId: "repo";
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
  githubEnvUrl: string | undefined;
  repo: UseGithubRepo;
  env: UseGithubEnvironment;
}

export function useRepoCard({ user }: UseRepoCardParams): UseRepoCard {
  const githubRepo = useGithubRepo(user);

  const env = useGithubEnvironment({
    account: githubRepo.selectedAccount,
    repo: githubRepo.selectedRepo,
    isCloneRepo: githubRepo.status === "complete",
    selectedPR: undefined,
    branches: githubRepo.branchList,
  });

  const envReady = env.envReady;
  const envName = env.selectedEnv?.name;

  const envSelected = !!envName;
  // Merged Repository & environment card: complete only when the repo is cloned AND an env is picked.
  const status: CardStatus =
    !user || !githubRepo.selectedAccount || !githubRepo.selectedRepo
      ? "idle"
      : githubRepo.status !== "complete"
        ? "error"
        : envSelected
          ? env.branchMatchError
            ? "error"
            : "complete"
          : "idle";
  const summary =
    !user || !githubRepo.selectedAccount || !githubRepo.selectedRepo
      ? "Select repository and environment"
      : githubRepo.templateStatus !== "ready"
        ? "Not a clone repository"
        : env.branchMatchError
          ? `${env.branchMatchError}`
          : env.branchMatchWarning
            ? `${env.branchMatchWarning}`
            : !envName
              ? "Select an environment"
              : `${githubRepo.repoFullName} · ${envName}`;

  const githubEnvUrl =
    githubRepo.repoFullName && env.selectedEnv
      ? getEnvSettingsUrl(githubRepo.repoFullName, env.selectedEnv.id)
      : undefined;

  return {
    repo: githubRepo,
    env,
    githubEnvUrl,
    // cardHook
    cardId: "repo" as const,
    status,
    summary,
    cardRequirements: ["github_login"],
    cardDependencyLabel:
      githubRepo.status === "complete"
        ? envReady
          ? null
          : "Choose an environment"
        : "Select a repository & environment",
    done: githubRepo.status === "complete" && envReady,
  };
}
