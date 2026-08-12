import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";

import {
  type CardChrome,
  type CardHook,
  type CardId,
  type CardStatus,
  type PlanSummary,
  type Stage,
  type StageDefinition,
} from "./types";
import { groupSx, EXPANDED_W } from "./config/cardLayout";
import { createResultStorage } from "./logic/resultStorage";
import { PIPELINE } from "./logic/pipeline";
import { getEffectiveStatus, hasVariableDiff, isNoChanges, stageToCardStatus } from "./logic/stage";
import { useGithubLoginCard } from "./hooks/useGithubLoginCard";
import { useRepoCard } from "./hooks/useRepoCard";
import { useGithubVariables } from "./hooks/useGithubVariables";
import { useUrlRestore, useUrlSync } from "./hooks/useUrlStateManager";
import { useDeploymentPlan } from "./hooks/useDeploymentPlan";
import { useAzureLoginCard } from "./hooks/useAzureLoginCard";
import { useAzureAppRegistrationCard } from "./hooks/useAzureAppRegistrationCard";
import { useAzureSubscriptionCard } from "./hooks/useAzureSubscriptionCard";
import { useCreateDomainCard } from "./hooks/useCreateDomainCard";
import { useCoreInfraCard } from "./hooks/useCoreInfraCard";
import { useCompanyInfoCard } from "./hooks/useCompanyInfoCard";
import { useAccessPassCard } from "./hooks/useAccessPassCard";
import { useGlobalGroupsCard } from "./hooks/useGlobalGroupsCard";

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
import GlobalGroupsCard from "./cards/GlobalGroupsCard";
import StageCard from "./cards/StageCard";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

// ─── App ──────────────────────────────────────────────────────────────────────

const EXPANDED_CARDS_KEY = "zeninstaller_corp_expanded_cards";
const { save: saveExpandedCards, load: loadExpandedCards } = createResultStorage<CardId[]>(EXPANDED_CARDS_KEY);

const stageCardId = (stageKey: string): CardId => `stage_${stageKey}`;

