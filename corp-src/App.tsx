import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import { type CardId, type CardStatus, type PendingRestore } from "./types";
import { AZURE_CLIENT_ID } from "./config/azureConfig";
import { AZURE_VARIABLE_KEYS, AZURE_SECRET_KEYS, AWS_SECRET_KEYS } from "./logic/variables";
import { tileRequirements, type TileFlags } from "./logic/tileRequirements";
import { useActiveAuth as useAuth } from "./hooks/useActiveAuth";
import { useAccountRepo } from "./hooks/useAccountRepo";
import { useAzureSetup } from "./hooks/useAzureSetup";
import { useCreateDomainSetup } from "./hooks/useCreateDomainSetup";
import { useTerraformSetup } from "./hooks/useTerraformSetup";
import { useAwsSetup } from "./hooks/useAwsSetup";
import { useDeploymentPlan } from "./hooks/useDeploymentPlan";
import { useEnv } from "./hooks/useEnv";
import { usePR } from "./hooks/usePR";
import { useUrlRestore } from "./hooks/useUrlRestore";

import CardTile from "./components/CardTile";
import NavBar from "./components/NavBar";
import RestoreToast from "./components/RestoreToast";
import SessionOverlay from "./components/SessionOverlay";
import LoginDetail from "./cards/LoginDetail";
import RepoDetail from "./cards/RepoDetail";
import EnvDetail from "./cards/EnvDetail";
import EnvVariablesDetail from "./cards/EnvVariablesDetail";
import AzureLoginDetail from "./cards/AzureLoginDetail";
import AzureDeployDetail from "./cards/AzureDeployDetail";
import CreateDomainDetail from "./cards/CreateDomainDetail";
import TfBackendDetail from "./cards/TfBackendDetail";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const groupLabelSx = { fontSize: "0.72rem", color: "#94a3b8", ...mono, mt: 3.5, mb: 1.25, letterSpacing: "0.02em", textTransform: "uppercase" as const };
// Collapsed tiles are a uniform fixed width and wrap 3-per-row; an expanded tile
// spans exactly that 3-tile width (3 tiles + two 12px gaps) so its right edge lines up.
const TILE_W = 300;
const EXPANDED_W = TILE_W * 3 + 24;
const groupSx = { display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start" } as const;

// ─── App ──────────────────────────────────────────────────────────────────────

function AppDashboard() {
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

  // Shared inputs for the corp-domain / terraform cards, sourced from repo variables
  // (the pipeline's source of truth) with the Azure card's live selection as fallback.
  const corpName = env.presentVariableValues.NAME ?? "";
  const dnsName = env.presentVariableValues.DNS ?? "";
  const corpSubscriptionId =
    env.presentVariableValues.AZURE_SUBSCRIPTION_ID || azureSetup.result?.subscriptionIds[0] || azureSetup.selectedSubs[0] || "";
  const corpSpClientId = env.presentVariableValues.AZURE_CLIENT_ID || azureSetup.result?.clientId || "";
  // MSA (personal) accounts sign in via the consumer tenant, so ARM/Graph calls need the real AAD tenant passed explicitly.
  const corpTenantId = env.presentVariableValues.AZURE_TENANT_ID || azureSetup.result?.tenantId || azureSetup.manualTenantId.trim() || undefined;

  const createDomain = useCreateDomainSetup({
    azureAccount: azureSetup.azureAccount,
    defaultSubscriptionId: corpSubscriptionId,
    corpName,
    dnsName,
    tenantId: corpTenantId,
  });
  // Terraform's storage account lives wherever Corp Domain Setup created it, so it must
  // follow that card's resolved subscription (which the user can override), not the raw env default.
  const tfSetup = useTerraformSetup({
    azureAccount: azureSetup.azureAccount,
    subscriptionId: createDomain.subscriptionId,
    corpName,
    spClientId: corpSpClientId,
    tenantId: corpTenantId,
  });

  const awsSetup = useAwsSetup({
    org: repo.selectedAccount?.login ?? "",
    repo: repo.selectedRepo?.name ?? "",
    validEnvs: repo.pipeline.validEnvs,
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

  // ── Accordion + completion flags ───────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<CardId | null>("auth");
  const toggle = (id: CardId) => setExpandedId((cur) => (cur === id ? null : id));
  const [azureSetupDone, setAzureSetupDone] = useState(false);
  const [awsSetupDone, setAwsSetupDone] = useState(false);

  // ── Derived card statuses ──────────────────────────────────────────────────
  const azureSignedIn = !!azureSetup.azureAccount;
  const hasCompanyInfo = !!corpName && !!dnsName;
  const allAzureVars = AZURE_VARIABLE_KEYS.every((k) => !!env.presentVariableValues[k]);
  const secretKeys = [...AZURE_SECRET_KEYS, ...AWS_SECRET_KEYS];
  const missingSecrets = secretKeys.filter((k) => !env.presentSecretKeys.includes(k));

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

  // Merged Repository & environment tile: complete only when the repo is cloned AND an env is picked.
  const repoEnvStatus: CardStatus = !isAuthed ? "idle" : repo.isCloneRepo && env.selectedEnv ? "complete" : repo.status === "idle" ? "idle" : "loading";

  const cardStatus: Record<CardId, CardStatus> = {
    auth: isAuthed ? "complete" : "loading",
    azure_login: azureSignedIn ? "complete" : "idle",
    repo: repoEnvStatus,
    company_info: !env.selectedEnv ? "idle" : hasCompanyInfo ? "complete" : "warning",
    azure_vars: !azureSetup.result ? "idle" : allAzureVars ? "complete" : "warning",
    secrets: !env.selectedEnv ? "idle" : missingSecrets.length === 0 ? "complete" : "warning",
    pr: prStatus,
    env: effectiveEnvStatus,
    status_update: effectiveStatusUpdateStatus,
    azure_setup:
      !isAuthed || !repo.isCloneRepo || !env.selectedEnv
        ? "idle"
        : !azureSetupDone
          ? "warning"
          : env.azureSecrets.valid === false
            ? "error"
            : "complete", // filled in — validated (true) or not yet run (null) both count as complete
    aws_setup:
      !isAuthed || !repo.isCloneRepo || !env.selectedEnv ? "idle" : !awsSetupDone ? "warning" : env.awsSecrets.valid === false ? "error" : "complete",
    create_domain:
      !isAuthed || !repo.isCloneRepo || !env.selectedEnv
        ? "idle"
        : createDomain.resourcesDone && createDomain.domainVerified && createDomain.isPrimary
          ? "complete"
          : "warning",
    tf_backend: !isAuthed || !repo.isCloneRepo || !env.selectedEnv ? "idle" : tfSetup.done ? "complete" : "warning",
    stages: isAuthed && plan.hasPlan ? (plan.stages.some((s) => s.status === "failed") ? "warning" : "complete") : "idle",
  };

  // ── Lock / requirements + face summaries ───────────────────────────────────
  const flags: TileFlags = {
    isAuthed,
    isCloneRepo: repo.isCloneRepo,
    envSelected: !!env.selectedEnv,
    azureSignedIn,
    hasCompanyInfo,
    hasSubscription: !!corpSubscriptionId,
    appRegDone: !!azureSetup.result,
    domainStorageReady: createDomain.resourcesDone,
    hasAzureClientId: !!corpSpClientId,
  };
  const reqs = (id: CardId) => tileRequirements(id, flags);

  const summaries: Partial<Record<CardId, string>> = {
    auth: isAuthed ? `Signed in as ${auth.user?.login ?? ""}` : "Connect your GitHub account",
    azure_login: azureSignedIn ? azureSetup.azureAccount?.username ?? "Signed in" : "Sign in to Azure",
    repo:
      repo.repoFullName && env.selectedEnv
        ? `${repo.repoFullName} · ${env.selectedEnv.name}`
        : repo.repoFullName
          ? repo.repoFullName
          : "Select repository and environment",
    company_info: hasCompanyInfo ? `${corpName} · ${dnsName}` : "Set company NAME and DNS",
    azure_setup: azureSetup.result ? "App registration ready" : "Create the app registration",
    azure_vars: allAzureVars ? "Connection details saved" : "Not configured yet",
    secrets:
      missingSecrets.length === 0 ? "All secrets configured" : `${missingSecrets.length} of ${secretKeys.length} secret${secretKeys.length !== 1 ? "s" : ""} missing`,
    create_domain: cardStatus.create_domain === "complete" ? "Domain verified and primary" : "Set up the corp domain",
    tf_backend: tfSetup.done ? "Terraform state container ready" : "Set up the terraform backend",
  };

  const githubEnvUrl =
    repo.repoFullName && env.selectedEnv ? `https://github.com/${repo.repoFullName}/settings/environments/${env.selectedEnv.id}/edit` : undefined;

  const tileProps = (id: CardId) => {
    const requirements = reqs(id);
    return {
      status: cardStatus[id],
      summary: summaries[id],
      locked: requirements.length > 0,
      requirements,
      expanded: expandedId === id,
      onToggle: () => toggle(id),
    };
  };
  const itemSx = (id: CardId) => ({ width: expandedId === id ? EXPANDED_W : TILE_W, maxWidth: "100%" });

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

  const viewRepoAction = repo.repoFullName ? (
    <Button
      size="small"
      variant="outlined"
      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
      onClick={() => window.open(`https://github.com/${repo.repoFullName}`, "_blank")}
      sx={{
        borderColor: "#e2e8f0",
        color: "#475569",
        fontSize: "0.72rem",
        textTransform: "none",
        ...mono,
        "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
      }}
    >
      View on GitHub
    </Button>
  ) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SessionOverlay sessionExpired={auth.sessionExpired} redirecting={auth.redirecting} onLogin={auth.onLogin} />

      <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <NavBar
          authLoading={auth.authLoading}
          user={auth.user}
          selectedRepo={repo.selectedRepo}
          siblingPages={[
            { label: "Access Pass", href: "/accessPass.html" },
            { label: "Private Account", href: "/privAccount.html" },
            { label: "AWS Hosting", href: "/awsHosting.html", carryQuery: true },
            { label: "Cost Management", href: "/costManagement.html", carryQuery: true },
            { label: "User Access", href: "/userAccess.html", carryQuery: true },
          ]}
        />

        <Box sx={{ maxWidth: EXPANDED_W, mx: "auto", px: 4, py: 5 }}>
          {/* Intro */}
          <Box
            sx={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              px: 3,
              py: 2.5,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <Typography sx={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.7 }}>
              The ZenInstaller is used to deploy Zenblox to your environment. It requires a Github repository in your own account, an Azure, and AWS
              subscription in your name. Complete the tiles below in any order — each shows what it needs before it can run.
            </Typography>
          </Box>

          {/* ── Sign in ── */}
          <Typography sx={groupLabelSx}>Sign in</Typography>
          <Box sx={groupSx}>
            <Box sx={itemSx("auth")}>
              <CardTile title="GitHub login" {...tileProps("auth")}>
                <LoginDetail
                  authLoading={auth.authLoading}
                  user={auth.user}
                  onLogin={auth.onLogin}
                  onLogout={auth.onLogout}
                  onPatLogin={auth.onPatLogin}
                  onDirectLogout={() => {
                    auth.onDirectLogout();
                    repo.setSelectedAccount(null);
                    repo.setSelectedRepo(null);
                  }}
                />
              </CardTile>
            </Box>
            {AZURE_CLIENT_ID && (
              <Box sx={itemSx("azure_login")}>
                <CardTile title="Azure login" {...tileProps("azure_login")}>
                  <AzureLoginDetail
                    azureAccount={azureSetup.azureAccount}
                    loggingIn={azureSetup.loggingIn}
                    loginError={azureSetup.loginError}
                    login={azureSetup.login}
                    logout={azureSetup.logout}
                  />
                </CardTile>
              </Box>
            )}
          </Box>

          {/* ── Target ── */}
          <Typography sx={groupLabelSx}>Target</Typography>
          <Box sx={groupSx}>
            <Box sx={itemSx("repo")}>
              <CardTile title="Repository & environment" action={viewRepoAction} {...tileProps("repo")}>
                <RepoDetail
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
                />
                <Box sx={{ mt: 2.5, pt: 2.5, borderTop: "1px solid #f1f5f9" }}>
                  <EnvDetail
                    showConfig={false}
                    envList={env.envList}
                    validEnvs={repo.pipeline.validEnvs}
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
                </Box>
              </CardTile>
            </Box>
          </Box>

          {/* ── Resources ── */}
          <Typography sx={groupLabelSx}>Resources</Typography>
          <Box sx={groupSx}>
            <Box sx={itemSx("company_info")}>
              <CardTile title="Company info" {...tileProps("company_info")}>
                {env.selectedEnv && (
                  <EnvVariablesDetail
                    account={repo.selectedAccount}
                    repo={repo.selectedRepo?.name ?? ""}
                    selectedEnv={env.selectedEnv}
                    variableValues={env.presentVariableValues}
                    onVariableRecheck={env.onVariableRecheck}
                    variablesRechecking={env.variablesRechecking}
                    varRecheckFailed={env.varRecheckFailed}
                    onVariableConfirmed={env.onVariableConfirmed}
                    githubUrl={githubEnvUrl}
                  />
                )}
              </CardTile>
            </Box>

            {AZURE_CLIENT_ID && (
              <Box sx={itemSx("azure_setup")}>
                <CardTile title="Azure app registration" {...tileProps("azure_setup")}>
                  <AzureDeployDetail
                    {...azureSetup}
                    disabled={reqs("azure_setup").length > 0}
                    account={repo.selectedAccount}
                    repoName={repo.selectedRepo?.name ?? ""}
                    selectedEnv={env.selectedEnv}
                    onComplete={setAzureSetupDone}
                    githubUrl={githubEnvUrl}
                    onAzureValid={env.onAzureValid}
                  />
                </CardTile>
              </Box>
            )}

            <Box sx={itemSx("create_domain")}>
              <CardTile title="Corp domain setup" {...tileProps("create_domain")}>
                <CreateDomainDetail
                  {...createDomain}
                  disabled={reqs("create_domain").length > 0}
                  azureAccount={azureSetup.azureAccount}
                  corpName={corpName}
                  dnsName={dnsName}
                  subscriptions={azureSetup.subscriptions}
                />
              </CardTile>
            </Box>

            <Box sx={itemSx("tf_backend")}>
              <CardTile title="Terraform backend" {...tileProps("tf_backend")}>
                <TfBackendDetail
                  {...tfSetup}
                  disabled={reqs("tf_backend").length > 0}
                  azureAccount={azureSetup.azureAccount}
                  corpName={corpName}
                  subscriptionId={createDomain.subscriptionId}
                  spClientId={corpSpClientId}
                  storageReady={createDomain.resourcesDone}
                />
              </CardTile>
            </Box>
          </Box>
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

export default withAITracking(reactPlugin, AppDashboard, "corpInstaller");
