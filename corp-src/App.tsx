import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

import { type CardChrome, type CardHook, type CardId, type CardRequirements, type PendingRestore, type Requirement } from "./types";
import { AZURE_CLIENT_ID } from "./config/azureConfig";
import { groupLabelSx, groupSx, EXPANDED_W } from "./config/cardLayout";
import { deriveCardStatus, deriveCardSummaries, type CardStateInput } from "./logic/cardState";
import { getEnvSettingsUrl } from "./logic/github";
import { useGithubLogin } from "./hooks/useGithubLogin";
import { useGithubRepo } from "./hooks/useGithubRepo";
import { useGithubEnvironment } from "./hooks/useGithubEnvironment";
import { useRepo } from "./hooks/useRepo";
import { useAzureAccount } from "./hooks/useAzureAccount";
import { useAzureLogin } from "./hooks/useAzureLogin";
import { useAzureAppRegistration } from "./hooks/useAzureAppRegistration";
import { useAzureSubscription } from "./hooks/useAzureSubscription";
import { useCreateDomain } from "./hooks/useCreateDomain";
import { useCoreInfra } from "./hooks/useCoreInfra";
import { useRbacCheck } from "./hooks/useRbacCheck";
import { useCompanyInfo } from "./hooks/useCompanyInfo";
import { usePR } from "./hooks/usePR";
import { useUrlRestore } from "./hooks/useUrlRestore";

import NavBar from "./components/NavBar";
import RestoreToast from "./components/RestoreToast";
import SessionOverlay from "./components/SessionOverlay";
import GithubLoginCard from "./cards/GithubLoginCard";
import RepoCard from "./cards/RepoCard";
import CompanyInfoCard from "./cards/CompanyInfoCard";
import AzureLoginCard from "./cards/AzureLoginCard";
import AzureAppRegistrationCard from "./cards/AzureAppRegistrationCard";
import AzureSubscriptionCard from "./cards/AzureSubscriptionCard";
import CoreInfraCard from "./cards/CoreInfraCard";
import CreateDomainCard from "./cards/CreateDomainCard";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

