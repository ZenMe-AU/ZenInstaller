import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import { type CardId, type PendingRestore } from "./types";
import { AZURE_CLIENT_ID } from "./config/azureConfig";
import { MONO as mono } from "./config/styles";
import { groupLabelSx, groupSx, TILE_W, EXPANDED_W } from "./config/tileLayout";
import { tileRequirements } from "./logic/tileRequirements";
import { deriveCardStatus, deriveTileFlags, deriveTileSummaries, type TileStateInput } from "./logic/tileState";
import { getRepoUrl, getEnvSettingsUrl } from "./logic/github";
import { useActiveAuth as useAuth } from "./hooks/useActiveAuth";
import { useAccountRepo } from "./hooks/useAccountRepo";
import { useAzureSetup } from "./hooks/useAzureSetup";
import { useCreateDomainSetup } from "./hooks/useCreateDomainSetup";
import { useInfraSetup } from "./hooks/useInfraSetup";
import { useRbacCheck } from "./hooks/useRbacCheck";
import { useEnv } from "./hooks/useEnv";
import { usePR } from "./hooks/usePR";
import { useUrlRestore } from "./hooks/useUrlRestore";

import CardTile from "./components/CardTile";
import ConfigErrorNotice from "./components/ConfigErrorNotice";
import NavBar from "./components/NavBar";
import RestoreToast from "./components/RestoreToast";
import SessionOverlay from "./components/SessionOverlay";
import LoginDetail from "./cards/LoginDetail";
import RepoDetail from "./cards/RepoDetail";
import EnvDetail from "./cards/EnvDetail";
import EnvVariablesDetail from "./cards/EnvVariablesDetail";
import AzureLoginDetail from "./cards/AzureLoginDetail";
import AzureDeployDetail from "./cards/AzureDeployDetail";
import SubscriptionDetail from "./cards/SubscriptionDetail";
import InfraDetail from "./cards/InfraDetail";
import CreateDomainDetail from "./cards/CreateDomainDetail";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

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
  });

  /*
   * Shared inputs for the subscription / infrastructure / domain cards, sourced from repo
   * variables (the pipeline's source of truth) with the Azure card's live selection as fallback.
   */
  const corpName = env.presentVariableValues.NAME ?? "";
  const dnsName = env.presentVariableValues.DNS ?? "";
  const corpSpClientId = env.presentVariableValues.AZURE_CLIENT_ID || azureSetup.result?.clientId || "";
  // MSA (personal) accounts sign in via the consumer tenant, so ARM/Graph calls need the real AAD tenant passed explicitly.
  const corpTenantId = env.presentVariableValues.AZURE_TENANT_ID || azureSetup.result?.tenantId || azureSetup.manualTenantId.trim() || undefined;

  /*
   * The corp resource-target subscription. The saved GitHub vars are authoritative (they're what
   * the pipeline uses); the Azure subscription card's live pick is only "confirmed" once it matches
   * them. Downstream (infra/domain/app-reg) uses the saved value and stays locked until confirmed.
   */
  const savedTenant = env.presentVariableValues.AZURE_TENANT_ID ?? "";
  const savedSubscriptionId = env.presentVariableValues.AZURE_SUBSCRIPTION_ID ?? "";
  const pickedTenant = azureSetup.manualTenantId.trim();
  const pickedSubscriptionId = azureSetup.selectedSubscriptionId;
  const subscriptionId = savedSubscriptionId;

  const subscriptionConfirmed = !!savedSubscriptionId && savedSubscriptionId === pickedSubscriptionId && savedTenant === pickedTenant;
  const subscriptionDrift = !!pickedSubscriptionId && !subscriptionConfirmed;
  const subscriptionNoAccess = !!pickedTenant && !!azureSetup.subsError && azureSetup.subscriptions.length === 0;

  // Live check: does the app-reg SP actually hold RBAC on the selected subscription?
  const rbacReady = useRbacCheck({
    azureAccount: azureSetup.azureAccount,
    spClientId: corpSpClientId,
    subscriptionId,
    tenantId: corpTenantId,
  });

  const infra = useInfraSetup({
    azureAccount: azureSetup.azureAccount,
    subscriptionId,
    corpName,
    spClientId: corpSpClientId,
    tenantId: corpTenantId,
  });
  const createDomain = useCreateDomainSetup({
    azureAccount: azureSetup.azureAccount,
    subscriptionId,
    corpName,
    dnsName,
    spClientId: corpSpClientId,
    tenantId: corpTenantId,
  });

  // ── Accordion + completion flags ───────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<CardId | null>(null);
  const toggle = (id: CardId) => setExpandedId((cur) => (cur === id ? null : id));
  const [azureSetupDone, setAzureSetupDone] = useState(false);

  // ── Derived card statuses ──────────────────────────────────────────────────
  const azureConfigured = !!AZURE_CLIENT_ID;
  const azureSignedIn = !!azureSetup.azureAccount;
  const hasCompanyInfo = !!corpName && !!dnsName;
  const subscriptionSelected = subscriptionConfirmed;
  const subscriptionLabel = azureSetup.subscriptions.find((s) => s.id === subscriptionId)?.displayName ?? (subscriptionId || undefined);

  const tileState: TileStateInput = {
    isAuthed,
    userLogin: auth.user?.login,
    azureConfigured,
    azureSignedIn,
    azureUsername: azureSetup.azureAccount?.username,
    azureSetupDone,
    azureSecretsValid: env.azureSecrets.valid,
    appRegResultPresent: !!azureSetup.result,
    hasAzureClientId: !!corpSpClientId,
    rbacReady,
    isCloneRepo: repo.isCloneRepo,
    repoStatus: repo.status,
    repoFullName: repo.repoFullName,
    envSelected: !!env.selectedEnv,
    envName: env.selectedEnv?.name,
    subscriptionSelected,
    subscriptionLabel,
    subscriptionDrift,
    subscriptionNoAccess,
    hasCompanyInfo,
    corpName,
    dnsName,
    infraDone: infra.done,
    domainVerified: createDomain.domainVerified,
    domainIsPrimary: createDomain.isPrimary,
  };

  const cardStatus = deriveCardStatus(tileState);

  // ── Lock / requirements + face summaries ───────────────────────────────────
  const flags = deriveTileFlags(tileState);
  const reqs = (id: CardId) => tileRequirements(id, flags);
  const summaries = deriveTileSummaries(tileState);

  const githubEnvUrl = repo.repoFullName && env.selectedEnv ? getEnvSettingsUrl(repo.repoFullName, env.selectedEnv.id) : undefined;

  const openTile = (id: CardId) => {
    setExpandedId(id);
    requestAnimationFrame(() => document.getElementById(`tile-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const tileProps = (id: CardId) => {
    /*
     * A misconfigured Azure card isn't "locked" behind other steps — it's broken
     * regardless of progress, so skip the normal prerequisite list for it.
     */
    const misconfigured = !azureConfigured && id === "azure_login";
    const requirements = misconfigured ? [] : reqs(id);
    return {
      status: cardStatus[id],
      summary: summaries[id],
      locked: requirements.length > 0,
      requirements,
      unavailable: misconfigured,
      expanded: expandedId === id,
      onToggle: () => toggle(id),
      onRequirementClick: openTile,
    };
  };
  const itemProps = (id: CardId) => ({
    id: `tile-${id}`,
    sx: { width: expandedId === id ? EXPANDED_W : TILE_W, maxWidth: "100%" as const, transition: "width 0.25s ease" },
  });

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
      aria-label="View on GitHub"
      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
      onClick={() => window.open(getRepoUrl(repo.repoFullName!), "_blank")}
      sx={{
        borderColor: "#e2e8f0",
        color: "#475569",
        fontSize: "0.72rem",
        textTransform: "none",
        ...mono,
        "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
      }}
    >
      <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
        View on GitHub
      </Box>
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

        <Box sx={{ maxWidth: EXPANDED_W, mx: "auto", px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 5 } }}>
          {/* Intro */}
          <Box
            sx={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              px: { xs: 2, sm: 3 },
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
            <Box {...itemProps("auth")}>
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
            <Box {...itemProps("azure_login")}>
              <CardTile title="Azure login" {...tileProps("azure_login")}>
                {azureConfigured ? (
                  <AzureLoginDetail
                    azureAccount={azureSetup.azureAccount}
                    loggingIn={azureSetup.loggingIn}
                    loginError={azureSetup.loginError}
                    login={azureSetup.login}
                    logout={azureSetup.logout}
                  />
                ) : (
                  <ConfigErrorNotice />
                )}
              </CardTile>
            </Box>
          </Box>

          {/* ── Target ── */}
          <Typography sx={groupLabelSx}>Target</Typography>
          <Box sx={groupSx}>
            <Box {...itemProps("repo")}>
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
                {!repo.selectedRepo?.isNew && (
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
                )}
              </CardTile>
            </Box>
            <Box {...itemProps("subscription")}>
              <CardTile title="Azure subscription" {...tileProps("subscription")}>
                {azureConfigured ? (
                  <SubscriptionDetail
                    azureAccount={azureSetup.azureAccount}
                    tenants={azureSetup.tenants}
                    manualTenantId={azureSetup.manualTenantId}
                    setManualTenantId={azureSetup.setManualTenantId}
                    selectTenant={azureSetup.selectTenant}
                    subscriptions={azureSetup.subscriptions}
                    selectedSubscriptionId={azureSetup.selectedSubscriptionId}
                    setSelectedSubscriptionId={azureSetup.setSelectedSubscriptionId}
                    subsError={azureSetup.subsError}
                    subscriptionDrift={subscriptionDrift}
                    subscriptionNoAccess={subscriptionNoAccess}
                    account={repo.selectedAccount}
                    repoName={repo.selectedRepo?.name ?? ""}
                    selectedEnv={env.selectedEnv}
                    githubUrl={githubEnvUrl}
                  />
                ) : (
                  <ConfigErrorNotice />
                )}
              </CardTile>
            </Box>
          </Box>

          {/* ── Resources ── */}
          <Typography sx={groupLabelSx}>Resources</Typography>
          <Box sx={groupSx}>
            <Box {...itemProps("company_info")}>
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

            <Box {...itemProps("azure_setup")}>
              <CardTile title="Azure app registration" {...tileProps("azure_setup")}>
                <AzureDeployDetail
                  {...azureSetup}
                  disabled={reqs("azure_setup").length > 0}
                  account={repo.selectedAccount}
                  repoName={repo.selectedRepo?.name ?? ""}
                  selectedEnv={env.selectedEnv}
                  subscriptionId={subscriptionId}
                  rbacReady={rbacReady}
                  onComplete={setAzureSetupDone}
                  githubUrl={githubEnvUrl}
                  onAzureValid={env.onAzureValid}
                />
              </CardTile>
            </Box>

            <Box {...itemProps("infra")}>
              <CardTile title="Corp infrastructure" {...tileProps("infra")}>
                <InfraDetail
                  {...infra}
                  disabled={reqs("infra").length > 0}
                  azureAccount={azureSetup.azureAccount}
                  corpName={corpName}
                  subscriptionId={subscriptionId}
                  spClientId={corpSpClientId}
                />
              </CardTile>
            </Box>

            <Box {...itemProps("create_domain")}>
              <CardTile title="Corp domain" {...tileProps("create_domain")}>
                <CreateDomainDetail
                  {...createDomain}
                  disabled={reqs("create_domain").length > 0}
                  azureAccount={azureSetup.azureAccount}
                  corpName={corpName}
                  dnsName={dnsName}
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
