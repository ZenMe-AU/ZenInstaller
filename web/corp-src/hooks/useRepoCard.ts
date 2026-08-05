import type { CardHook, CardStatus, PendingRestore, User } from "../types";
import { useGithubRepo, type UseGithubRepo } from "./useGithubRepo";
import { useGithubEnvironment, type UseGithubEnvironment } from "./useGithubEnvironment";
import { getEnvSettingsUrl } from "../logic/github";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseRepoCardParams = {
  user: User | null;
};

export interface UseRepoCard extends CardHook, Omit<UseGithubRepo, "restore">, Omit<UseGithubEnvironment, "restore"> {
  readonly cardId: "repo";
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Choose an environment")
  githubEnvUrl: string | undefined;
  restore: {
    account?: (value: string) => Promise<void>;
    repo?: (value: string) => Promise<void>;
    env?: (value: string) => Promise<void>;
  };
}

export function useRepoCard({ user }: UseRepoCardParams): UseRepoCard {
  const githubRepo = useGithubRepo({
    user: user,
  });

  const env = useGithubEnvironment({
    account: githubRepo.selectedAccount,
    repo: githubRepo.selectedRepo,
    isCloneRepo: githubRepo.isCloneRepo,
    selectedPR: undefined,
    branches: githubRepo.branches,
    validEnvs: githubRepo.pipeline.validEnvs,
  });

  const isCloneRepo = githubRepo.isCloneRepo;
  const envReady = env.envReady;
  const envName = env.selectedEnv?.name;

  const envSelected = !!envName;
  // Merged Repository & environment card: complete only when the repo is cloned AND an env is picked.
  const status: CardStatus = !user
    ? "idle"
    : !isCloneRepo
      ? "error"
      : envSelected
        ? env.branchMatchError
          ? "error"
          : "complete"
        : "idle";
  const summary = !isCloneRepo
    ? "Not a clone repository"
    : env.branchMatchError
      ? `${env.branchMatchError}`
      : env.branchMatchWarning
        ? `${env.branchMatchWarning}`
        : githubRepo.repoFullName && envName
          ? `${githubRepo.repoFullName} · ${envName}`
          : !envName
            ? "Select an environment"
            : githubRepo.repoFullName
              ? githubRepo.repoFullName
              : "Select repository and environment";

  const githubEnvUrl =
    githubRepo.repoFullName && env.selectedEnv
      ? getEnvSettingsUrl(githubRepo.repoFullName, env.selectedEnv.id)
      : undefined;

  return {
    ...githubRepo,
    ...env,
    githubEnvUrl,
    // cardHook
    cardId: "repo" as const,
    status,
    summary,
    cardRequirements: ["github_login"],
    cardDependencyLabel: isCloneRepo
      ? envReady
        ? null
        : "Choose an environment"
      : "Select a repository & environment",
    done: isCloneRepo && envReady,
    restore: {
      account: githubRepo.restore.account,
      repo: githubRepo.restore.repo,
      env: env.restore.env,
    },
  };
}
