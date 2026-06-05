import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import {
  checkTemplate,
  createBranch,
  deployChangeset,
  fetchBranches,
  getPlanEnv,
  fetchEnvs,
  fetchOrgList,
  fetchPullRequests,
  fetchRepos,
  fetchRuns,
  fetchSecrets,
  fetchStatus,
  fetchVariables,
  generateRepo,
  triggerWorkflow,
  triggerWorkflowFromPR,
  verifyAuth,
} from "./api";
import { PIPELINES, matchPipelineByTemplate } from "./pipelineConfig";
import {
  AZURE_SECRET_KEYS,
  AWS_SECRET_KEYS,
  STAGE_STATUS_CONFIG,
  type Account,
  type Branch,
  type CardId,
  type CardStatus,
  type GhEnv,
  type PlanSummary,
  type PrerequisiteStageVar,
  type PrerequisiteVar,
  type PrerequisiteVarGroup,
  type PullRequest,
  type Repo,
  type RepoOption,
  type SecretsStatus,
  type Stage,
  type StageStatus,
  type User,
  matchEnv,
  matchBranch,
} from "./types";
import { SummaryChip } from "./component/PlanView";

import PipelineCard from "./cards/PipelineCard";
import RepoCard from "./cards/RepoCard";
import PRCard from "./cards/PRCard";
import EnvironmentCard from "./cards/EnvironmentCard";
import StatusCard from "./cards/StatusCard";
import { StageItem } from "./cards/StagesCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const url = import.meta.env.VITE_API_URL;

