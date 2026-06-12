import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";

import { type CardId, type CardStatus, type StageStatus } from "./types";
import { useActiveAuth as useAuth } from "./hooks/useActiveAuth";
import { useAccountRepo } from "./hooks/useAccountRepo";
import { useDeploymentPlan } from "./hooks/useDeploymentPlan";
import { useEnv } from "./hooks/useEnv";
import { usePR } from "./hooks/usePR";
import { useUrlRestore } from "./hooks/useUrlRestore";
import { getEffectiveStatus, stageToCardStatus, hasVariableDiff } from "./logic/stage";

import Connector from "./components/Connector";
import NavBar from "./components/NavBar";
import RestoreToast from "./components/RestoreToast";
import SessionOverlay from "./components/SessionOverlay";
import LoginStep from "./steps/LoginStep";
import RepoStep from "./steps/RepoStep";
import PRStep from "./steps/PRStep";
import EnvStep from "./steps/EnvStep";
import StatusUpdateStep from "./steps/StatusUpdateStep";
import StageStep from "./steps/StageStep";

// ─── App ──────────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const restore = useUrlRestore();
  const auth = useAuth();
  const repo = useAccountRepo({
    user: auth.user,
    pendingRestore: restore.pendingRestore,
    urlAccountApplied: restore.urlAccountApplied,
    addRestoreWarning: restore.addRestoreWarning,
    checkRestoreDone: restore.checkRestoreDone,
  });
  const pr = usePR({
    account: repo.selectedAccount,
    repo: repo.selectedRepo,
    isCloneRepo: repo.isCloneRepo,
    pendingRestore: restore.pendingRestore,
    addRestoreWarning: restore.addRestoreWarning,
    checkRestoreDone: restore.checkRestoreDone,
  });
  const env = useEnv({
    account: repo.selectedAccount,
    repo: repo.selectedRepo,
    isCloneRepo: repo.isCloneRepo,
    selectedPR: pr.selectedPR,
    branches: repo.branches,
    pendingRestore: restore.pendingRestore,
    addRestoreWarning: restore.addRestoreWarning,
    checkRestoreDone: restore.checkRestoreDone,
  });
  const plan = useDeploymentPlan({
    account: repo.selectedAccount,
    repoName: repo.selectedRepo?.name ?? null,
    pipeline: repo.pipeline,
    selectedEnv: env.selectedEnv,
    branches: repo.branches,
    branchMatchError: env.branchMatchError,
    isCloneRepo: repo.isCloneRepo,
    selectedPR: pr.selectedPR,
    envReady: env.envReady,
    onAzureValid: env.onAzureValid,
    onAwsValid: env.onAwsValid,
  });

  // ── Expanded state ─────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Record<CardId, boolean>>({
    auth: true,
    repo: true,
    pr: true,
    env: true,
    status_update: true,
    stages: true,
  });
  const toggle = (id: CardId) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const [stagesExpanded, setStagesExpanded] = useState<Record<string, boolean>>({});

  // ── Derived card statuses ──────────────────────────────────────────────────
  const prStatus: CardStatus = pr.selectedPR ? "complete" : env.selectedEnv ? "skipped" : repo.status === "complete" ? "loading" : "idle";

  const effectiveEnvStatus: CardStatus = env.status === "idle" && repo.status === "complete" ? "loading" : env.status;

  const effectiveStatusUpdateStatus: CardStatus = plan.statusUpdateStatus === "idle" && env.envReady ? "loading" : plan.statusUpdateStatus;

  const cardStatus: Record<CardId, CardStatus> = {
    auth: auth.status,
    repo: repo.status,
    pr: prStatus,
    env: effectiveEnvStatus,
    status_update: effectiveStatusUpdateStatus,
    stages: !plan.hasPlan ? "idle" : plan.stages.some((s) => s.status === "failed") ? "warning" : "complete",
  };

  // ── URL sync (persist current state; restore is handled by useUrlRestore) ──
  useEffect(() => {
    const p = restore.pendingRestore.current;
    if (p.account !== null || p.repo !== null || p.pr !== null || p.env !== null) return;
    const params = new URLSearchParams();
    if (repo.selectedAccount) params.set("account", repo.selectedAccount.login);
    if (repo.selectedRepo && !repo.selectedRepo.isNew) params.set("repo", repo.selectedRepo.name);
    if (pr.selectedPR) params.set("pr", String(pr.selectedPR.number));
    else if (env.selectedEnv) params.set("env", env.selectedEnv.name);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [repo.selectedAccount, repo.selectedRepo, pr.selectedPR, env.selectedEnv, restore.pendingRestore]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SessionOverlay sessionExpired={auth.sessionExpired} redirecting={auth.redirecting} onLogin={auth.onLogin} />

      <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <NavBar authLoading={auth.authLoading} user={auth.user} selectedRepo={repo.selectedRepo} onLogout={auth.onLogout} />

        <Box sx={{ maxWidth: 860, mx: "auto", px: 4, py: 5 }}>
          {/* Intro */}
          <Box
            sx={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              px: 3,
              py: 2.5,
              mb: 3,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <Typography sx={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.7, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              The ZenInstaller is used to deploy Zenblox to your environment. It requires a Github repository in your own account, an Azure, and AWS
              subscription in your name. ZenInstaller will guide you through each step of the process starting from nothing.
            </Typography>
          </Box>

          <Connector>
            <LoginStep
              status={auth.status}
              expanded={expanded.auth}
              onToggle={() => toggle("auth")}
              authLoading={auth.authLoading}
              user={auth.user}
              onLogin={auth.onLogin}
              onLogout={auth.onLogout}
            />

            <RepoStep
              status={repo.status}
              expanded={expanded.repo}
              onToggle={() => toggle("repo")}
              accounts={repo.accounts}
              selectedAccount={repo.selectedAccount}
              onAccountChange={repo.setSelectedAccount}
              repos={repo.repos}
              selectedRepo={repo.selectedRepo}
              onRepoChange={repo.setSelectedRepo}
              templateStatus={repo.templateStatus}
              templateName={repo.templateName}
              defaultTemplateRepo="ZenMe-AU/ZBCorpArchitecture"
              isPrivate={repo.isPrivate}
              onIsPrivateChange={repo.setIsPrivate}
              includeAllBranch={repo.includeAllBranch}
              onIncludeAllBranchChange={repo.setIncludeAllBranch}
              cloning={repo.cloning}
              cloneError={repo.cloneError}
              onClone={repo.onClone}
              createEnvs={repo.createEnvs}
              onCreateEnvsChange={repo.setCreateEnvs}
              cloneEnvWarning={repo.cloneEnvWarning}
              repoLoading={repo.repoLoading}
              repoRefreshFailed={repo.repoRefreshFailed}
              onRefresh={repo.onRefresh}
              repoFullName={repo.repoFullName}
            />

            <PRStep
              status={prStatus}
              expanded={expanded.pr}
              onToggle={() => toggle("pr")}
              disabled={!repo.isCloneRepo}
              repoFullName={repo.repoFullName}
              pullRequests={pr.pullRequests}
              selectedPR={pr.selectedPR}
              onSelectPR={(p) => {
                pr.setSelectedPR(p);
                if (!p) env.setSelectedEnv(null);
              }}
              loading={pr.prLoading}
              refreshFailed={pr.prRefreshFailed}
              onRefresh={pr.onRefresh}
              envList={env.envList}
            />

            <EnvStep
              status={effectiveEnvStatus}
              expanded={expanded.env}
              onToggle={() => toggle("env")}
              disabled={!repo.isCloneRepo}
              envList={env.envList}
              selectedEnv={env.selectedEnv}
              onEnvChange={env.setSelectedEnv}
              lockedByPR={!!pr.selectedPR}
              branchMatchWarning={env.branchMatchWarning}
              branchMatchError={env.branchMatchError}
              loading={env.envLoading}
              refreshFailed={env.envRefreshFailed}
              onRefresh={env.onRefresh}
              presentKeys={env.presentSecretKeys}
              azureSecretsStatus={env.azureSecrets}
              awsSecretsStatus={env.awsSecrets}
              repoFullName={repo.repoFullName}
              onRecheck={env.onRecheck}
              rechecking={env.rechecking}
              recheckFailed={env.recheckFailed}
              account={repo.selectedAccount}
              repo={repo.selectedRepo?.name ?? ""}
              variableValues={env.presentVariableValues}
              onVariableRecheck={env.onVariableRecheck}
              variablesRechecking={env.variablesRechecking}
              varRecheckFailed={env.varRecheckFailed}
              onVariableConfirmed={env.onVariableConfirmed}
              branches={repo.branches}
              sourceBranch={repo.sourceBranch}
              onSourceBranchChange={repo.setSourceBranch}
              creatingBranch={repo.creatingBranch}
              createBranchError={repo.createBranchError}
              onCreateBranch={repo.onCreateBranch}
            />

            <StatusUpdateStep
              status={effectiveStatusUpdateStatus}
              expanded={expanded.status_update}
              onToggle={() => toggle("status_update")}
              disabled={!repo.isCloneRepo || !env.envReady}
              running={plan.running}
              countdown={plan.countdown}
              lastRunTime={plan.lastRunTime}
              lastTriggeredAt={plan.lastTriggeredAt}
              retryCount={plan.retryCount}
              onRun={plan.onRun}
              runError={plan.runError}
              lastRunId={plan.lastRunId}
              repoFullName={repo.repoFullName}
              workflowId={repo.pipeline.workflowId}
            />

            {/* No status file notice */}
            {!plan.hasPlan && repo.isCloneRepo && (
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

            {/* Stale notice */}
            {repo.isCloneRepo && plan.isStale && (
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

            {/* Stages */}
            {repo.pipeline.stages.map((stageDef) => {
              const stage = plan.stages.find((s) => s.stage === stageDef.key) ?? { stage: stageDef.key, status: "pending" as const };
              const summary = plan.stageSummaries[stageDef.key];
              const effectiveStatus: StageStatus = getEffectiveStatus(stage, summary, stageDef.optional);
              const varsMismatch = plan.deployedEnv !== null && hasVariableDiff(stageDef.prerequisites, env.presentVariableValues, plan.deployedEnv);
              const onDeploy =
                effectiveStatus === "success" && stage.runId
                  ? async () => {
                      if (env.selectedEnv)
                        await plan.deployStage({ stageDef, stage, envName: env.selectedEnv.name, pr: pr.selectedPR, branches: repo.branches });
                    }
                  : undefined;
              return (
                <StageStep
                  key={stageDef.key}
                  status={stageToCardStatus(effectiveStatus, plan.isStale, plan.stagesLoading)}
                  expanded={!!stagesExpanded[stageDef.key]}
                  onToggle={() => setStagesExpanded((p) => ({ ...p, [stageDef.key]: !p[stageDef.key] }))}
                  disabled={!repo.isCloneRepo}
                  stageDef={stageDef}
                  stage={stage}
                  summary={summary}
                  deployDisabled={plan.isStale || varsMismatch}
                  deployedEnv={plan.deployedEnv}
                  variableValues={env.presentVariableValues}
                  cardStatus={cardStatus}
                  account={repo.selectedAccount}
                  repoName={repo.selectedRepo?.name || ""}
                  selectedEnv={env.selectedEnv}
                  onVariableConfirmed={env.onVariableConfirmed}
                  onDeploy={onDeploy}
                  onPlanSummary={(s) => plan.setStageSummary(stageDef.key, s)}
                />
              );
            })}
          </Connector>
        </Box>
      </Box>

      <RestoreToast
        loading={restore.urlRestoreMsg.loading}
        warnings={restore.urlRestoreMsg.warnings}
        onDismiss={() => restore.setUrlRestoreMsg((p) => ({ ...p, warnings: [] }))}
      />
    </>
  );
}
