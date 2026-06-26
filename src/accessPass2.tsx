import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

import { type CardId, type CardStatus, type PendingRestore, type StageStatus } from "./types";
import { useActiveAuth as useAuth } from "./hooks/useActiveAuth";
import { useAccountRepo } from "./hooks/useAccountRepo";
import { useAzureSetup } from "./hooks/useAzureSetup";
import { useAzureAccessPass } from "./hooks/useAccessPass";
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
import AzureSetupStep from "./steps/AzureSetupStep";
import AzureAccessPass from "./steps/AccessPass";

// ─── App ──────────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const restore = useUrlRestore();
  const auth = useAuth();
  const isAuthed = auth.status === "complete";

  // Stable empty refs — passed to sub-hooks when !isAuthed so restore never fires before login
  const _emptyRestore = useRef<PendingRestore>({ account: null, repo: null, pr: null, env: null });
  const _emptyApplied = useRef(false);
  const _noop = useCallback(() => {}, []);

  const pendingRestoreGated = isAuthed ? restore.pendingRestore : _emptyRestore;
  const urlAccountAppliedGated = isAuthed ? restore.urlAccountApplied : _emptyApplied;
  const addWarningGated = isAuthed ? restore.addRestoreWarning : _noop;
  const checkDoneGated = isAuthed ? restore.checkRestoreDone : _noop;

  const repo = useAccountRepo({
    user: auth.user,
    pendingRestore: pendingRestoreGated,
    urlAccountApplied: urlAccountAppliedGated,
    addRestoreWarning: addWarningGated,
    checkRestoreDone: checkDoneGated,
  });
  const pr = usePR({
    account: repo.selectedAccount,
    repo: repo.selectedRepo,
    isCloneRepo: repo.isCloneRepo,
    pendingRestore: pendingRestoreGated,
    addRestoreWarning: addWarningGated,
    checkRestoreDone: checkDoneGated,
  });
  const env = useEnv({
    account: repo.selectedAccount,
    repo: repo.selectedRepo,
    isCloneRepo: repo.isCloneRepo,
    selectedPR: pr.selectedPR,
    branches: repo.branches,
    validEnvs: repo.pipeline.validEnvs,
    pendingRestore: pendingRestoreGated,
    addRestoreWarning: addWarningGated,
    checkRestoreDone: checkDoneGated,
  });
  const azureSetup = useAzureSetup({
    githubAccount: repo.selectedAccount,
    githubRepo: repo.selectedRepo?.name ?? "",
    validEnvs: repo.pipeline.validEnvs,
    stages: repo.pipeline.stages,
  });
  const azureAccessPass = useAzureAccessPass({
    githubAccount: repo.selectedAccount,
    githubRepo: repo.selectedRepo?.name ?? "",
    validEnvs: repo.pipeline.validEnvs,
    stages: repo.pipeline.stages,
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
    azure_setup: true,
    azure_access_pass: true,
    pr: true,
    env: true,
    status_update: true,
    stages: true,
  });
  const toggle = (id: CardId) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const [stagesExpanded, setStagesExpanded] = useState<Record<string, boolean>>({});

  // ── Derived card statuses ──────────────────────────────────────────────────
  const prStatus: CardStatus = !isAuthed
    ? "idle"
    : pr.selectedPR
      ? "complete"
      : env.selectedEnv
        ? "skipped"
        : repo.status === "complete"
          ? "loading"
          : "idle";
  const effectiveEnvStatus: CardStatus = !isAuthed ? "idle" : env.status === "idle" && repo.status === "complete" ? "loading" : env.status;
  const effectiveStatusUpdateStatus: CardStatus = !isAuthed
    ? "idle"
    : plan.statusUpdateStatus === "idle" && env.envReady
      ? "loading"
      : plan.statusUpdateStatus;

  const cardStatus: Record<CardId, CardStatus> = {
    auth: isAuthed ? "complete" : "loading",
    repo: isAuthed ? repo.status : "idle",
    pr: prStatus,
    env: effectiveEnvStatus,
    status_update: effectiveStatusUpdateStatus,
    azure_setup: isAuthed && repo.isCloneRepo ? "loading" : "idle",
    azure_access_pass: !isAuthed || !repo.isCloneRepo ? "idle" : azureAccessPass.result ? "complete" : "loading",
    stages: isAuthed && plan.hasPlan ? (plan.stages.some((s) => s.status === "failed") ? "warning" : "complete") : "idle",
  };

  // ── URL sync (persist current state; restore is handled by useUrlRestore) ──
  useEffect(() => {
    if (!isAuthed) return;
    const p = restore.pendingRestore.current;
    if (p.account !== null || p.repo !== null || p.pr !== null || p.env !== null) return;
    const params = new URLSearchParams();
    if (repo.selectedAccount) params.set("account", repo.selectedAccount.login);
    if (repo.selectedRepo && !repo.selectedRepo.isNew) params.set("repo", repo.selectedRepo.name);
    if (pr.selectedPR) params.set("pr", String(pr.selectedPR.number));
    else if (env.selectedEnv) params.set("env", env.selectedEnv.name);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [isAuthed, repo.selectedAccount, repo.selectedRepo, pr.selectedPR, env.selectedEnv, restore.pendingRestore]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SessionOverlay sessionExpired={auth.sessionExpired} redirecting={auth.redirecting} onLogin={auth.onLogin} />

      <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <NavBar authLoading={auth.authLoading} user={auth.user} selectedRepo={repo.selectedRepo} />

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
            


            <AzureAccessPass
              {...azureAccessPass}
              status={cardStatus.azure_access_pass}
              expanded={expanded.azure_access_pass}
              onToggle={() => toggle("azure_access_pass")}
              // disabled={!isAuthed || !repo.isCloneRepo}
              validEnvs={repo.pipeline.validEnvs}
              onComplete={() => {}}
            />

 


          </Connector>
        </Box>
      </Box>

      <RestoreToast
        loading={isAuthed && restore.urlRestoreMsg.loading}
        warnings={isAuthed ? restore.urlRestoreMsg.warnings : []}
        onDismiss={() => restore.setUrlRestoreMsg((p) => ({ ...p, warnings: [] }))}
      />
    </>
  );
}
