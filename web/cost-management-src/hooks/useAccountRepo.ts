import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkTemplate,
  createBranch,
  fetchBranches,
  fetchOrgList,
  fetchRepos,
  generateRepo,
} from "../api";
import { PIPELINES } from "../logic/pipeline";
import type {
  Account,
  Branch,
  CardStatus,
  PipelineConfig,
  Repo,
  RepoOption,
  User,
} from "../types";
import type { PendingRestore } from "./useUrlRestore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAccountRepo {
  // Accounts
  accounts: Account[];
  selectedAccount: Account | null;
  setSelectedAccount: (a: Account | null) => void;
  // Repos
  repos: Repo[];
  selectedRepo: RepoOption | null;
  setSelectedRepo: (r: RepoOption | null) => void;
  repoCache: Record<string, Repo[]>;
  // Template
  templateStatus: "checking" | "ready" | "not_clone";
  templateName: string | null;
  isCloneRepo: boolean;
  repoFullName: string | null;
  // Pipeline
  pipeline: PipelineConfig;
  selectedPipeline: string;
  setSelectedPipeline: (key: string) => void;
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
  branchesLoading: boolean;
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
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccountRepo(opts: {
  user: User | null;
  pendingRestore: React.MutableRefObject<PendingRestore>;
  urlAccountApplied: React.MutableRefObject<boolean>;
  addRestoreWarning: (msg: string) => void;
  checkRestoreDone: () => void;
}): UseAccountRepo {
  const { pendingRestore, urlAccountApplied, addRestoreWarning, checkRestoreDone } = opts;

  // ── State ─────────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoCache, setRepoCache] = useState<Record<string, Repo[]>>({});
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  const [templateStatus, setTemplateStatus] = useState<"checking" | "ready" | "not_clone">("not_clone");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<string>("costManagement");

  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [createEnvs, setCreateEnvs] = useState(true);
  const [cloneEnvWarning, setCloneEnvWarning] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [sourceBranch, setSourceBranch] = useState<string>("main");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);

  const [status, setStatus] = useState<CardStatus>("idle");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoRefreshFailed, setRepoRefreshFailed] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCloneRepo = templateStatus === "ready";
  const isNewRepo = selectedRepo?.isNew ?? false;
  const repoFullName = selectedAccount && selectedRepo && !isNewRepo
    ? `${selectedAccount.login}/${selectedRepo.name}`
    : null;
  const pipeline = PIPELINES[selectedPipeline];

  const pipelineRef = useRef(pipeline);
  pipelineRef.current = pipeline;

  // Auto-clear clone error when a different repo is selected
  useEffect(() => { setCloneError(null); }, [selectedRepo?.id]);

  // Re-evaluate template match when user switches pipeline (repo may already be selected)
  const templateNameRef = useRef<string | null>(null);
  templateNameRef.current = templateName;
  useEffect(() => {
    const tName = templateNameRef.current;
    if (!tName) return;
    const isMatch = tName === pipeline.templateRepo;
    setTemplateStatus(isMatch ? "ready" : "not_clone");
    setStatus(isMatch ? "complete" : "warning");
    if (isMatch) {
      const acc = selectedAccountRef.current;
      const repo = selectedRepoRef.current;
      if (acc && repo && !repo.isNew) {
        setBranchesLoading(true);
        fetchBranches(acc, repo.name)
          .then((list) => {
            setBranches(list);
            const main = list.find((b) => b.name === "main");
            setSourceBranch(main ? "main" : (list[0]?.name ?? "main"));
          })
          .catch((e) => console.error("Failed to fetch branches:", e))
          .finally(() => setBranchesLoading(false));
      }
    } else {
      setBranches([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPipeline]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Load org list once user authenticates
  useEffect(() => {
    if (!opts.user) return;
    fetchOrgList()
      .then((data) => {
        setAccounts(data);
        const p = pendingRestore.current;
        const hasUrlParams = p.account !== null || p.repo !== null || p.pr !== null || p.env !== null;
        if (!hasUrlParams) setSelectedAccount(data[0] ?? null);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.user]);

  // URL-restore: apply URL account param once org list is ready (fires exactly once)
  useEffect(() => {
    if (urlAccountApplied.current || !opts.user || accounts.length === 0) return;
    const p = pendingRestore.current;
    if (p.account === null && p.repo === null && p.pr === null && p.env === null) return;
    urlAccountApplied.current = true;
    const targetLogin = p.account;
    const match = targetLogin ? accounts.find((a) => a.login.toLowerCase() === targetLogin.toLowerCase()) : null;
    if (targetLogin && !match) {
      addRestoreWarning(`Account "${targetLogin}" not found or not accessible`);
      p.repo = null; p.pr = null; p.env = null;
    }
    p.account = null;
    setSelectedAccount(match ?? accounts[0] ?? null);
    checkRestoreDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.user, accounts]);

  // Fetch repos when account changes
  useEffect(() => {
    setRepos([]);
    setSelectedRepo(null);
    setStatus("idle");
    if (!selectedAccount) return;
    const key = String(selectedAccount.id);
    const applyRepoRestore = (list: Repo[]) => {
      const p = pendingRestore.current;
      const targetRepo = p.repo;
      p.repo = null;
      if (targetRepo) {
        const match = list.find((r) => r.name === targetRepo);
        if (match) {
          setSelectedRepo({ id: match.id, name: match.name });
        } else {
          addRestoreWarning(`Repository "${targetRepo}" not found`);
          p.pr = null; p.env = null;
        }
      }
      checkRestoreDone();
    };
    if (repoCache[key]) {
      setRepos(repoCache[key]);
      applyRepoRestore(repoCache[key]);
      return;
    }
    fetchRepos(selectedAccount)
      .then((list) => {
        setRepos(list);
        setRepoCache((prev) => ({ ...prev, [key]: list }));
        applyRepoRestore(list);
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
    setBranchesLoading(false);
    setStatus("loading");
    if (!selectedAccount || !selectedRepo || selectedRepo.isNew) return;
    checkTemplate(selectedAccount, selectedRepo.name)
      .then((data) => {
        const tName = data.templateName || null;
        setTemplateName(tName);
        const isTemplate = tName !== null && tName === pipelineRef.current.templateRepo;
        setTemplateStatus(isTemplate ? "ready" : "not_clone");
        setStatus(isTemplate ? "complete" : "warning");

        if (isTemplate) {
          setBranchesLoading(true);
          fetchBranches(selectedAccount, selectedRepo.name)
            .then((list) => {
              setBranches(list);
              const main = list.find((b) => b.name === "main");
              setSourceBranch(main ? "main" : (list[0]?.name ?? "main"));
            })
            .catch((e) => console.error("Failed to fetch branches:", e))
            .finally(() => setBranchesLoading(false));
        } else {
          const rp = pendingRestore.current;
          rp.pr = null; rp.env = null;
          checkRestoreDone();
        }
      })
      .catch((e) => {
        console.error("Failed to check template:", e);
        setTemplateStatus("not_clone");
        setStatus("warning");
        const rp = pendingRestore.current;
        if (rp.pr !== null) rp.pr = null;
        if (rp.env !== null) rp.env = null;
        checkRestoreDone();
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
      const { repo: newRepo, envSuccess, results } = await generateRepo(
        acc, name, isPrivate, includeAllBranch, createEnvs,
        pipeline.templateRepo, pipeline.validEnvs,
      );
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
    setRepoCache((prev) => { const next = { ...prev }; delete next[key]; return next; });
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

  return {
    accounts, selectedAccount, setSelectedAccount,
    repos, selectedRepo, setSelectedRepo, repoCache,
    templateStatus, templateName, isCloneRepo, repoFullName,
    pipeline, selectedPipeline, setSelectedPipeline,
    isPrivate, setIsPrivate, includeAllBranch, setIncludeAllBranch,
    cloning, cloneError, createEnvs, setCreateEnvs, cloneEnvWarning,
    branches, branchesLoading, sourceBranch, setSourceBranch,
    creatingBranch, createBranchError,
    status, repoLoading, repoRefreshFailed,
    onClone, onCreateBranch, onRefresh,
  };
}
