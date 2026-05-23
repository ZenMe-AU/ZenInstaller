import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import {
  checkTemplate,
  createBranch,
  fetchBranches,
  fetchEnv,
  fetchEnvs,
  fetchOrgList,
  fetchPullRequests,
  fetchRepos,
  fetchRuns,
  fetchSecrets,
  fetchStatus,
  generateRepo,
  triggerWorkflow,
  triggerWorkflowFromPR,
  verifyAuth,
} from "./api";
import { PIPELINES, matchPipelineByTemplate } from "./pipelineConfig";
import {
  AZURE_SECRET_KEYS,
  AWS_SECRET_KEYS,
  REQUIRED_ENV_KEYS,
  STAGE_STATUS_CONFIG,
  type Account,
  type Branch,
  type CardId,
  type CardStatus,
  type EnvEntry,
  type GhEnv,
  type PullRequest,
  type Repo,
  type RepoOption,
  type SecretsStatus,
  type Stage,
  type User,
  type WorkflowRun,
  matchEnv,
  matchBranch,
} from "./types";

import PipelineCard from "./cards/PipelineCard";
import RepoCard from "./cards/RepoCard";
import PRCard from "./cards/PRCard";
import EnvironmentCard from "./cards/EnvironmentCard";
import SecretsCard from "./cards/SecretsCard";
import EnvCard from "./cards/EnvCard";
import StatusCard from "./cards/StatusCard";
import { StageItem } from "./cards/StagesCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const url = import.meta.env.VITE_API_URL;

