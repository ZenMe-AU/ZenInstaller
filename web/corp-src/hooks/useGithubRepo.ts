import { useCallback, useEffect, useRef, useState } from "react";
import { checkTemplate, createBranch, fetchBranches, fetchOrgList, fetchRepos, generateRepo } from "../api";
import { PIPELINE } from "../logic/pipeline";
import type { Account, Branch, CardStatus, Repo, RepoOption, User } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseGithubRepo {
  // Accounts
  accounts: Account[];
  selectedAccount: Account | null;
  setSelectedAccount: (a: Account | null) => void;
  // Repos
  repos: Repo[];
  selectedRepo: RepoOption | null;
  setSelectedRepo: (r: RepoOption | null) => void;
  // Template
  templateStatus: "checking" | "ready" | "not_clone";
  templateName: string | null;
  isCloneRepo: boolean;
  repoFullName: string | null;
  // Clone
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  includeAllBranch: boolean;
  setIncludeAllBranch: (v: boolean) => void;
  cloning: boolean;
  cloneError: string | null;
  createEnvs: boolean;
  setCreateEnvs: (v: boolean) => void;
  cloneEnvWarning: string | null;
  // Branches
  branches: Branch[];
  sourceBranch: string;
  setSourceBranch: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  // Status
  status: CardStatus;
  repoLoading: boolean;
  repoRefreshFailed: boolean;
  // Actions
  onClone: () => Promise<void>;
  onCreateBranch: (targetName: string) => Promise<void>;
  onRefresh: () => void;
  restore: {
    account: (value: string) => Promise<void>;
    repo: (value: string) => Promise<void>;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type UseGithubRepoParams = {
  user: User | null;
};

/*
 * The GitHub account/repo/clone/branch layer — not a card. Shared by the repo card
 * (which just needs isCloneRepo) and useGithubEnvironment (which needs the account,
 * selected repo, and branches to load environments and match a branch).
 */
export function useGithubRepo(opts: UseGithubRepoParams): UseGithubRepo {
  // const { pendingRestore, urlAccountApplied, addRestoreWarning, checkRestoreDone } = opts;
  const { validEnvs, templateRepo } = PIPELINE;
  // ── State ─────────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoCache, setRepoCache] = useState<Record<string, Repo[]>>({});
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  const [templateStatus, setTemplateStatus] = useState<"checking" | "ready" | "not_clone">("not_clone");
  const [templateName, setTemplateName] = useState<string | null>(null);

  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [createEnvs, setCreateEnvs] = useState(true);
  const [cloneEnvWarning, setCloneEnvWarning] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [sourceBranch, setSourceBranch] = useState<string>("main");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);

  const [status, setStatus] = useState<CardStatus>("idle");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoRefreshFailed, setRepoRefreshFailed] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCloneRepo = templateStatus === "ready";
  const isNewRepo = selectedRepo?.isNew ?? false;
  const repoFullName =
    selectedAccount && selectedRepo && !isNewRepo ? `${selectedAccount.login}/${selectedRepo.name}` : null;

  // Auto-clear clone error when a different repo is selected
  useEffect(() => {
    setCloneError(null);
  }, [selectedRepo?.id]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Load org list once user authenticates
  useEffect(() => {
    if (!opts.user) return;
    fetchOrgList()
      .then((data) => {
        setAccounts(data);
        setSelectedAccount(data[0] ?? null);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.user]);

  // Fetch repos when account changes
  useEffect(() => {
    setRepos([]);
    setSelectedRepo(null);
    setStatus("idle");
    if (!selectedAccount) return;
    const key = String(selectedAccount.id);
    if (repoCache[key]) {
      setRepos(repoCache[key]);
      return;
    }
    fetchRepos(selectedAccount)
      .then((list) => {
        setRepos(list);
        setRepoCache((prev) => ({ ...prev, [key]: list }));
      })
      .catch(console.error);
    setTemplateName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  // Check template & fetch branches when repo is selected
  useEffect(() => {
    setTemplateStatus("checking");
    setTemplateName(null);
    setBranches([]);
    setStatus("loading");
    if (!selectedAccount || !selectedRepo || selectedRepo.isNew) return;
    checkTemplate(selectedAccount, selectedRepo.name)
      .then((data) => {
        const tName = data.templateName || null;
        setTemplateName(tName);
        const isTemplate = tName !== null && tName === templateRepo;
        setTemplateStatus(isTemplate ? "ready" : "not_clone");
        setStatus(isTemplate ? "complete" : "warning");

        if (isTemplate) {
          fetchBranches(selectedAccount, selectedRepo.name)
            .then((list) => {
              setBranches(list);
              const main = list.find((b) => b.name === "main");
              setSourceBranch(main ? "main" : (list[0]?.name ?? "main"));
            })
            .catch((e) => console.error("Failed to fetch branches:", e));
        }
      })
      .catch((e) => {
        console.error("Failed to check template:", e);
        setTemplateStatus("not_clone");
        setStatus("warning");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepo?.id, selectedAccount?.id]);

  // ── Stable actions ────────────────────────────────────────────────────────
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const selectedAccountRef = useRef(selectedAccount);
  selectedAccountRef.current = selectedAccount;
  const selectedRepoRef = useRef(selectedRepo);
  selectedRepoRef.current = selectedRepo;

  const onClone = useCallback(async () => {
    const acc = selectedAccountRef.current;
    const repo = selectedRepoRef.current;
    if (!acc || !repo) return;
    const name = repo.name;
    if (reposRef.current.find((r) => r.name === name)) {
      setCloneError(`Repository "${name}" already exists`);
      return;
    }
    setCloning(true);
    setCloneError(null);
    setCloneEnvWarning(null);
    try {
      const {
        repo: newRepo,
        envSuccess,
        results,
      } = await generateRepo(acc, name, isPrivate, includeAllBranch, createEnvs, templateRepo, validEnvs);
      const updated = [...reposRef.current, newRepo];
      setRepos(updated);
      setRepoCache((prev) => ({ ...prev, [String(acc.id)]: updated }));
      setSelectedRepo({ id: newRepo.id, name: newRepo.name });
      if (!envSuccess) {
        const failed = results.envs.filter((e) => !e.success).map((e) => e.name);
        setCloneEnvWarning(`Repo created but failed to create environments: ${failed.join(", ")}`);
      }
    } catch {
      setCloneError("Clone failed");
    } finally {
      setCloning(false);
    }
  }, [isPrivate, includeAllBranch, createEnvs]);

  const sourceBranchRef = useRef(sourceBranch);
  sourceBranchRef.current = sourceBranch;

  const onRefresh = useCallback(() => {
    const acc = selectedAccountRef.current;
    if (!acc) return;
    const key = String(acc.id);
    setRepoLoading(true);
    setRepoRefreshFailed(false);
    setRepoCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    Promise.all([fetchOrgList(), fetchRepos(acc)])
      .then(([orgs, list]) => {
        setAccounts(orgs);
        setRepos(list);
        setRepoCache((prev) => ({ ...prev, [key]: list }));
      })
      .catch((e) => {
        console.error(e);
        setRepoRefreshFailed(true);
      })
      .finally(() => setRepoLoading(false));
  }, []);

  const onCreateBranch = useCallback(async (targetName: string) => {
    const acc = selectedAccountRef.current;
    const repo = selectedRepoRef.current;
    if (!acc || !repo) return;
    setCreatingBranch(true);
    setCreateBranchError(null);
    try {
      const newBranch = await createBranch(acc, repo.name, targetName, sourceBranchRef.current);
      setBranches((prev) => [...prev, newBranch]);
    } catch {
      setCreateBranchError("Failed to create branch");
    } finally {
      setCreatingBranch(false);
    }
  }, []);

  const restore = {
    account: async (value: string) => {
      const match = accounts.find((a) => a.login.toLowerCase() === value.toLowerCase());
      if (match) {
        setSelectedAccount(match);
      } else {
        throw new Error(`Account "${value}" not found`);
      }
    },
    repo: async (value: string) => {
      const match = repos.find((r) => r.name.toLowerCase() === value.toLowerCase());
      if (match) {
        setSelectedRepo({ id: match.id, name: match.name });
      } else {
        throw new Error(`Repository "${value}" not found`);
      }
    },
  };

  return {
    accounts,
    selectedAccount,
    setSelectedAccount,
    repos,
    selectedRepo,
    setSelectedRepo,
    templateStatus,
    templateName,
    isCloneRepo,
    repoFullName,
    isPrivate,
    setIsPrivate,
    includeAllBranch,
    setIncludeAllBranch,
    cloning,
    cloneError,
    createEnvs,
    setCreateEnvs,
    cloneEnvWarning,
    branches,
    sourceBranch,
    setSourceBranch,
    creatingBranch,
    createBranchError,
    status,
    repoLoading,
    repoRefreshFailed,
    onClone,
    onCreateBranch,
    onRefresh,
    restore,
  };
}
