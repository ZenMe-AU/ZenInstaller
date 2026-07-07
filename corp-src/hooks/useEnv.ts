import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchEnvs, fetchSecrets, fetchVariables } from "../api";
import { AZURE_SECRET_KEYS, AWS_SECRET_KEYS } from "../logic/variables";
import {
  type Account,
  type Branch,
  type CardStatus,
  type GhEnv,
  type PendingRestore,
  type PullRequest,
  type RepoOption,
  type SecretsStatus,
} from "../types";
import { matchBranch, matchEnv } from "../logic/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseEnv {
  envList: GhEnv[];
  selectedEnv: GhEnv | null;
  setSelectedEnv: (env: GhEnv | null) => void;
  envLoading: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  envReady: boolean;
  status: CardStatus;
  onRefresh: () => void;
  presentSecretKeys: string[];
  azureSecrets: SecretsStatus;
  awsSecrets: SecretsStatus;
  rechecking: boolean;
  presentVariableValues: Record<string, string>;
  variablesRechecking: boolean;
  envRefreshFailed: boolean;
  recheckFailed: boolean;
  varRecheckFailed: boolean;
  onRecheck: () => Promise<void>;
  onVariableRecheck: () => Promise<void>;
  onVariableConfirmed: (key: string, value: string) => void;
  onAzureValid: (valid: boolean | null) => void;
  onAwsValid: (valid: boolean | null) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEnv(opts: {
  account: Account | null;
  repo: RepoOption | null;
  isCloneRepo: boolean;
  selectedPR: PullRequest | null;
  branches: Branch[];
  validEnvs: readonly string[];
  pendingRestore: React.MutableRefObject<PendingRestore>;
  addRestoreWarning: (msg: string) => void;
  checkRestoreDone: () => void;
}): UseEnv {
  const { pendingRestore, addRestoreWarning, checkRestoreDone } = opts;

  const accountRef = useRef(opts.account);
  const repoRef    = useRef(opts.repo);
  useLayoutEffect(() => {
    accountRef.current = opts.account;
    repoRef.current    = opts.repo;
  });

  // ── Env state ─────────────────────────────────────────────────────────────
  const [envList, setEnvList]                   = useState<GhEnv[]>([]);
  const [selectedEnv, setSelectedEnv]           = useState<GhEnv | null>(null);
  const [envLoading, setEnvLoading]             = useState(false);
  const [branchMatchWarning, setBranchMatchWarning] = useState<string | null>(null);
  const [branchMatchError, setBranchMatchError]     = useState<string | null>(null);
  const [status, setStatus]                     = useState<CardStatus>("idle");

  // ── Secrets & variables state ──────────────────────────────────────────────
  const [presentSecretKeys, setPresentSecretKeys]       = useState<string[]>([]);
  const [azureSecrets, setAzureSecrets]                 = useState<SecretsStatus>({ configured: null, valid: null });
  const [awsSecrets, setAwsSecrets]                     = useState<SecretsStatus>({ configured: null, valid: null });
  const [rechecking, setRechecking]                     = useState(false);
  const [presentVariableValues, setPresentVariableValues] = useState<Record<string, string>>({});
  const [variablesRechecking, setVariablesRechecking]   = useState(false);
  const [envRefreshFailed, setEnvRefreshFailed]         = useState(false);
  const [recheckFailed, setRecheckFailed]               = useState(false);
  const [varRecheckFailed, setVarRecheckFailed]         = useState(false);

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
    setPresentSecretKeys([]);
    setAzureSecrets({ configured: null, valid: null });
    setAwsSecrets({ configured: null, valid: null });
    setPresentVariableValues({});
  }, [selectedEnv?.id]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadEnvs = useCallback(async (account: Account, repo: RepoOption) => {
    setEnvLoading(true);
    setEnvRefreshFailed(false);
    try {
      const list = await fetchEnvs(account, repo.name);
      setEnvList(list);
      const targetEnv = pendingRestore.current.env;
      pendingRestore.current.env = null;
      if (targetEnv && !pendingRestore.current.pr) {
        const match = list.find((e) => e.name.toLowerCase() === targetEnv.toLowerCase());
        if (match) setSelectedEnv(match);
        else addRestoreWarning(`Environment "${targetEnv}" not found`);
      }
      checkRestoreDone();
    } catch (e) {
      console.error(e);
      setEnvRefreshFailed(true);
    } finally {
      setEnvLoading(false);
    }
  }, [addRestoreWarning, checkRestoreDone, pendingRestore]);

  const loadSecrets = useCallback(async (envName: string): Promise<boolean> => {
    const acc  = accountRef.current;
    const repo = repoRef.current;
    if (!acc || !repo) return false;
    try {
      const keys = await fetchSecrets(acc, repo.name, envName);
      setAzureSecrets((prev) => ({ ...prev, configured: AZURE_SECRET_KEYS.every((k) => keys.includes(k)) }));
      setAwsSecrets((prev)   => ({ ...prev, configured: AWS_SECRET_KEYS.every((k)   => keys.includes(k)) }));
      setPresentSecretKeys(keys);
      return true;
    } catch (e) {
      console.error("Failed to load secrets:", e);
      return false;
    }
  }, []);

  const loadVariables = useCallback(async (envName: string): Promise<boolean> => {
    const acc  = accountRef.current;
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

  // Load envs when repo becomes a clone
  useEffect(() => {
    if (!opts.account || !opts.repo || !opts.isCloneRepo) return;
    loadEnvs(opts.account, opts.repo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.account?.id, opts.repo?.id, opts.isCloneRepo, loadEnvs]);

  // Auto-load secrets + variables when env is confirmed (selected + no branch error)
  useEffect(() => {
    if (!selectedEnv || branchMatchError) return;
    loadSecrets(selectedEnv.name);
    loadVariables(selectedEnv.name);
  }, [selectedEnv, branchMatchError, loadSecrets, loadVariables]);

  // When PR selected: auto-match env from PR's base branch
  useEffect(() => {
    if (!opts.selectedPR) return;
    const result = matchEnv(opts.selectedPR.base_branch, envList, opts.validEnvs);
    if (result.status === "exact") {
      setSelectedEnv(result.env); setBranchMatchWarning(null); setBranchMatchError(null); setStatus("complete");
    } else if (result.status === "case") {
      setSelectedEnv(result.env);
      setBranchMatchWarning(`Base branch "${opts.selectedPR.base_branch}" and environment "${result.env.name}" have mismatched casing.`);
      setBranchMatchError(null); setStatus("warning");
    } else {
      setSelectedEnv(null); setBranchMatchWarning(null);
      setBranchMatchError(`No matching environment found for base branch "${opts.selectedPR.base_branch}".`);
      setStatus("error");
    }
  }, [opts.selectedPR, envList]);

  // When env manually selected (no active PR): match against branch list
  useEffect(() => {
    if (opts.selectedPR) return;
    if (!selectedEnv) {
      setBranchMatchWarning(null); setBranchMatchError(null); setStatus("idle");
      return;
    }
    const result = matchBranch(selectedEnv.name, opts.branches);
    if (result.status === "exact") {
      setBranchMatchWarning(null); setBranchMatchError(null); setStatus("complete");
    } else if (result.status === "case") {
      setBranchMatchWarning(`Environment "${selectedEnv.name}" and branch "${result.branch.name}" have mismatched casing.`);
      setBranchMatchError(null); setStatus("warning");
    } else if (result.status === "multiple") {
      setBranchMatchWarning(null);
      setBranchMatchError(`Multiple branches match environment "${selectedEnv.name}". Please resolve the conflict.`);
      setStatus("error");
    } else {
      setBranchMatchWarning(null);
      setBranchMatchError(`No branch found matching environment "${selectedEnv.name}".`);
      setStatus("error");
    }
  }, [selectedEnv, opts.branches, opts.selectedPR]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    const acc  = accountRef.current;
    const repo = repoRef.current;
    if (acc && repo) loadEnvs(acc, repo);
  }, [loadEnvs]);

  const onRecheck = useCallback(async () => {
    if (!selectedEnv) return;
    setRechecking(true);
    setRecheckFailed(false);
    try {
      const ok = await loadSecrets(selectedEnv.name);
      if (!ok) setRecheckFailed(true);
    } finally {
      setRechecking(false);
    }
  }, [selectedEnv, loadSecrets]);

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

  const onAzureValid = useCallback((valid: boolean | null) => {
    setAzureSecrets((prev) => ({ ...prev, valid }));
  }, []);

  const onAwsValid = useCallback((valid: boolean | null) => {
    setAwsSecrets((prev) => ({ ...prev, valid }));
  }, []);

  const envReady = !!selectedEnv && !branchMatchError;

  return {
    envList, selectedEnv, setSelectedEnv, envLoading,
    branchMatchWarning, branchMatchError, envReady, status, onRefresh,
    presentSecretKeys, azureSecrets, awsSecrets, rechecking,
    presentVariableValues, variablesRechecking,
    envRefreshFailed, recheckFailed, varRecheckFailed,
    onRecheck, onVariableRecheck, onVariableConfirmed,
    onAzureValid, onAwsValid,
  };
}