const DEFAULT_CARD_STATUS: Record<CardId, CardStatus> = {
  repo: "idle",
  pr: "idle",
  env: "idle",
  status_update: "idle",
  stages: "idle",
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  const defaultTemplateRepo = "ZenMe-AU/ZBCorpArchitecture";

  // ── URL state persistence ─────────────────────────────────────────────────
  // Captured once at mount; each field nulled out after it has been applied.
  const pendingRestore = useRef({
    account: new URLSearchParams(window.location.search).get("account"),
    repo: new URLSearchParams(window.location.search).get("repo"),
    pr: new URLSearchParams(window.location.search).get("pr"),
    env: new URLSearchParams(window.location.search).get("env"),
  });
  // Prevents the URL-restore effect from running more than once (guards against
  // React Strict Mode double-invocation and accounts being re-fetched).
  const urlAccountApplied = useRef(false);

  // Tracks restore progress shown to the user.
  const [urlRestoreMsg, setUrlRestoreMsg] = useState<{ loading: boolean; warnings: string[] }>(() => {
    const p = new URLSearchParams(window.location.search);
    const hasParams = p.has("account") || p.has("repo") || p.has("pr") || p.has("env");
    return { loading: hasParams, warnings: [] };
  });
  // Adds a warning line (e.g. "Repository 'X' not found").
  const addRestoreWarning = (msg: string) => setUrlRestoreMsg((prev) => ({ ...prev, warnings: [...prev.warnings, msg] }));
  // Call after each pendingRestore field is cleared; ends the loading state when all are null.
  const checkRestoreDone = () => {
    const p = pendingRestore.current;
    if (p.account === null && p.repo === null && p.pr === null && p.env === null)
      setUrlRestoreMsg((prev) => (prev.loading ? { ...prev, loading: false } : prev));
  };

  // Auto-dismiss warnings after 8 seconds once they appear.
  useEffect(() => {
    if (urlRestoreMsg.warnings.length === 0) return;
    const t = setTimeout(() => setUrlRestoreMsg((prev) => ({ ...prev, warnings: [] })), 8000);
    return () => clearTimeout(t);
  }, [urlRestoreMsg.warnings.length]);

  const [copied, setCopied] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authLoading, setAuthLoading] = useState(true);
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // ── Accounts & repos ──────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoCache, setRepoCache] = useState<Record<string, Repo[]>>({});
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  // ── Template ──────────────────────────────────────────────────────────────
  const [templateStatus, setTemplateStatus] = useState<"checking" | "ready" | "not_clone">("not_clone");
  const [templateName, setTemplateName] = useState<string | null>(null);

  // ── Clone ─────────────────────────────────────────────────────────────────
  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [createEnvs, setCreateEnvs] = useState(true);
  const [cloneEnvWarning, setCloneEnvWarning] = useState<string | null>(null);

  // ── Branches ──────────────────────────────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [sourceBranch, setSourceBranch] = useState<string>("main");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);

  // ── PR ────────────────────────────────────────────────────────────────────
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [prLoading, setPrLoading] = useState(false);

  // ── GitHub Environments ───────────────────────────────────────────────────
  const [envLoading, setEnvLoading] = useState(false);
  const [envList, setEnvList] = useState<GhEnv[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<GhEnv | null>(null);
  const [branchMatchWarning, setBranchMatchWarning] = useState<string | null>(null);
  const [branchMatchError, setBranchMatchError] = useState<string | null>(null);
  const envLockedByPR = !!selectedPR;

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const [selectedPipeline, setSelectedPipeline] = useState<string>("corpSetup");
  const pipeline = PIPELINES[selectedPipeline];

  // ── Stages ────────────────────────────────────────────────────────────────
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesExpanded, setStagesExpanded] = useState<Record<string, boolean>>({});
  const [stageSummaries, setStageSummaries] = useState<Record<string, PlanSummary>>({});
  const [statusFileFound, setStatusFileFound] = useState(true);

  // ── Workflow ──────────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  // Tracks when the user last pressed "Run" — drives "just updated" label and stale detection
  const [lastTriggeredAt, setLastTriggeredAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ── Secrets ───────────────────────────────────────────────────────────────
  const [presentSecretKeys, setPresentSecretKeys] = useState<string[]>([]);
  const [azureSecrets, setAzureSecrets] = useState<SecretsStatus>({ configured: null, valid: null });
  const [awsSecrets, setAwsSecrets] = useState<SecretsStatus>({ configured: null, valid: null });
  const [rechecking, setRechecking] = useState(false);

  // ── Variables ─────────────────────────────────────────────────────────────
  const [presentVariableValues, setPresentVariableValues] = useState<Record<string, string>>({});
  const [variablesRechecking, setVariablesRechecking] = useState(false);
  const [deployedEnv, setDeployedEnv] = useState<Record<string, string> | null>(null);

  // ── Card status ───────────────────────────────────────────────────────────
  const [cardStatus, setCardStatus] = useState<Record<CardId, CardStatus>>(DEFAULT_CARD_STATUS);
  const setCard = (id: CardId, status: CardStatus) => setCardStatus((prev) => ({ ...prev, [id]: status }));

  // ── Card expanded ─────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Record<CardId, boolean>>({
    repo: true,
    pr: true,
    env: true,
    status_update: true,
    stages: true,
  });
  const toggleCard = (id: CardId) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCloneRepo = templateStatus === "ready";
  const isNewRepo = selectedRepo?.isNew ?? false;
  const repoFullName = selectedAccount && selectedRepo && !isNewRepo ? `${selectedAccount.login}/${selectedRepo.name}` : null;
  const envReady = !!selectedEnv && !branchMatchError;
  const triggerRef = selectedPR ? selectedPR.head_sha : (selectedEnv?.name ?? null);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    verifyAuth()
      .then((data) => setUser({ login: data.login }))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener("auth:session-expired", handler);
    return () => window.removeEventListener("auth:session-expired", handler);
  }, []);

  // Keep URL in sync so refresh restores state and the link is shareable.
  // Guard: skip while any pending restore value is still outstanding, so the
  // original URL params are preserved until auth/data has fully loaded (otherwise
  // the first render wipes params and a login redirect loses them).
  useEffect(() => {
    const p = pendingRestore.current;
    if (p.account !== null || p.repo !== null || p.pr !== null || p.env !== null) return;
    const params = new URLSearchParams();
    if (selectedAccount) params.set("account", selectedAccount.login);
    if (selectedRepo && !selectedRepo.isNew) params.set("repo", selectedRepo.name);
    if (selectedPR) {
      params.set("pr", String(selectedPR.number));
    } else if (selectedEnv) {
      params.set("env", selectedEnv.name);
    }
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [selectedAccount, selectedRepo, selectedPR, selectedEnv]);

  useEffect(() => {
    if (!user) return;
    fetchOrgList()
      .then((data) => {
        setAccounts(data);
        const p = pendingRestore.current;
        // If there are no URL params to restore, select the first account immediately.
        // Otherwise, let the URL-restore effect below handle account selection once
        // the org list is confirmed ready — avoids the race where the default account
        // briefly overrides the URL account before restoration fires.
        const hasUrlParams = p.account !== null || p.repo !== null || p.pr !== null || p.env !== null;
        if (!hasUrlParams) {
          setSelectedAccount(data[0] ?? null);
        }
      })
      .catch(console.error);
  }, [user]);

  // URL-restore: fires once org list is loaded, then applies the URL account param.
  // Runs exactly once (urlAccountApplied guard). All subsequent restoration steps
  // (repo → applyRepoRestore, PR/env → loadPRs/loadEnvs) cascade from this.
  useEffect(() => {
    if (urlAccountApplied.current || !user || accounts.length === 0) return;
    const p = pendingRestore.current;
    if (p.account === null && p.repo === null && p.pr === null && p.env === null) return;
    urlAccountApplied.current = true;
    const targetLogin = p.account;
    const match = targetLogin ? accounts.find((a) => a.login.toLowerCase() === targetLogin.toLowerCase()) : null;
    if (targetLogin && !match) {
      addRestoreWarning(`Account "${targetLogin}" not found or not accessible`);
      // Silently cancel all downstream params — no point cascading errors
      p.repo = null;
      p.pr = null;
      p.env = null;
    }
    p.account = null;
    setSelectedAccount(match ?? accounts[0] ?? null);
    checkRestoreDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts]);

  useEffect(() => {
    setRepos([]);
    setSelectedRepo(null);
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
          // Silently cancel downstream params — repo error is enough
          p.pr = null;
          p.env = null;
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
    setStages([]);
    setTemplateName(null);
    setCard("repo", "idle");
  }, [selectedAccount]);

  useEffect(() => {
    setTemplateStatus("checking");
    setTemplateName(null);
    setStages([]);
    setSelectedPR(null);
    setSelectedEnv(null);
    setEnvList([]);
    setPullRequests([]);
    setBranches([]);
    setBranchesLoading(false);
    setBranchMatchWarning(null);
    setBranchMatchError(null);
    resetSecrets();
    setCard("repo", "loading");
    setCard("pr", "idle");
    setCard("env", "idle");
    if (!selectedAccount || !selectedRepo || selectedRepo.isNew) return;
    checkTemplate(selectedAccount, selectedRepo.name)
      .then((data) => {
        const isTemplate = data.isTemplate;
        setTemplateStatus(isTemplate ? "ready" : "not_clone");
        setTemplateName(data.templateName || null);
        setCard("repo", isTemplate ? "complete" : "warning");

        if (data.templateName) {
          const matched = matchPipelineByTemplate(data.templateName);
          if (matched) setSelectedPipeline(matched);
        }

        if (isTemplate) {
          loadPRs(selectedAccount, selectedRepo.name);
          loadEnvs(selectedAccount, selectedRepo.name);

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
          // Not a template — PRs and envs won't be loaded; silently cancel pending params
          const rp = pendingRestore.current;
          rp.pr = null;
          rp.env = null;
          checkRestoreDone();
        }
      })
      .catch((e) => {
        console.error("Failed to check template:", e);
        setTemplateStatus("not_clone");
        setCard("repo", "warning");
        const rp = pendingRestore.current;
        if (rp.pr !== null) {
          rp.pr = null;
        }
        if (rp.env !== null) {
          rp.env = null;
        }
        checkRestoreDone();
      });
  }, [selectedRepo, selectedAccount]);

  // When PR selected: auto-match env
  useEffect(() => {
    if (!selectedPR) return;
    const result = matchEnv(selectedPR.base_branch, envList);
    if (result.status === "exact") {
      setSelectedEnv(result.env);
      setBranchMatchWarning(null);
      setBranchMatchError(null);
      setCard("env", "complete");
    } else if (result.status === "case") {
      setSelectedEnv(result.env);
      setBranchMatchWarning(`Base branch "${selectedPR.base_branch}" and environment "${result.env.name}" have mismatched casing.`);
      setBranchMatchError(null);
      setCard("env", "warning");
    } else {
      setSelectedEnv(null);
      setBranchMatchWarning(null);
      setBranchMatchError(`No matching environment found for base branch "${selectedPR.base_branch}".`);
      setCard("env", "error");
    }
  }, [selectedPR, envList]);

  // When env manually selected: match against branch list
  useEffect(() => {
    if (envLockedByPR || !selectedEnv) return;
    const result = matchBranch(selectedEnv.name, branches);
    if (result.status === "exact") {
      setBranchMatchWarning(null);
      setBranchMatchError(null);
      setCard("env", "complete");
    } else if (result.status === "case") {
      setBranchMatchWarning(`Environment "${selectedEnv.name}" and branch "${result.branch.name}" have mismatched casing.`);
      setBranchMatchError(null);
      setCard("env", "warning");
    } else if (result.status === "multiple") {
      setBranchMatchWarning(null);
      setBranchMatchError(
        `Multiple branches match environment "${selectedEnv.name}". Please resolve the conflict. ${(
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => window.open(`https://github.com/${repoFullName}/branches`, "_blank")}
            sx={{
              borderColor: "#e2e8f0",
              color: "#475569",
              fontSize: "0.75rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
            }}
          />
        )}`,
      );
      setCard("env", "error");
    } else {
      setBranchMatchWarning(null);
      setBranchMatchError(`No branch found matching environment "${selectedEnv.name}".`);
      setCard("env", "error");
    }
  }, [selectedEnv, branches, envLockedByPR]);

  // Reset workflow state when env changes
  useEffect(() => {
    setRunning(false);
    setRunError(null);
    setCountdown(0);
    setLastRunTime(null);
    setLastRunId(null);
    setLastTriggeredAt(null);
    setRetryCount(0);
    setStages([]);
    setStatusFileFound(true);
    setCard("status_update", "idle");
    setCard("stages", "idle");
    setDeployedEnv(null);
  }, [selectedEnv?.id]);

  // Load secrets, variables, and stages when env is confirmed
  useEffect(() => {
    if (!selectedAccount || !selectedRepo || !selectedEnv || branchMatchError) return;
    const matchedBranch = branches.find((b) => b.name.toLowerCase() === selectedEnv.name.toLowerCase());
    if (!matchedBranch) console.error(`No branch found matching env "${selectedEnv.name}"`);
    loadSecrets(selectedEnv.name);
    loadVariables(selectedEnv.name);
    if (matchedBranch) loadStages(matchedBranch.name);
  }, [selectedEnv, branchMatchError]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetSecrets() {
    setPresentSecretKeys([]);
    setAzureSecrets({ configured: null, valid: null });
    setAwsSecrets({ configured: null, valid: null });
    setPresentVariableValues({});
  }

  // ── Loaders ───────────────────────────────────────────────────────────────

  // Delays (seconds) for each successive poll attempt after a trigger.
  const POLL_DELAYS = [150, 180, 200, 300];

  // Start a countdown interval then call loadStages with poll-check params.
  // Uses a local `remaining` counter instead of state updater to avoid React
  // Concurrent Mode running the updater multiple times and duplicating the fetch.
  function startPollingInterval(ref: string, attempt: number, triggerTime: number, prevRunId: string | null) {
    const delay = POLL_DELAYS[attempt] ?? POLL_DELAYS[POLL_DELAYS.length - 1];
    setRunning(true);
    setCountdown(delay);
    let remaining = delay;
    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        loadStages(ref, { attempt, triggerTime, prevRunId });
      }
    }, 1000);
  }

  function loadStages(ref: string, poll?: { attempt: number; triggerTime: number; prevRunId: string | null }) {
    if (!selectedAccount || !selectedRepo) return;
    setCard("stages", "loading");

    fetchStatus(selectedAccount, selectedRepo.name, ref)
      .then((data) => {
        setRunning(false);

        if (!data) {
          setStages(pipeline.stages.map(({ key }) => ({ stage: key, status: "pending" as const })));
          setStatusFileFound(false);
          setCard("stages", "idle");
          return;
        }

        const statusData = data as Record<string, unknown>;
        const fileUpdatedAt = typeof statusData.updatedAt === "number" ? statusData.updatedAt : null;
        const fetchedRunId = (statusData.runId as string | undefined) ?? (statusData.stages as Stage[] | undefined)?.[0]?.runId ?? null;
        const envId = typeof statusData.envId === "number" ? statusData.envId : null;

        // ── Staleness check (only during a poll) ──────────────────────────
        if (poll) {
          const timeStale = fileUpdatedAt === null || poll.triggerTime > fileUpdatedAt;
          const runIdStale = poll.prevRunId !== null && fetchedRunId !== null && fetchedRunId === poll.prevRunId;

          if (timeStale || runIdStale) {
            const next = poll.attempt + 1;
            setRetryCount(next);
            if (next >= POLL_DELAYS.length) {
              setRunError("Workflow is taking too long. Please check GitHub Actions.");
            } else {
              startPollingInterval(ref, next, poll.triggerTime, poll.prevRunId);
            }
            // Fall through to still render whatever data we have
          } else {
            // Fresh — clear triggered state
            setLastTriggeredAt(null);
            setRetryCount(0);
          }
        }

        // Refresh deployed env snapshot whenever we have a valid envId
        if (envId && selectedAccount && selectedRepo) {
          getPlanEnv(selectedAccount, selectedRepo.name, envId)
            .then(setDeployedEnv)
            .catch(console.error);
        }

        if (fileUpdatedAt) setLastRunTime(fileUpdatedAt);

        const fetched = (statusData.stages as Stage[]) || [];
        const merged = pipeline.stages.map(({ key }) => {
          const found = fetched.find((s: Stage) => s.stage === key);
          return found ?? { stage: key, status: "failed" as const };
        });
        setStages(merged);
        setStatusFileFound(true);

        if (statusData.azure) setAzureSecrets((prev) => ({ ...prev, valid: (statusData.azure as { valid: boolean | null }).valid ?? null }));
        if (statusData.aws) setAwsSecrets((prev) => ({ ...prev, valid: (statusData.aws as { valid: boolean | null }).valid ?? null }));

        setCard("stages", merged.some((s) => s.status === "failed") ? "warning" : "complete");
        setCard("status_update", "complete");
      })
      .catch((e) => {
        console.error("Failed to fetch status:", e);
        setRunning(false);
        setStages(pipeline.stages.map(({ key }) => ({ stage: key, status: "pending" as const })));
        setStatusFileFound(false);
        setCard("stages", "idle");
      });
  }

  async function loadPRs(account: Account, repoName: string) {
    setPrLoading(true);
    try {
      const prs = await fetchPullRequests(account, repoName);
      setPullRequests(prs);
      setCard("pr", prs.length > 0 ? "warning" : "idle");
      const targetPr = pendingRestore.current.pr;
      pendingRestore.current.pr = null;
      if (targetPr) {
        const match = prs.find((p) => p.number === Number(targetPr));
        if (match) {
          pendingRestore.current.env = null; // PR auto-selects env
          setSelectedPR(match);
          setCard("pr", "complete");
        } else {
          addRestoreWarning(`Pull request #${targetPr} not found`);
          pendingRestore.current.env = null; // silently cancel env — PR error is enough
        }
      }
    } catch (e) {
      console.error(e);
      pendingRestore.current.pr = null;
    } finally {
      setPrLoading(false);
      checkRestoreDone();
    }
  }

  async function loadEnvs(account: Account, repoName: string) {
    setEnvLoading(true);
    fetchEnvs(account, repoName)
      .then((list) => {
        setEnvList(list);
        // Restore env from URL only if no PR is being restored (PR auto-matches env)
        const targetEnv = pendingRestore.current.env;
        pendingRestore.current.env = null;
        if (targetEnv && !pendingRestore.current.pr) {
          const match = list.find((e) => e.name.toLowerCase() === targetEnv.toLowerCase());
          if (match) {
            setSelectedEnv(match);
          } else {
            addRestoreWarning(`Environment "${targetEnv}" not found`);
          }
        }
        checkRestoreDone();
      })
      .catch(console.error)
      .finally(() => setEnvLoading(false));
  }

  async function loadSecrets(envName: string) {
    if (!selectedAccount || !selectedRepo) return;
    try {
      const keys = await fetchSecrets(selectedAccount, selectedRepo.name, envName);
      const azureConfigured = AZURE_SECRET_KEYS.every((k) => keys.includes(k));
      const awsConfigured = AWS_SECRET_KEYS.every((k) => keys.includes(k));
      setAzureSecrets((prev) => ({ ...prev, configured: azureConfigured }));
      setAwsSecrets((prev) => ({ ...prev, configured: awsConfigured }));
      setPresentSecretKeys(keys);
    } catch (e) {
      console.error("Failed to load secrets:", e);
    }
  }

  async function loadVariables(envName: string) {
    if (!selectedAccount || !selectedRepo) return;
    try {
      const values = await fetchVariables(selectedAccount, selectedRepo.name, envName);
      setPresentVariableValues(values);
    } catch (e) {
      console.error(e);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleClone() {
    if (!selectedAccount || !selectedRepo) return;
    const name = selectedRepo.name;
    if (repos.find((r) => r.name === name)) {
      setCloneError(`Repository "${name}" already exists`);
      return;
    }
    setCloning(true);
    setCloneError(null);
    setCloneEnvWarning(null);
    try {
      const { repo: newRepo, envSuccess, results } = await generateRepo(selectedAccount, name, isPrivate, includeAllBranch, createEnvs);
      const updated = [...repos, newRepo];
      setRepos(updated);
      setRepoCache((prev) => ({ ...prev, [String(selectedAccount.id)]: updated }));
      setSelectedRepo({ id: newRepo.id, name: newRepo.name });

      if (!envSuccess) {
        const failed = results.envs.filter((e) => !e.success).map((e) => e.name);
        setCloneEnvWarning(`Repo created but failed to create environments: ${failed.join(", ")}`);
      }
    } catch (e: unknown) {
      console.error("Failed to clone repo:", e);
      setCloneError("Clone failed");
    } finally {
      setCloning(false);
    }
  }

  async function handleCreateBranch(targetName: string) {
    if (!selectedAccount || !selectedRepo) return;
    setCreatingBranch(true);
    setCreateBranchError(null);
    try {
      const newBranch = await createBranch(selectedAccount, selectedRepo.name, targetName, sourceBranch);
      setBranches((prev) => [...prev, newBranch]);
    } catch (e: unknown) {
      console.error("Failed to create branch:", e);
      setCreateBranchError("Failed to create branch");
    } finally {
      setCreatingBranch(false);
    }
  }

  async function handleRecheck() {
    if (!selectedEnv) return;
    setRechecking(true);
    try {
      await loadSecrets(selectedEnv.name);
    } finally {
      setRechecking(false);
    }
  }

  async function handleVariableRecheck() {
    if (!selectedEnv) return;
    setVariablesRechecking(true);
    try {
      await loadVariables(selectedEnv.name);
    } finally {
      setVariablesRechecking(false);
    }
  }

  function handleVariableConfirmed(key: string, value: string) {
    setPresentVariableValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRunStatusUpdate() {
    if (!selectedAccount || !selectedRepo || !isCloneRepo || !envReady || !triggerRef) return;
    setRunError(null);
    setCard("status_update", "loading");

    const triggerTime = Date.now();
    const prevRunId = stages[0]?.runId ?? null;
    setLastTriggeredAt(triggerTime);
    setRetryCount(0);

    const githubEnvName = selectedEnv!.name;

    try {
      if (selectedPR) {
        await triggerWorkflowFromPR(selectedAccount, selectedRepo.name, pipeline.workflowId, githubEnvName, selectedPR.head_sha);
        fetchRuns(selectedAccount, selectedRepo.name, selectedPR.head_sha)
          .then((runs) => {
            if (runs.length > 0) setLastRunId(runs[0].id);
          })
          .catch(console.error);
      } else {
        await triggerWorkflow(selectedAccount, selectedRepo.name, pipeline.workflowId, githubEnvName, triggerRef);
      }
    } catch (e: unknown) {
      console.error("Failed to trigger workflow:", e);
      setCard("status_update", "error");
      setRunError("Failed to trigger workflow");
      setLastTriggeredAt(null);
      return;
    }

    const matchedBranch = branches.find((b) => b.name.toLowerCase() === selectedEnv.name.toLowerCase());
    if (!matchedBranch) {
      console.error(`No branch found matching env "${selectedEnv.name}"`);
      return;
    }
    startPollingInterval(matchedBranch.name, 0, triggerTime, prevRunId);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Session expired dialog ── */}
      <Dialog open={sessionExpired} disableEscapeKeyDown>
        <DialogTitle sx={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: "1rem", pb: 0.5 }}>Session Expired</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.875rem", color: "#475569", fontFamily: "'IBM Plex Sans', sans-serif" }}>
            Your login session has expired. Please sign in again to continue.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="contained"
            onClick={() => {
              setRedirecting("login");
              window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
            }}
            sx={{
              background: "#2563eb",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.8rem",
              textTransform: "none",
              "&:hover": { background: "#1d4ed8" },
            }}
          >
            Sign in again
          </Button>
        </DialogActions>
      </Dialog>

      {redirecting && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            background: "rgba(248,250,252,0.85)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <CircularProgress size={28} sx={{ color: "#2563eb" }} />
          <Typography sx={{ fontSize: "0.85rem", color: "#64748b", fontFamily: "'IBM Plex Mono', monospace" }}>
            {redirecting === "login" ? "Redirecting to GitHub..." : "Logging out..."}
          </Typography>
        </Box>
      )}

      <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {/* ── Nav ── */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 4,
            py: 1.75,
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "7px",
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                fontWeight: 800,
                color: "#fff",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              ZB
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", letterSpacing: "-0.01em" }}>Corp Setup</Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {authLoading ? (
              <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
            ) : user ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>{user.login}</Typography>
                {selectedRepo && !selectedRepo.isNew && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }}
                    sx={{
                      borderColor: copied ? "#bbf7d0" : "#e2e8f0",
                      color: copied ? "#16a34a" : "#94a3b8",
                      fontSize: "0.72rem",
                      textTransform: "none",
                      fontFamily: "'IBM Plex Mono', monospace",
                      py: 0.5,
                      transition: "color 0.15s, border-color 0.15s",
                      "&:hover": { borderColor: "#cbd5e1", color: "#475569" },
                    }}
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setRedirecting("logout");
                    window.location.href = `${url}/auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.href)}`;
                  }}
                  sx={{
                    borderColor: "#e2e8f0",
                    color: "#94a3b8",
                    fontSize: "0.78rem",
                    textTransform: "none",
                    fontFamily: "'IBM Plex Mono', monospace",
                    py: 0.5,
                    "&:hover": { borderColor: "#fecaca", color: "#ef4444" },
                  }}
                >
                  Logout
                </Button>
              </Box>
            ) : (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setRedirecting("login");
                  window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
                }}
                sx={{
                  borderColor: "#e2e8f0",
                  color: "#475569",
                  fontSize: "0.78rem",
                  textTransform: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                  py: 0.5,
                  "&:hover": { borderColor: "#cbd5e1", color: "#0f172a" },
                }}
              >
                Login with GitHub
              </Button>
            )}
          </Box>
        </Box>

        {/* ── Main ── */}
        <Box sx={{ maxWidth: 860, mx: "auto", px: 4, py: 5 }}>
          {authLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 4 }}>
              <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
              <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Verifying access...</Typography>
            </Box>
          ) : !user ? (
            <Box
              sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 10, gap: 2, textAlign: "center" }}
            >
              <Typography sx={{ fontSize: "1.1rem", fontWeight: 600, color: "#0f172a" }}>Sign in to continue</Typography>
              <Typography sx={{ fontSize: "0.85rem", color: "#64748b", maxWidth: 360 }}>
                Login with your GitHub account to access the Corp Setup dashboard.
              </Typography>
              <Button
                variant="contained"
                onClick={() => {
                  setRedirecting("login");
                  window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
                }}
                sx={{
                  mt: 1,
                  background: "#2563eb",
                  textTransform: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                  "&:hover": { background: "#1d4ed8" },
                }}
              >
                Login with GitHub
              </Button>
            </Box>
          ) : (
            <Box>
              {/* Step 1 — Repo */}
              <PipelineCard
                step={1}
                title="Select Repository"
                subtitle="Choose an organisation and repository to work with"
                status={cardStatus.repo}
                expanded={expanded.repo}
                onToggle={() => toggleCard("repo")}
                hasNext
              >
                <RepoCard
                  accounts={accounts}
                  selectedAccount={selectedAccount}
                  onAccountChange={setSelectedAccount}
                  repos={repos}
                  selectedRepo={selectedRepo}
                  onRepoChange={(repo) => {
                    setSelectedRepo(repo);
                    setCloneError(null);
                  }}
                  templateStatus={templateStatus}
                  templateName={templateName}
                  defaultTemplateRepo={defaultTemplateRepo}
                  isPrivate={isPrivate}
                  onIsPrivateChange={setIsPrivate}
                  includeAllBranch={includeAllBranch}
                  onIncludeAllBranchChange={setIncludeAllBranch}
                  cloning={cloning}
                  cloneError={cloneError}
                  onClone={handleClone}
                  createEnvs={createEnvs}
                  onCreateEnvsChange={setCreateEnvs}
                  cloneEnvWarning={cloneEnvWarning}
                />
              </PipelineCard>

              {/* Step 2 — PR (optional) */}
              <PipelineCard
                step={2}
                title="Pull Request"
                subtitle={selectedPR ? `#${selectedPR.number} · ${selectedPR.title}` : "Optional — select a PR to deploy from"}
                status={cardStatus.pr}
                expanded={expanded.pr}
                onToggle={() => toggleCard("pr")}
                disabled={!isCloneRepo}
                hasNext
                action={
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    onClick={() => window.open(`https://github.com/${repoFullName}/pulls`, "_blank")}
                    sx={{
                      borderColor: "#e2e8f0",
                      color: "#475569",
                      fontSize: "0.75rem",
                      textTransform: "none",
                      fontFamily: "'IBM Plex Mono', monospace",
                      "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
                    }}
                  >
                    Pull Requests on GitHub
                  </Button>
                }
              >
                <PRCard
                  pullRequests={pullRequests}
                  selectedPR={selectedPR}
                  onSelectPR={(pr) => {
                    setSelectedPR(pr);
                    if (!pr) {
                      setSelectedEnv(null);
                      setBranchMatchWarning(null);
                      setBranchMatchError(null);
                      resetSecrets();
                      setCard("env", "idle");
                      setCard("pr", "idle");
                    } else {
                      setCard("pr", "complete");
                    }
                  }}
                  loading={prLoading}
                  onRefresh={() => selectedAccount && selectedRepo && loadPRs(selectedAccount, selectedRepo.name)}
                  envList={envList}
                />
              </PipelineCard>

              {/* Step 3 — Environment + Secrets */}
              <PipelineCard
                step={3}
                title="Environment"
                subtitle={selectedEnv ? selectedEnv.name : "Select target environment"}
                status={cardStatus.env}
                expanded={expanded.env}
                onToggle={() => toggleCard("env")}
                disabled={!isCloneRepo}
                hasNext
                action={
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    onClick={() => window.open(`https://github.com/${repoFullName}/settings/environments`, "_blank")}
                    sx={{
                      borderColor: "#e2e8f0",
                      color: "#475569",
                      fontSize: "0.75rem",
                      textTransform: "none",
                      fontFamily: "'IBM Plex Mono', monospace",
                      "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
                    }}
                  >
                    Environment on GitHub
                  </Button>
                }
              >
                <EnvironmentCard
                  envList={envList}
                  selectedEnv={selectedEnv}
                  onEnvChange={(env) => {
                    setSelectedEnv(env);
                    setBranchMatchWarning(null);
                    setBranchMatchError(null);
                    resetSecrets();
                  }}
                  lockedByPR={envLockedByPR}
                  branchMatchWarning={branchMatchWarning}
                  branchMatchError={branchMatchError}
                  loading={envLoading}
                  onRefresh={() => selectedAccount && selectedRepo && loadEnvs(selectedAccount, selectedRepo.name)}
                  presentKeys={presentSecretKeys}
                  azureSecretsStatus={azureSecrets}
                  awsSecretsStatus={awsSecrets}
                  repoFullName={repoFullName}
                  onRecheck={handleRecheck}
                  rechecking={rechecking}
                  account={selectedAccount}
                  repo={selectedRepo?.name ?? ""}
                  variableValues={presentVariableValues}
                  onVariableRecheck={handleVariableRecheck}
                  variablesRechecking={variablesRechecking}
                  onVariableConfirmed={handleVariableConfirmed}
                  branches={branches}
                  sourceBranch={sourceBranch}
                  onSourceBranchChange={setSourceBranch}
                  creatingBranch={creatingBranch}
                  createBranchError={createBranchError}
                  onCreateBranch={handleCreateBranch}
                />
              </PipelineCard>

              {/* Step 4 — Run Status Update */}
              <PipelineCard
                step={4}
                title="Run Status Update"
                subtitle="Trigger the GitHub Actions workflow to check deployment state"
                status={cardStatus.status_update}
                expanded={expanded.status_update}
                onToggle={() => toggleCard("status_update")}
                disabled={!isCloneRepo || !envReady}
                hasNext
              >
                <StatusCard
                  running={running}
                  countdown={countdown}
                  lastRunTime={lastRunTime}
                  lastTriggeredAt={lastTriggeredAt}
                  retryCount={retryCount}
                  onRun={handleRunStatusUpdate}
                  runError={runError}
                  lastRunId={lastRunId}
                  repoFullName={repoFullName}
                  workflowId={pipeline.workflowId}
                />
              </PipelineCard>

              {/* No status file notice */}
              {!statusFileFound && isCloneRepo && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, my: 1 }}>
                  <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(to right, #f1f5f9, #cbd5e1)" }} />
                  <Typography
                    sx={{
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    No status file found
                  </Typography>
                  <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(to left, #f1f5f9, #cbd5e1)" }} />
                </Box>
              )}

              {/* Stale status notice — shown when a poll returned old data and we're retrying */}
              {isCloneRepo && (running || retryCount > 0) && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, my: 1.5 }}>
                  <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(to right, #fef9c3, #fbbf24)" }} />
                  <Typography
                    sx={{
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      color: "#d97706",
                      textTransform: "uppercase",
                      fontFamily: "'IBM Plex Mono', monospace",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Status outdated — waiting for workflow
                  </Typography>
                  <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(to left, #fef9c3, #fbbf24)" }} />
                </Box>
              )}

              {/* Steps 5~N — Stages */}
              {pipeline.stages.map((stageDef, index) => {
                const stage = stages.find((s) => s.stage === stageDef.key) ?? { stage: stageDef.key, status: "pending" as const };
                const summary = stageSummaries[stageDef.key];
                const noChanges = summary != null && summary.create === 0 && summary.update === 0 && summary.delete === 0 && summary.replace === 0;
                const effectiveStatus: StageStatus = stage.deployStatus === "success" || noChanges ? "deployed" : stage.status;
                const cfg = STAGE_STATUS_CONFIG[effectiveStatus];
                const stagesStale = running || retryCount > 0;
                const varsMismatch =
                  deployedEnv !== null &&
                  stageDef.prerequisites.some((p) => {
                    if (p.type === "var")
                      return (presentVariableValues[(p as PrerequisiteVar).key] ?? "") !== (deployedEnv[(p as PrerequisiteVar).key] ?? "");
                    if (p.type === "varGroup" || p.type === "stageVar")
                      return (p as PrerequisiteVarGroup | PrerequisiteStageVar).keys.some(
                        (k) => (presentVariableValues[k] ?? "") !== (deployedEnv[k] ?? ""),
                      );
                    return false;
                  });
                const deployDisabled = stagesStale || varsMismatch;
                const isExpanded = !!stagesExpanded[stageDef.key];

                const onDeploy =
                  effectiveStatus === "success" && stage.runId
                    ? async () => {
                        if (!selectedAccount || !selectedRepo || !selectedEnv) return;
                        try {
                          await deployChangeset(
                            selectedAccount,
                            selectedRepo.name,
                            stage.runId!,
                            stageDef.label,
                            selectedEnv.name,
                            selectedEnv.name,
                          );
                        } catch (e) {
                          console.error("Failed to trigger deploy:", e);
                          return;
                        }
                        const triggerTime = Date.now();
                        const prevRunId = stages[0]?.runId ?? null;
                        setLastTriggeredAt(triggerTime);
                        setRetryCount(0);
                        const ref = selectedPR
                          ? selectedPR.head_sha
                          : branches.find((b) => b.name.toLowerCase() === selectedEnv.name.toLowerCase())?.name ?? selectedEnv.name;
                        startPollingInterval(ref, 0, triggerTime, prevRunId);
                      }
                    : undefined;

                return (
                  <PipelineCard
                    key={stageDef.key}
                    step={5 + index}
                    title={stageDef.label}
                    subtitle={noChanges ? "No changes" : cfg.label}
                    status={
                      stagesStale
                        ? "idle"
                        : cardStatus.stages === "loading"
                          ? "loading"
                          : effectiveStatus === "deployed"
                            ? "complete"
                            : effectiveStatus === "success"
                              ? "warning"
                              : effectiveStatus === "failed"
                                ? "error"
                                : "idle"
                    }
                    expanded={isExpanded}
                    onToggle={() => setStagesExpanded((prev) => ({ ...prev, [stageDef.key]: !prev[stageDef.key] }))}
                    disabled={!isCloneRepo}
                    hasNext={index < pipeline.stages.length - 1}
                    action={
                      !isExpanded && summary && effectiveStatus !== "deployed" ? (
                        <Box
                          sx={{ display: "flex", gap: 0.75, alignItems: "center" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SummaryChip type="create" count={summary.create} />
                          <SummaryChip type="update" count={summary.update} />
                          <SummaryChip type="delete" count={summary.delete} />
                          {summary.replace > 0 && <SummaryChip type="replace" count={summary.replace} />}
                          {onDeploy && (
                            <Button
                              disabled={deployDisabled}
                              variant="contained"
                              size="small"
                              onClick={(e) => { e.stopPropagation(); onDeploy(); }}
                              sx={{
                                background: "#f97316",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: "0.72rem",
                                textTransform: "none",
                                py: 0.4,
                                px: 1.5,
                                "&:hover": { background: "#ea6c0a" },
                                "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                              }}
                            >
                              Deploy
                            </Button>
                          )}
                        </Box>
                      ) : undefined
                    }
                  >
                    <StageItem
                      stageDef={stageDef}
                      stage={stage}
                      cardStatus={cardStatus}
                      variableValues={presentVariableValues}
                      account={selectedAccount}
                      repoName={selectedRepo?.name || ""}
                      selectedEnv={selectedEnv}
                      onVariableConfirmed={handleVariableConfirmed}
                      onDeploy={onDeploy}
                      stagesStale={deployDisabled}
                      deployedEnv={deployedEnv}
                      onPlanSummary={(s) => setStageSummaries((prev) => ({ ...prev, [stageDef.key]: s }))}
                    />
                  </PipelineCard>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── URL restore toasts — positioned just below the sticky navbar ── */}
      {(urlRestoreMsg.loading || urlRestoreMsg.warnings.length > 0) && (
        <Box
          sx={{
            position: "fixed",
            top: "75px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1400,
            minWidth: 300,
            maxWidth: 480,
            width: "max-content",
          }}
        >
          {urlRestoreMsg.loading && (
            <Alert
              severity="info"
              icon={<CircularProgress size={16} sx={{ color: "#2563eb" }} />}
              sx={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.78rem",
                alignItems: "center",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                borderRadius: "10px",
              }}
            >
              Restoring session
            </Alert>
          )}
          {!urlRestoreMsg.loading && urlRestoreMsg.warnings.length > 0 && (
            <Alert
              severity="warning"
              onClose={() => setUrlRestoreMsg((prev) => ({ ...prev, warnings: [] }))}
              sx={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.78rem",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                borderRadius: "10px",
              }}
            >
              {urlRestoreMsg.warnings.length === 1 ? (
                urlRestoreMsg.warnings[0]
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {urlRestoreMsg.warnings.map((w, i) => (
                    <Box key={i}>{w}</Box>
                  ))}
                </Box>
              )}
            </Alert>
          )}
        </Box>
      )}
    </>
  );
}
