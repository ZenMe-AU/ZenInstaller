import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

import { type CardChrome, type CardHook, type CardId, type CardRequirements, type PendingRestore, type Requirement } from "./types";
import { AZURE_CLIENT_ID } from "./config/azureConfig";
import { groupLabelSx, groupSx, EXPANDED_W } from "./config/cardLayout";
import { getEnvSettingsUrl } from "./logic/github";
import { createResultStorage } from "./logic/resultStorage";
import { useGithubLoginCard } from "./hooks/useGithubLoginCard";
import { useGithubRepo } from "./hooks/useGithubRepo";
import { useGithubEnvironment } from "./hooks/useGithubEnvironment";
import { useRepoCard } from "./hooks/useRepoCard";
import { useAzureAccount } from "./hooks/useAzureAccount";
import { useAzureLoginCard } from "./hooks/useAzureLoginCard";
import { useAzureAppRegistrationCard } from "./hooks/useAzureAppRegistrationCard";
import { useAzureSubscriptionCard } from "./hooks/useAzureSubscriptionCard";
import { useCreateDomainCard } from "./hooks/useCreateDomainCard";
import { useCoreInfraCard } from "./hooks/useCoreInfraCard";
import { useCompanyInfoCard } from "./hooks/useCompanyInfoCard";
import { useAccessPassCard } from "./hooks/useAccessPassCard";
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
import AccessPassCard from "./cards/AccessPassCard";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

// ─── App ──────────────────────────────────────────────────────────────────────

const EXPANDED_CARDS_KEY = "zeninstaller_corp_expanded_cards";
const { save: saveExpandedCards, load: loadExpandedCards } = createResultStorage<CardId[]>(EXPANDED_CARDS_KEY);

function AppDashboard() {
  const allCards: Record<string, CardHook> = {};

  function addCard<T extends CardHook>(newCard: T): T {
    allCards[newCard.cardId] = newCard;
    return newCard;
  }
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const restore = useUrlRestore();
  const auth = addCard(useGithubLoginCard());
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
  addCard(useRepoCard({ githubRepo, envReady: github.envReady, isAuthed, envName: github.selectedEnv?.name }));
  const companyInfo = addCard(useCompanyInfoCard({ variableValues: github.presentVariableValues, envSelected: !!github.selectedEnv }));

  /*
   * The corp resource target. The saved GitHub vars are authoritative — they're what the
   * pipeline uses — so downstream cards read them, and the subscription card's live pick is
   * only "confirmed" (and that card only `done`) once it matches.
   */
  const savedTenantId = github.presentVariableValues.AZURE_TENANT_ID ?? "";
  const savedSubscriptionId = github.presentVariableValues.AZURE_SUBSCRIPTION_ID ?? "";
  const subscriptionId = savedSubscriptionId;

  // The Azure sign-in session, shared by the login / subscription / app-registration / access-pass cards.
  const azure = useAzureAccount();
  const accessPass = addCard(useAccessPassCard({ azureAccount: azure.account, confirmedTenantId: azure.confirmedTenantId }));
  const subscription = addCard(
    useAzureSubscriptionCard({
      azureAccount: azure.account,
      confirmedTenantId: azure.confirmedTenantId,
      manualTenantId: azure.manualTenantId,
      savedTenantId,
      savedSubscriptionId,
    }),
  );

  const azureSetup = addCard(
    useAzureAppRegistrationCard({
      azureAccount: azure.account,
      githubAccount: githubRepo.selectedAccount,
      githubRepo: githubRepo.selectedRepo?.name ?? "",
      validEnvs: githubRepo.pipeline.validEnvs,
      subscriptionId,
      subscriptionLabel: subscription.subscriptionLabel,
      tenantId: savedTenantId || undefined,
      variableValues: github.presentVariableValues,
      manualTenantId: azure.manualTenantId,
      azureSecretsValid: github.azureSecrets.valid,
    }),
  );

  // Signing out of Azure also drops the cached app-registration result, which belonged to that account.
  const handleAzureLogout = async () => {
    await azure.logout();
    azureSetup.reset();
  };

  const azureLogin = addCard(
    useAzureLoginCard({
      azure: { ...azure, logout: handleAzureLogout },
      savedTenantId,
    }),
  );

  // spClientId / tenantId come off the app-registration card — it's the one hook that already
  // resolves both (saved var, or its own result, or — for tenantId — the manually picked one).
  const infra = addCard(
    useCoreInfraCard({
      azureAccount: azure.account,
      subscriptionId,
      corpName: companyInfo.corpName,
      spClientId: azureSetup.spClientId,
      tenantId: azureSetup.tenantId,
    }),
  );
  const createDomain = addCard(
    useCreateDomainCard({
      azureAccount: azure.account,
      subscriptionId,
      corpName: companyInfo.corpName,
      dnsName: companyInfo.dnsName,
      spClientId: azureSetup.spClientId,
      tenantId: azureSetup.tenantId,
    }),
  );

  // ── Accordion + completion flags ───────────────────────────────────────────
  // A Set, not a single id, so multiple cards can stay expanded at once. Persisted so
  // reloading or navigating back restores what was open.
  const [expandedIds, setExpandedIds] = useState<Set<CardId>>(() => new Set(loadExpandedCards() ?? []));
  useEffect(() => {
    saveExpandedCards(Array.from(expandedIds));
  }, [expandedIds]);
  const toggle = (id: CardId) =>
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // ── Derived card statuses ──────────────────────────────────────────────────
  // Still needed here (not just inside useAzureLoginCard) for cardProps' own "unconfigured →
  // skip the requirements list" special case below.
  const azureConfigured = !!AZURE_CLIENT_ID;

  const githubEnvUrl = githubRepo.repoFullName && github.selectedEnv ? getEnvSettingsUrl(githubRepo.repoFullName, github.selectedEnv.id) : undefined;

  // Jumping to a prerequisite adds it to the expanded set rather than replacing it, so the card
  // you came from stays open too.
  const openCard = (id: CardId) => {
    setExpandedIds((cur) => new Set(cur).add(id));
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const cardProps = (id: CardId): CardChrome => {
    const misconfigured = !azureConfigured && id === "azure_login"; //  A misconfigured Azure card isn't "locked" behind other steps — it's broken regardless of progress, so skip the normal prerequisite list for it.
    const requirementsForCard = (allCards[id].cardRequirements ?? [])
      .filter((reqCardId) => !allCards[reqCardId]?.done)
      .map((reqCardId) => ({
        label: allCards[reqCardId].cardDependencyLabel,
        target: reqCardId,
      }));
    const requirements = misconfigured ? [] : requirementsForCard;
    const locked = requirements.length > 0;
    return {
      cardId: id,
      // A locked card's hook computed its status assuming prerequisites were already met —
      // override to "idle" so it doesn't show e.g. a stale "warning" for work it can't do yet.
      status: locked ? "idle" : allCards[id].status,
      summary: allCards[id].summary,
      locked,
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
              onOpenAzureLogin={() => openCard("azure_login")}
            />

            <AccessPassCard card={cardProps("access_pass")} accessPass={accessPass} />

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
              githubUrl={githubEnvUrl}
              onAzureValid={github.onAzureValid}
            />

            <CoreInfraCard
              card={cardProps("core_infra")}
              infra={infra}
              azureAccount={azure.account}
              corpName={companyInfo.corpName}
              subscriptionId={subscriptionId}
              spClientId={azureSetup.spClientId}
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