const DEFAULT_CARD_STATUS: Record<CardId, CardStatus> = {
  repo: "idle",
  pr: "idle",
  env: "idle",
  azure_secrets: "idle",
  aws_secrets: "idle",
  envVars: "idle",
  status_update: "idle",
  stages: "idle",
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  const defaultTemplateRepo = "ZenMe-AU/ZBCorpArchitecture";

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authLoading, setAuthLoading] = useState(true);
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);
  const [user, setUser] = useState<User | null>(null);

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
  const [stagesLoading, setStagesLoading] = useState(false);
  const [statusFileFound, setStatusFileFound] = useState(true);

  // ── Workflow ──────────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);
  const [lastRunId, setLastRunId] = useState<number | null>(null);

  // ── Env entries ───────────────────────────────────────────────────────────
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(REQUIRED_ENV_KEYS.map((k) => ({ key: k, value: "" })));

  // ── Secrets ───────────────────────────────────────────────────────────────
  const [presentSecretKeys, setPresentSecretKeys] = useState<string[]>([]);
  const [azureSecrets, setAzureSecrets] = useState<SecretsStatus>({ configured: null, valid: null });
  const [awsSecrets, setAwsSecrets] = useState<SecretsStatus>({ configured: null, valid: null });
  const [rechecking, setRechecking] = useState(false);

  // ── Card status ───────────────────────────────────────────────────────────
  const [cardStatus, setCardStatus] = useState<Record<CardId, CardStatus>>(DEFAULT_CARD_STATUS);
  const setCard = (id: CardId, status: CardStatus) => setCardStatus((prev) => ({ ...prev, [id]: status }));

  // ── Card expanded ─────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Record<CardId, boolean>>({
    repo: true,
    pr: true,
    env: true,
    azure_secrets: true,
    aws_secrets: true,
    envVars: true,
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
    if (!user) return;
    fetchOrgList()
      .then((data) => {
        setAccounts(data);
        setSelectedAccount(data[0] || null);
      })
      .catch(console.error);
  }, [user]);

  useEffect(() => {
    setRepos([]);
    setSelectedRepo(null);
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
    setBranchMatchWarning(null);
    setBranchMatchError(null);
    resetSecrets();
    setCard("repo", "loading");
    setCard("pr", "idle");
    setCard("env", "idle");
    setCard("envVars", "idle");

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
          loadStages();
          loadPRs(selectedAccount, selectedRepo.name);
          loadEnvs(selectedAccount, selectedRepo.name);

          fetchBranches(selectedAccount, selectedRepo.name)
            .then((list) => {
              setBranches(list);
              const main = list.find((b) => b.name === "main");
              setSourceBranch(main ? "main" : (list[0]?.name ?? "main"));
            })
            .catch(console.error);

          // fetchEnvs(selectedAccount, selectedRepo.name)
          //   .then((list) => setEnvList(list))
          //   .catch(console.error);

          fetchEnv(selectedAccount, selectedRepo.name)
            .then((obj) => {
              setEnvEntries(Object.entries(obj).map(([key, value]) => ({ key, value: value as string })));
            })
            .catch((err) => {
              console.error(err);
              setEnvEntries(REQUIRED_ENV_KEYS.map((k) => ({ key: k, value: "" })));
              setCard("envVars", "idle");
            });
        }
      })
      .catch(() => {
        setTemplateStatus("not_clone");
        setCard("repo", "warning");
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

  // Load secrets when env changes
  useEffect(() => {
    if (!selectedAccount || !selectedRepo || !selectedEnv || branchMatchError) return;
    loadSecrets(selectedEnv.name);
  }, [selectedEnv, branchMatchError]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetSecrets() {
    setPresentSecretKeys([]);
    setAzureSecrets({ configured: null, valid: null });
    setAwsSecrets({ configured: null, valid: null });
    setCard("azure_secrets", "idle");
    setCard("aws_secrets", "idle");
  }

  // ── Loaders ───────────────────────────────────────────────────────────────

  function loadStages() {
    if (!selectedAccount || !selectedRepo) return;
    setStagesLoading(true);
    setCard("stages", "loading");

    fetchStatus(selectedAccount, selectedRepo.name)
      .then((data) => {
        const fetched = data.stages || [];
        const merged = pipeline.stages.map(({ key }) => {
          const found = fetched.find((s: any) => s.stage === key);
          return found ?? { stage: key, status: "failed" as const };
        });
        setStages(merged);
        setStatusFileFound(true);

        if (data.azure) setAzureSecrets((prev) => ({ ...prev, valid: data.azure.valid ?? null }));
        if (data.aws) setAwsSecrets((prev) => ({ ...prev, valid: data.aws.valid ?? null }));

        setCard("stages", merged.some((s) => s.status === "failed") ? "warning" : "complete");
        setCard("status_update", "complete");
      })
      .catch(() => {
        setStages(pipeline.stages.map(({ key }) => ({ stage: key, status: "pending" as const })));
        setStatusFileFound(false);
        setCard("stages", "idle");
      })
      .finally(() => setStagesLoading(false));
  }

  async function loadPRs(account: Account, repoName: string) {
    setPrLoading(true);
    try {
      const prs = await fetchPullRequests(account, repoName);
      setPullRequests(prs);
      setCard("pr", prs.length > 0 ? "warning" : "idle");
    } catch (e) {
      console.error(e);
    } finally {
      setPrLoading(false);
    }
  }

  async function loadEnvs(account: Account, repoName: string) {
    setEnvLoading(true);
    fetchEnvs(account, repoName)
      .then((list) => setEnvList(list))
      .catch(console.error)
      .finally(() => setEnvLoading(false));
  }

  async function loadSecrets(envName: string) {
    if (!selectedAccount || !selectedRepo) return;
    const keys = await fetchSecrets(selectedAccount, selectedRepo.name, envName);
    const azureConfigured = AZURE_SECRET_KEYS.every((k) => keys.includes(k));
    const awsConfigured = AWS_SECRET_KEYS.every((k) => keys.includes(k));
    setAzureSecrets((prev) => ({ ...prev, configured: azureConfigured }));
    setAwsSecrets((prev) => ({ ...prev, configured: awsConfigured }));
    setCard("azure_secrets", azureConfigured ? "complete" : "warning");
    setCard("aws_secrets", awsConfigured ? "complete" : "warning");
    setPresentSecretKeys(keys);
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
    } catch (e: any) {
      setCloneError(e.message || "Clone failed");
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
    } catch (e: any) {
      setCreateBranchError(e.message || "Failed to create branch");
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

  async function handleRunStatusUpdate() {
    if (!selectedAccount || !selectedRepo || !isCloneRepo || !envReady || !triggerRef) return;
    setRunError(null);
    setRunning(true);
    setCountdown(180);
    setLastRunTime(Date.now());
    setCard("status_update", "loading");

    const env = Object.fromEntries(envEntries.map((e) => [e.key, e.value]));

    try {
      if (selectedPR) {
        await triggerWorkflowFromPR(selectedAccount, selectedRepo.name, pipeline.workflowId, env, selectedPR.head_sha);
        fetchRuns(selectedAccount, selectedRepo.name, selectedPR.head_sha)
          .then((runs) => {
            if (runs.length > 0) setLastRunId(runs[0].id);
          })
          .catch(console.error);
      } else {
        await triggerWorkflow(selectedAccount, selectedRepo.name, pipeline.workflowId, env, triggerRef);
      }
    } catch (e: any) {
      setRunning(false);
      setCard("status_update", "error");
      setRunError(e.message || "Failed to trigger workflow");
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          loadStages();
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
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
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setRedirecting("logout");
                    window.location.href = `${url}/logout?returnUrl=${encodeURIComponent(window.location.href)}`;
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
                  window.location.href = `${url}/login?returnUrl=${encodeURIComponent(window.location.href)}`;
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
                  window.location.href = `${url}/login?returnUrl=${encodeURIComponent(window.location.href)}`;
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
                  branches={branches}
                  sourceBranch={sourceBranch}
                  onSourceBranchChange={setSourceBranch}
                  creatingBranch={creatingBranch}
                  createBranchError={createBranchError}
                  onCreateBranch={handleCreateBranch}
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

              {/* Step 3 — Environment */}
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
                />
              </PipelineCard>

              {/* Step 4 — Azure Secrets */}
              <PipelineCard
                step={4}
                title="Azure Secrets"
                subtitle={
                  selectedEnv
                    ? `${selectedEnv.name} · AZURE_CLIENT_ID · AZURE_SUBSCRIPTION_ID · AZURE_TENANT_ID`
                    : "AZURE_CLIENT_ID · AZURE_SUBSCRIPTION_ID · AZURE_TENANT_ID"
                }
                status={cardStatus.azure_secrets}
                expanded={expanded.azure_secrets}
                onToggle={() => toggleCard("azure_secrets")}
                disabled={!isCloneRepo || !envReady}
                hasNext
              >
                <SecretsCard
                  provider="azure"
                  requiredKeys={AZURE_SECRET_KEYS}
                  presentKeys={presentSecretKeys}
                  secretsStatus={azureSecrets}
                  repoFullName={repoFullName}
                  onRecheck={handleRecheck}
                  rechecking={rechecking}
                  account={selectedAccount}
                  repo={selectedRepo?.name ?? ""}
                  selectedEnv={selectedEnv ?? null}
                  // selectedEnvName={selectedEnv?.name ?? null}
                />
              </PipelineCard>

              {/* Step 5 — AWS Secrets */}
              <PipelineCard
                step={5}
                title="AWS Secrets"
                subtitle={selectedEnv ? `${selectedEnv.name} · AWS_ACCOUNT_ID · AWS_ROLE_NAME` : "AWS_ACCOUNT_ID · AWS_ROLE_NAME"}
                status={cardStatus.aws_secrets}
                expanded={expanded.aws_secrets}
                onToggle={() => toggleCard("aws_secrets")}
                disabled={!isCloneRepo || !envReady}
                hasNext
              >
                <SecretsCard
                  provider="aws"
                  requiredKeys={AWS_SECRET_KEYS}
                  presentKeys={presentSecretKeys}
                  secretsStatus={awsSecrets}
                  repoFullName={repoFullName}
                  onRecheck={handleRecheck}
                  rechecking={rechecking}
                  account={selectedAccount}
                  repo={selectedRepo?.name ?? ""}
                  selectedEnv={selectedEnv ?? null}
                  // selectedEnvName={selectedEnv?.name ?? null}
                />
              </PipelineCard>

              {/* Step 6 — Env Variables */}
              <PipelineCard
                step={6}
                title="Environment Variables"
                subtitle="Variables passed to the workflow on each run"
                status={cardStatus.envVars}
                expanded={expanded.envVars}
                onToggle={() => toggleCard("envVars")}
                disabled={!isCloneRepo}
                hasNext
              >
                <EnvCard envEntries={envEntries} onChange={setEnvEntries} />
              </PipelineCard>

              {/* Step 7 — Run Status Update */}
              <PipelineCard
                step={7}
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
                  onRun={handleRunStatusUpdate}
                  runError={runError}
                  lastRunId={lastRunId}
                  repoFullName={repoFullName}
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

              {/* Steps 8~N — Stages */}
              {pipeline.stages.map((stageDef, index) => {
                const stage = stages.find((s) => s.stage === stageDef.key) ?? { stage: stageDef.key, status: "pending" as const };
                const cfg = STAGE_STATUS_CONFIG[stage.status];

                return (
                  <PipelineCard
                    key={stageDef.key}
                    step={8 + index}
                    title={stageDef.label}
                    subtitle={cfg.label}
                    status={
                      cardStatus.stages === "loading"
                        ? "loading"
                        : stage.status === "deployed"
                          ? "complete"
                          : stage.status === "success"
                            ? "warning"
                            : stage.status === "failed"
                              ? "error"
                              : "idle"
                    }
                    expanded={!!stagesExpanded[stageDef.key]}
                    onToggle={() => setStagesExpanded((prev) => ({ ...prev, [stageDef.key]: !prev[stageDef.key] }))}
                    disabled={!isCloneRepo}
                    hasNext={index < pipeline.stages.length - 1}
                    action={
                      stage.status === "success" ? (
                        <Button
                          variant="contained"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log("Deploy", stageDef.key, stage.runId);
                          }}
                          sx={{
                            background: "#f97316",
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: "0.72rem",
                            textTransform: "none",
                            py: 0.4,
                            px: 1.5,
                            "&:hover": { background: "#ea6c0a" },
                          }}
                        >
                          Deploy
                        </Button>
                      ) : undefined
                    }
                  >
                    <StageItem
                      stageDef={stageDef}
                      stage={stage}
                      cardStatus={cardStatus}
                      envEntries={envEntries}
                      account={selectedAccount}
                      repoName={selectedRepo?.name || ""}
                    />
                  </PipelineCard>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
