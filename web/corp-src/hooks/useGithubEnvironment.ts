import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEnvs, /* fetchSecrets, */ fetchVariables } from "../api";
import { type Account, type Branch, type CardStatus, type GhEnv, type RepoOption } from "../types";
import { matchBranch } from "../logic/env";
import { findIgnoreCase } from "../logic/search";
// ─── Types ────────────────────────────────────────────────────────────────────
export interface UseGithubEnvironment {
  // Env
  envList: GhEnv[];
  selectedEnv: GhEnv | null;
  setSelectedEnv: (env: GhEnv | null) => void;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  // Status
  envLoading: boolean;
  status: CardStatus;
  envRefreshFailed: boolean;
  // Variables
  presentVariableValues: Record<string, string>;
  variablesRechecking: boolean;
  varRecheckFailed: boolean;
  // Actions
  onRefresh: () => void;
  onVariableRecheck: () => Promise<void>;
  onVariableConfirmed: (key: string, value: string) => void;
  // Restore
  restore: {
    env: (value: string) => Promise<void>;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type UseGithubEnvironmentParams = {
  account: Account | null;
  repo: RepoOption | null;
  isRepoReady: boolean;
  branches: Branch[];
};

export function useGithubEnvironment(opts: UseGithubEnvironmentParams): UseGithubEnvironment {
  const accountRef = useRef(opts.account);
  const repoRef = useRef(opts.repo);
  useEffect(() => {
    accountRef.current = opts.account;
    repoRef.current = opts.repo;
  });

  // ── Env state ─────────────────────────────────────────────────────────────
  const [envList, setEnvList] = useState<GhEnv[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<GhEnv | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [branchMatchWarning, setBranchMatchWarning] = useState<string | null>(null);
  const [branchMatchError, setBranchMatchError] = useState<string | null>(null);
  const [status, setStatus] = useState<CardStatus>("idle");

  // ── Variables state ──────────────────────────────────────────────
  const [presentVariableValues, setPresentVariableValues] = useState<Record<string, string>>({});
  const [variablesRechecking, setVariablesRechecking] = useState(false);
  const [envRefreshFailed, setEnvRefreshFailed] = useState(false);
  const [varRecheckFailed, setVarRecheckFailed] = useState(false);

  // Clear env + secrets when repo changes
  const prevRepoId = useRef<number | string | null | undefined>(undefined);
  useEffect(() => {
    const newId = opts.repo?.id ?? null;
    if (prevRepoId.current !== undefined && prevRepoId.current !== newId) {
      setEnvList([]);
      setSelectedEnv(null);
      setBranchMatchWarning(null);
      setBranchMatchError(null);
      setStatus("idle");
    }
    prevRepoId.current = newId;
  }, [opts.repo?.id]);

  // Clear secrets when env changes (selectedEnv is internal state, always null on mount)
  useEffect(() => {
    setPresentVariableValues({});
  }, [selectedEnv?.id]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadEnvs = useCallback(async (account: Account, repo: RepoOption) => {
    setEnvLoading(true);
    setEnvRefreshFailed(false);
    try {
      const list = await fetchEnvs(account, repo.name);
      setEnvList(list);
    } catch (e) {
      console.error(e);
      setEnvRefreshFailed(true);
    } finally {
      setEnvLoading(false);
    }
  }, []);

  const loadVariables = useCallback(async (envName: string): Promise<boolean> => {
    const acc = accountRef.current;
    const repo = repoRef.current;
    if (!acc || !repo) return false;
    try {
      setPresentVariableValues(await fetchVariables(acc, repo.name, envName));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, []);

  // Load envs when repo is ready
  useEffect(() => {
    if (!opts.account || !opts.repo || !opts.isRepoReady) return;
    loadEnvs(opts.account, opts.repo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.account?.id, opts.repo?.id, opts.isRepoReady, loadEnvs]);

  // Auto-load secrets + variables when env is confirmed (selected + no branch error)
  useEffect(() => {
    if (!selectedEnv || branchMatchError) return;
    loadVariables(selectedEnv.name);
  }, [selectedEnv, branchMatchError, loadVariables]);

  // When env selected: match against branch list
  useEffect(() => {
    if (!selectedEnv) {
      setBranchMatchWarning(null);
      setBranchMatchError(null);
      setStatus("idle");
      return;
    }
    const result = matchBranch(selectedEnv.name, opts.branches);
    if (result.status === "exact") {
      setBranchMatchWarning(null);
      setBranchMatchError(null);
      setStatus("complete");
    } else if (result.status === "case") {
      setBranchMatchWarning(
        `Environment "${selectedEnv.name}" and branch "${result.branch.name}" have mismatched casing.`,
      );
      setBranchMatchError(null);
      setStatus("warning");
    } else if (result.status === "multiple") {
      setBranchMatchWarning(null);
      setBranchMatchError(`Multiple branches match environment "${selectedEnv.name}". Please resolve the conflict.`);
      setStatus("error");
    } else {
      setBranchMatchWarning(null);
      setBranchMatchError(`No branch found matching environment "${selectedEnv.name}".`);
      setStatus("error");
    }
  }, [selectedEnv, opts.branches]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    const acc = accountRef.current;
    const repo = repoRef.current;
    if (acc && repo) loadEnvs(acc, repo);
  }, [loadEnvs]);

  const onVariableRecheck = useCallback(async () => {
    if (!selectedEnv) return;
    setVariablesRechecking(true);
    setVarRecheckFailed(false);
    try {
      const ok = await loadVariables(selectedEnv.name);
      if (!ok) setVarRecheckFailed(true);
    } finally {
      setVariablesRechecking(false);
    }
  }, [selectedEnv, loadVariables]);

  const onVariableConfirmed = useCallback((key: string, value: string) => {
    setPresentVariableValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const restoreEnv = useCallback(
    async (value: string) => {
      const match = findIgnoreCase(envList, (e) => e.name, value);
      if (!match) {
        throw new Error(`Environment "${value}" not found`);
      }
      setSelectedEnv(match);
    },
    [envList],
  );

  return {
    // Env
    envList,
    selectedEnv,
    setSelectedEnv,
    branchMatchWarning,
    branchMatchError,
    // Status
    envLoading,
    status,
    envRefreshFailed,
    // Variables
    presentVariableValues,
    variablesRechecking,
    varRecheckFailed,
    // Actions
    onRefresh,
    onVariableRecheck,
    onVariableConfirmed,
    // Restore
    restore: {
      env: restoreEnv,
    },
  };
}