// ─── App ──────────────────────────────────────────────────────────────────────
function AppDashboard() {
  const allCards: Record<string, CardHook> = {};

  function addCard<T extends CardHook>(newCard: T): T {
    allCards[newCard.cardId] = newCard;
    return newCard;
  }
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const restore = useUrlRestore();
  const auth = addCard(useGithubLogin());
  const isAuthed = auth.status === "complete";

  // Stable empty refs — passed to sub-hooks when !isAuthed so restore never fires before login
  const _emptyRestore = useRef<PendingRestore>({ account: null, repo: null, pr: null, env: null });
  const _emptyApplied = useRef(false);
  const _noop = useCallback(() => {}, []);

  const pendingRestoreGated = isAuthed ? restore.pendingRestore : _emptyRestore;
  const urlAccountAppliedGated = isAuthed ? restore.urlAccountApplied : _emptyApplied;
  const addWarningGated = isAuthed ? restore.addRestoreWarning : _noop;
  const checkDoneGated = isAuthed ? restore.checkRestoreDone : _noop;

  /*
   * The GitHub account/repo/clone/branch layer, shared (not a card) — mirrors
   * useAzureAccount on the Azure side. The repo card below is just a thin
   * self-reporting projection of it (+ envReady from useGithubEnvironment).
   */
  const githubRepo = useGithubRepo({
    user: auth.account,
    pendingRestore: pendingRestoreGated,
    urlAccountApplied: urlAccountAppliedGated,
    addRestoreWarning: addWarningGated,
    checkRestoreDone: checkDoneGated,
  });

  const pr = usePR({
    account: githubRepo.selectedAccount,
    repo: githubRepo.selectedRepo,
    isCloneRepo: githubRepo.isCloneRepo,
    pendingRestore: pendingRestoreGated,
    addRestoreWarning: addWarningGated,
    checkRestoreDone: checkDoneGated,
  });

  /*
   * env selection + variables + secrets, shared (not a card) — one tier of GitHub
   * operations. env selection renders inside the repo card; variables back the
   * company_info card; secrets have no UI mounted today (see RepoDetail's neighbor).
   */
  const github = useGithubEnvironment({
    account: githubRepo.selectedAccount,
    repo: githubRepo.selectedRepo,
    isCloneRepo: githubRepo.isCloneRepo,
    selectedPR: pr.selectedPR,
    branches: githubRepo.branches,
    validEnvs: githubRepo.pipeline.validEnvs,
    pendingRestore: pendingRestoreGated,
    addRestoreWarning: addWarningGated,
    checkRestoreDone: checkDoneGated,
  });

  // Self-reports done = isCloneRepo && envReady, now that both live upstream of it. Nothing
  // else reads this card's own return — every field a card needs comes from githubRepo/github.
  addCard(useRepo({ githubRepo, envReady: github.envReady }));
  const companyInfo = addCard(useCompanyInfo({ variableValues: github.presentVariableValues }));

  /*
   * The corp resource target. The saved GitHub vars are authoritative — they're what the
   * pipeline uses — so downstream cards read them, and the subscription card's live pick is
   * only "confirmed" (and that card only `done`) once it matches.
   */
  const savedTenantId = github.presentVariableValues.AZURE_TENANT_ID ?? "";
  const savedSubscriptionId = github.presentVariableValues.AZURE_SUBSCRIPTION_ID ?? "";
  const subscriptionId = savedSubscriptionId;

  // The Azure sign-in session, shared by the login / subscription / app-registration cards.
  const azure = useAzureAccount();
  const subscription = addCard(
    useAzureSubscription({
      azureAccount: azure.account,
      confirmedTenantId: azure.confirmedTenantId,
      manualTenantId: azure.manualTenantId,
      savedTenantId,
      savedSubscriptionId,
    }),
  );
  const subscriptionLabel = subscription.subscriptions.find((s) => s.id === subscriptionId)?.displayName ?? (subscriptionId || undefined);

  const azureSetup = addCard(
    useAzureAppRegistration({
      azureAccount: azure.account,
      githubAccount: githubRepo.selectedAccount,
      githubRepo: githubRepo.selectedRepo?.name ?? "",
      validEnvs: githubRepo.pipeline.validEnvs,
      subscriptionId,
      subscriptionLabel,
      tenantId: savedTenantId || undefined,
    }),
  );

  // Signing out of Azure also drops the cached app-registration result, which belonged to that account.
  const handleAzureLogout = async () => {
    await azure.logout();
    azureSetup.reset();
  };

  const azureLogin = addCard(
    useAzureLogin({
      account: azure.account,
      login: azure.login,
      logout: handleAzureLogout,
      loggingIn: azure.loggingIn,
      loginError: azure.loginError,
      tenants: azure.tenants,
      manualTenantId: azure.manualTenantId,
      setManualTenantId: azure.setManualTenantId,
      confirmedTenantId: azure.confirmedTenantId,
      selectTenant: azure.selectTenant,
      tenantIdError: azure.tenantIdError,
      savedTenantId,
    }),
  );

  // Shared inputs for the infrastructure / domain cards, sourced from repo variables (the
  // pipeline's source of truth) with the app-registration card's own result as fallback.
  const corpSpClientId = github.presentVariableValues.AZURE_CLIENT_ID || azureSetup.result?.clientId || "";
  // The app's own save flow always writes AZURE_PLAN_CLIENT_ID equal to AZURE_CLIENT_ID — a saved
  // mismatch means something else touched it (stale value, manual edit), so treat it as drift too.
  const corpPlanClientId = github.presentVariableValues.AZURE_PLAN_CLIENT_ID || azureSetup.result?.clientId || "";
  const planClientIdMismatch = !!corpSpClientId && !!corpPlanClientId && corpSpClientId !== corpPlanClientId;
  // MSA (personal) accounts sign in via the consumer tenant, so ARM/Graph calls need the real AAD tenant passed explicitly.
  const corpTenantId = savedTenantId || azureSetup.result?.tenantId || azure.manualTenantId.trim() || undefined;

  // Live check: does the app reg exist in this tenant, and does its SP hold RBAC on the selected subscription?
  const { status: rbacStatus, missingRoles: rbacMissingRoles } = useRbacCheck({
    azureAccount: azure.account,
    spClientId: corpSpClientId,
    subscriptionId,
    tenantId: corpTenantId,
  });

  const infra = addCard(
    useCoreInfra({
      azureAccount: azure.account,
      subscriptionId,
      corpName: companyInfo.corpName,
      spClientId: corpSpClientId,
      tenantId: corpTenantId,
    }),
  );
  const createDomain = addCard(
    useCreateDomain({
      azureAccount: azure.account,
      subscriptionId,
      corpName: companyInfo.corpName,
      dnsName: companyInfo.dnsName,
      spClientId: corpSpClientId,
      tenantId: corpTenantId,
    }),
  );

  // ── Accordion + completion flags ───────────────────────────────────────────
  // A Set, not a single id, so multiple cards can stay expanded at once.
  const [expandedIds, setExpandedIds] = useState<Set<CardId>>(new Set());
  const toggle = (id: CardId) =>
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [azureSetupDone, setAzureSetupDone] = useState(false);

  // "azure_app_registration" is only truly done once RBAC is actually ready and the connection vars agree —
  // refine the registry entry now that those live checks are available.
  addCard({ ...azureSetup, done: azureSetupDone && rbacStatus === "ready" && !planClientIdMismatch });

  // ── Derived card statuses ──────────────────────────────────────────────────
  const azureConfigured = !!AZURE_CLIENT_ID;
  const azureSignedIn = !!azure.account;
  const azureTenantLabel = azure.tenants.find((t) => t.tenantId === azure.confirmedTenantId)?.displayName ?? azure.confirmedTenantId ?? undefined;

  const cardState: CardStateInput = {
    isAuthed,
    userLogin: auth.account?.login,
    azureConfigured,
    azureSignedIn,
    azureUsername: azure.account?.username,
    azureTenantConfirmed: azureLogin.done,
    azureTenantLabel,
    azureSetupDone,
    azureSecretsValid: github.azureSecrets.valid,
    appRegResultPresent: !!azureSetup.result,
    hasAzureClientId: !!corpSpClientId,
    rbacStatus,
    planClientIdMismatch,
    isCloneRepo: githubRepo.isCloneRepo,
    repoStatus: githubRepo.status,
    repoFullName: githubRepo.repoFullName,
    envSelected: !!github.selectedEnv,
    envName: github.selectedEnv?.name,
    subscriptionSelected: subscription.done,
    subscriptionLabel,
    subscriptionDrift: subscription.subscriptionDrift,
    subscriptionNoAccess: subscription.subscriptionNoAccess,
    hasCompanyInfo: companyInfo.done,
    corpName: companyInfo.corpName,
    dnsName: companyInfo.dnsName,
    infraDone: infra.done,
    domainVerified: createDomain.domainVerified,
    domainIsPrimary: createDomain.isPrimary,
  };

  const cardStatus = deriveCardStatus(cardState);

  // ── Lock / requirements + face summaries ───────────────────────────────────
  const summaries = deriveCardSummaries(cardState);

  const githubEnvUrl = githubRepo.repoFullName && github.selectedEnv ? getEnvSettingsUrl(githubRepo.repoFullName, github.selectedEnv.id) : undefined;

  // Jumping to a prerequisite adds it to the expanded set rather than replacing it, so the card
  // you came from stays open too.
  const openCard = (id: CardId) => {
    setExpandedIds((cur) => new Set(cur).add(id));
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  // Only surfaces dependencies that are still unmet — a card that reports its own `done` doesn't get
  // listed (and its own sub-dependencies are assumed satisfied too), so this also stops recursing there.
  function getCardRequirementsRecursive(id: CardId): CardRequirements {
    const directRequirements = (allCards[id].cardRequirements ?? []).filter((reqId) => !allCards[reqId]?.done);
    const nestedRequirements = directRequirements.flatMap((reqId) => getCardRequirementsRecursive(reqId));
    return [...new Set([...directRequirements, ...nestedRequirements])];
  }

  const cardProps = (id: CardId): CardChrome => {
    const misconfigured = !azureConfigured && id === "azure_login"; //  A misconfigured Azure card isn't "locked" behind other steps — it's broken regardless of progress, so skip the normal prerequisite list for it.
    const cardRequirementRecursive = getCardRequirementsRecursive(id);
    const requirementsForCard: Requirement[] = [];
    for (const reqCardId of cardRequirementRecursive ?? []) {
      requirementsForCard.push({ label: allCards[reqCardId].cardDependencyLabel, target: reqCardId });
    }
    const requirements = misconfigured ? [] : requirementsForCard;
    return {
      cardId: id,
      status: cardStatus[id],
      summary: summaries[id],
      locked: requirements.length > 0,
      requirements,
      unavailable: misconfigured,
      expanded: expandedIds.has(id),
      onToggle: () => toggle(id),
      onRequirementClick: openCard,
    };
  };

  // ── URL sync (persist current state; restore is handled by useUrlRestore) ──
  useEffect(() => {
    if (!isAuthed) return;
    const p = restore.pendingRestore.current;
    if (p.account !== null || p.repo !== null || p.pr !== null || p.env !== null) return;
    const params = new URLSearchParams();
    if (githubRepo.selectedAccount) params.set("account", githubRepo.selectedAccount.login);
    if (githubRepo.selectedRepo && !githubRepo.selectedRepo.isNew) params.set("repo", githubRepo.selectedRepo.name);
    if (pr.selectedPR) params.set("pr", String(pr.selectedPR.number));
    else if (github.selectedEnv) params.set("env", github.selectedEnv.name);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [isAuthed, githubRepo.selectedAccount, githubRepo.selectedRepo, pr.selectedPR, github.selectedEnv, restore.pendingRestore]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SessionOverlay sessionExpired={auth.sessionExpired} redirecting={auth.redirecting} onLogin={auth.login} />

      <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <NavBar
          authLoading={auth.loggingIn}
          user={auth.account}
          selectedRepo={githubRepo.selectedRepo}
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
              subscription in your name. Complete the cards below in any order — each shows what it needs before it can run.
            </Typography>
          </Box>

          {/* ── Sign in ── */}
          <Typography sx={groupLabelSx}>Sign in</Typography>
          <Box sx={groupSx}>
            <GithubLoginCard
              card={cardProps("github_login")}
              auth={auth}
              onDirectLogout={() => {
                auth.onDirectLogout();
                githubRepo.setSelectedAccount(null);
                githubRepo.setSelectedRepo(null);
              }}
            />
            <AzureLoginCard card={cardProps("azure_login")} azureLogin={azureLogin} configured={azureConfigured} />
          </Box>

          {/* ── Target ── */}
          <Typography sx={groupLabelSx}>Target</Typography>
          <Box sx={groupSx}>
            <RepoCard card={cardProps("repo")} githubRepo={githubRepo} github={github} lockedByPR={!!pr.selectedPR} />
            <AzureSubscriptionCard
              card={cardProps("azure_subscription")}
              azure={azure}
              subscription={subscription}
              githubAccount={githubRepo.selectedAccount}
              repoName={githubRepo.selectedRepo?.name ?? ""}
              selectedEnv={github.selectedEnv}
              onVariableConfirmed={github.onVariableConfirmed}
              githubUrl={githubEnvUrl}
              configured={azureConfigured}
            />
          </Box>

          {/* ── Resources ── */}
          <Typography sx={groupLabelSx}>Resources</Typography>
          <Box sx={groupSx}>
            <CompanyInfoCard
              card={cardProps("company_info")}
              github={github}
              githubAccount={githubRepo.selectedAccount}
              repoName={githubRepo.selectedRepo?.name ?? ""}
              githubUrl={githubEnvUrl}
            />

            <AzureAppRegistrationCard
              card={cardProps("azure_app_registration")}
              appReg={azureSetup}
              githubAccount={githubRepo.selectedAccount}
              repoName={githubRepo.selectedRepo?.name ?? ""}
              selectedEnv={github.selectedEnv}
              subscriptionId={subscriptionId}
              rbacStatus={rbacStatus}
              rbacMissingRoles={rbacMissingRoles}
              planClientIdMismatch={planClientIdMismatch}
              onComplete={setAzureSetupDone}
              githubUrl={githubEnvUrl}
              onAzureValid={github.onAzureValid}
            />

            <CoreInfraCard
              card={cardProps("core_infra")}
              infra={infra}
              azureAccount={azure.account}
              corpName={companyInfo.corpName}
              subscriptionId={subscriptionId}
              spClientId={corpSpClientId}
            />

            <CreateDomainCard
              card={cardProps("create_domain")}
              createDomain={createDomain}
              azureAccount={azure.account}
              corpName={companyInfo.corpName}
              dnsName={companyInfo.dnsName}
            />
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