function stageSummaryText(stage: Stage, summary: PlanSummary | undefined, loading: boolean, stale: boolean, optional?: boolean): string {
  if (stale) return "Status update required";
  if (loading) return "Loading status...";
  if (isNoChanges(summary)) return "No changes";
  const effectiveStatus = getEffectiveStatus(stage, summary, optional);
  return (
    {
      deployed: "Deployed",
      success: "Ready to deploy",
      failed: "Failed",
      pending: "Not yet executed",
      skipped: "Skipped",
    } as Record<string, string>
  )[effectiveStatus];
}

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
  const githubVariables = useGithubVariables({
    account: githubRepoEnv.repo.selectedAccount,
    repoName: githubRepoEnv.repo.selectedRepo?.name ?? null,
    envName: githubRepoEnv.env.branchMatchError ? null : (githubRepoEnv.env.selectedEnv?.name ?? null),
  });
  const githubVariableValues = githubVariables.values;

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

  const globalGroups = addCard(
    useGlobalGroupsCard({
      azureAccount: azureLogin.account,
      confirmedTenantId: azureLogin.confirmedTenantId,
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

  const plan = useDeploymentPlan({
    account: githubRepoEnv.repo.selectedAccount,
    repoName: githubRepoEnv.repo.selectedRepo?.name ?? null,
    pipeline: PIPELINE,
    selectedEnv: githubRepoEnv.env.selectedEnv,
    branches: githubRepoEnv.repo.branchList,
    branchMatchError: githubRepoEnv.env.branchMatchError,
    envReady: githubRepoEnv.done,
  });

  // ── URL restore + sync ───────────────────────────────────────────────────────
  const urlRestore = useUrlRestore([
    {
      active: githubLogin.status === "complete",
      fields: {
        account: githubRepoEnv.repo.restore.account,
        repo: githubRepoEnv.repo.restore.repo,
        env: githubRepoEnv.env.restore.env,
      },
    },
    {
      active: !!azureLogin.account,
      disabled: azureLogin.status === "unavailable",
      fields: {
        tenant: azureLogin.restore.tenant,
        subscription: azureSubscription.restore.subscription,
      },
    },
  ]);
  const selectedRepo = githubRepoEnv.repo.selectedRepo;
  useUrlSync(
    {
      account: githubRepoEnv.repo.selectedAccount?.login,
      repo: selectedRepo && !selectedRepo.isNew ? selectedRepo.name : undefined,
      env: githubRepoEnv.env.selectedEnv?.name,
      tenant: azureLogin.confirmedTenantId || undefined,
      subscription: azureSubscription.selectedSubscriptionId || undefined,
    },
    urlRestore.completed && !githubLogin.loggingIn,
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
  // Jumping to a prerequisite adds it to the expanded set rather than replacing it, so the card
  // you came from stays open too.
  const openCard = (id: CardId) => {
    setExpandedIds((cur) => new Set(cur).add(id));
    requestAnimationFrame(() =>
      document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  const cardProps = (id: CardId): CardChrome => {
    const misconfigured = allCards[id].status === "unavailable";
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
  const cardStatusForStages = Object.fromEntries(
    Object.entries(allCards).map(([id, hook]) => [id, hook.status]),
  ) as Record<CardId, CardStatus>;
  const stageCardProps = (stageDef: StageDefinition, stage: Stage, summary?: PlanSummary): CardChrome => {
    const id = stageCardId(stageDef.key);
    const requirements = githubRepoEnv.done
      ? []
      : [
          {
            label: githubRepoEnv.cardDependencyLabel ?? "Repository & environment",
            target: "repo" as CardId,
          },
        ];
    const locked = requirements.length > 0;
    const effectiveStatus = getEffectiveStatus(stage, summary, stageDef.optional);
    return {
      cardId: id,
      status: locked ? "idle" : stageToCardStatus(effectiveStatus, plan.isStale, plan.stagesLoading),
      summary: locked ? undefined : stageSummaryText(stage, summary, plan.stagesLoading, plan.isStale, stageDef.optional),
      locked,
      requirements,
      unavailable: false,
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
            <GithubLoginCard card={cardProps("github_login")} auth={githubLogin} />
            <AzureLoginCard card={cardProps("azure_login")} azureLogin={azureLogin} />

            <RepoCard card={cardProps("repo")} githubRepo={githubRepoEnv} lockedByPR={false} />

            <AzureSubscriptionCard
              card={cardProps("azure_subscription")}
              azure={azureLogin}
              subscription={azureSubscription}
              githubAccount={githubRepoEnv.repo.selectedAccount}
              repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
              selectedEnv={githubRepoEnv.env.selectedEnv}
              variables={githubVariables}
              githubUrl={githubRepoEnv.githubEnvUrl}
              onOpenAzureLogin={() => openCard("azure_login")}
              onUserInteract={() => urlRestore.cancel(["tenant", "subscription"])}
            />

            <AccessPassCard card={cardProps("access_pass")} accessPass={azureAccessPass} />

            <CompanyInfoCard
              card={cardProps("company_info")}
              selectedEnv={githubRepoEnv.env.selectedEnv}
              variables={githubVariables}
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
              variables={githubVariables}
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

            <GlobalGroupsCard card={cardProps("global_groups")} globalGroups={globalGroups} />

            {PIPELINE.stages.map((stageDef) => {
              const stage = plan.stages.find((s) => s.stage === stageDef.key) ?? { stage: stageDef.key, status: "pending" as const };
              const summary = plan.stageSummaries[stageDef.key];
              const effectiveStatus = getEffectiveStatus(stage, summary, stageDef.optional);
              const varsMismatch = plan.deployedEnv != null && hasVariableDiff(stageDef.prerequisites, githubVariableValues, plan.deployedEnv);
              const deployDisabled = plan.isStale || varsMismatch;
              const onDeploy =
                effectiveStatus === "success" && stage.runId && githubRepoEnv.env.selectedEnv
                  ? async () => {
                      await plan.deployStage({
                        stageDef,
                        stage,
                        envName: githubRepoEnv.env.selectedEnv!.name,
                        branches: githubRepoEnv.repo.branchList,
                      });
                    }
                  : undefined;

              return (
                <StageCard
                  key={stageDef.key}
                  card={stageCardProps(stageDef, stage, summary)}
                  stageDef={stageDef}
                  stage={stage}
                  deployDisabled={deployDisabled}
                  deployedEnv={plan.deployedEnv}
                  variableValues={githubVariableValues}
                  cardStatus={cardStatusForStages}
                  account={githubRepoEnv.repo.selectedAccount}
                  repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                  selectedEnv={githubRepoEnv.env.selectedEnv}
                  onVariableConfirmed={githubVariables.onConfirmed}
                  onDeploy={onDeploy}
                  onPlanSummary={(s) => plan.setStageSummary(stageDef.key, s)}
                  onRunStatusUpdate={plan.onRun}
                  statusUpdateRunning={plan.running}
                  statusUpdateCountdown={plan.countdown}
                  statusUpdateDisabled={!githubRepoEnv.done || plan.running || plan.retryCount > 0}
                  runError={plan.runError}
                />
              );
            })}
          </Box>
        </Box>
      </Box>

      <RestoreToast
        loading={urlRestore.restoring}
        warnings={urlRestore.warnings}
        onDismiss={urlRestore.dismissWarnings}
      />
    </>
  );
}

export default withAITracking(reactPlugin, AppDashboard, "corpInstaller");
