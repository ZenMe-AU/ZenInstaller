import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

import {
  type CardChrome,
  type CardHook,
  type CardId,
  type CardRequirements,
  type PendingRestore,
  type Requirement,
} from "./types";
import { AZURE_CLIENT_ID } from "./config/azureConfig";
import { groupLabelSx, groupSx, EXPANDED_W } from "./config/cardLayout";
import { createResultStorage } from "./logic/resultStorage";
import { useGithubLoginCard } from "./hooks/useGithubLoginCard";
import { useRepoCard } from "./hooks/useRepoCard";
import { useAzureLoginCard } from "./hooks/useAzureLoginCard";
import { useAzureAppRegistrationCard } from "./hooks/useAzureAppRegistrationCard";
import { useAzureSubscriptionCard } from "./hooks/useAzureSubscriptionCard";
import { useCreateDomainCard } from "./hooks/useCreateDomainCard";
import { useCoreInfraCard } from "./hooks/useCoreInfraCard";
import { useCompanyInfoCard } from "./hooks/useCompanyInfoCard";
import { useAccessPassCard } from "./hooks/useAccessPassCard";

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
  const githubLogin = addCard(useGithubLoginCard());

  const githubRepoEnv = addCard(
    useRepoCard({
      user: githubLogin.account,
    }),
  );
  const githubVariableValues = githubRepoEnv.env.presentVariableValues ?? {};

  const companyInfo = addCard(
    useCompanyInfoCard({
      variableValues: githubVariableValues,
      envSelected: !!githubRepoEnv.env.selectedEnv,
    }),
  );

  // The Azure sign-in session, shared by the login / subscription / app-registration / access-pass cards.
  const azureLogin = addCard(
    useAzureLoginCard({
      savedTenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
    }),
  );

  const azureAccessPass = addCard(
    useAccessPassCard({
      azureAccount: azureLogin.account,
      confirmedTenantId: azureLogin.confirmedTenantId,
    }),
  );

  const azureSubscription = addCard(
    useAzureSubscriptionCard({
      azureAccount: azureLogin.account,
      confirmedTenantId: azureLogin.confirmedTenantId,
      manualTenantId: azureLogin.manualTenantId,
      savedSubscriptionId: githubVariableValues.AZURE_SUBSCRIPTION_ID ?? "",
    }),
  );

  const azureAppSetup = addCard(
    useAzureAppRegistrationCard({
      azureAccount: azureLogin.account,
      githubAccount: githubRepoEnv.repo.selectedAccount,
      githubRepo: githubRepoEnv.repo.selectedRepo?.name ?? "",
      subscriptionId: azureSubscription.selectedSubscriptionId,
      subscriptionLabel: azureSubscription.subscriptionLabel,
      tenantId: azureLogin.confirmedTenantId || undefined,
      variableValues: githubVariableValues,
      manualTenantId: azureLogin.manualTenantId,
    }),
  );

  const infra = addCard(
    useCoreInfraCard({
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      corpName: companyInfo.corpName,
      spClientId: azureAppSetup.spClientId,
      tenantId: azureAppSetup.tenantId,
    }),
  );
  const createDomain = addCard(
    useCreateDomainCard({
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      corpName: companyInfo.corpName,
      dnsName: companyInfo.dnsName,
      spClientId: azureAppSetup.spClientId,
      tenantId: azureAppSetup.tenantId,
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

  // Jumping to a prerequisite adds it to the expanded set rather than replacing it, so the card
  // you came from stays open too.
  const openCard = (id: CardId) => {
    setExpandedIds((cur) => new Set(cur).add(id));
    requestAnimationFrame(() =>
      document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
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
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SessionOverlay
        sessionExpired={githubLogin.sessionExpired}
        redirecting={githubLogin.redirecting}
        onLogin={githubLogin.login}
      />

      <Box
        sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        <NavBar
          authLoading={githubLogin.loggingIn}
          user={githubLogin.account}
          selectedRepo={githubRepoEnv.repo.selectedRepo}
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
              The ZenInstaller is used to deploy Zenblox to your environment. It requires a Github repository in your
              own account, an Azure, and AWS subscription in your name. Complete the cards below in any order — each
              shows what it needs before it can run.
            </Typography>
          </Box>

          <Box sx={groupSx}>
            <GithubLoginCard
              card={cardProps("github_login")}
              auth={githubLogin}
              onDirectLogout={() => {
                githubLogin.onDirectLogout();
                githubRepoEnv.repo.setSelectedAccount(null);
                githubRepoEnv.repo.setSelectedRepo(null);
              }}
            />
            <AzureLoginCard card={cardProps("azure_login")} azureLogin={azureLogin} configured={azureConfigured} />

            <RepoCard card={cardProps("repo")} githubRepo={githubRepoEnv} lockedByPR={false} />

            <AzureSubscriptionCard
              card={cardProps("azure_subscription")}
              azure={azureLogin}
              subscription={azureSubscription}
              githubAccount={githubRepoEnv.repo.selectedAccount}
              repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
              selectedEnv={githubRepoEnv.env.selectedEnv}
              onVariableConfirmed={githubRepoEnv.env.onVariableConfirmed}
              githubUrl={githubRepoEnv.githubEnvUrl}
              configured={azureConfigured}
              onOpenAzureLogin={() => openCard("azure_login")}
            />

            <AccessPassCard card={cardProps("access_pass")} accessPass={azureAccessPass} />

            <CompanyInfoCard
              card={cardProps("company_info")}
              github={githubRepoEnv}
              githubAccount={githubRepoEnv.repo.selectedAccount}
              repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
              githubUrl={githubRepoEnv.githubEnvUrl}
            />

            <AzureAppRegistrationCard
              card={cardProps("azure_app_registration")}
              appReg={azureAppSetup}
              githubAccount={githubRepoEnv.repo.selectedAccount}
              repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
              selectedEnv={githubRepoEnv.env.selectedEnv}
              subscriptionId={azureSubscription.selectedSubscriptionId}
              githubUrl={githubRepoEnv.githubEnvUrl}
            />

            <CoreInfraCard
              card={cardProps("core_infra")}
              infra={infra}
              azureAccount={azureLogin.account}
              corpName={companyInfo.corpName}
              subscriptionId={azureSubscription.selectedSubscriptionId}
              spClientId={azureAppSetup.spClientId}
            />

            <CreateDomainCard
              card={cardProps("create_domain")}
              createDomain={createDomain}
              azureAccount={azureLogin.account}
              corpName={companyInfo.corpName}
              dnsName={companyInfo.dnsName}
            />
          </Box>
        </Box>
      </Box>

      {/* <RestoreToast
        loading={isAuthed && restore.urlRestoreMsg.loading}
        warnings={isAuthed ? restore.urlRestoreMsg.warnings : []}
        onDismiss={() => restore.setUrlRestoreMsg((p) => ({ ...p, warnings: [] }))}
      /> */}
    </>
  );
}

export default withAITracking(reactPlugin, AppDashboard, "corpInstaller");
