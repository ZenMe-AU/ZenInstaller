import { Box, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Card from "../components/Card";
import RepoDetail from "./RepoDetail";
import EnvDetail from "./EnvDetail";
import EnvSecretsDetail from "./EnvSecretsDetail";
import { getRepoUrl } from "../logic/github";
import { MONO as mono } from "../config/styles";
import type { CardChrome } from "../types";
import type { UseGithubRepo } from "../hooks/useGithubRepo";
import type { UseGithubEnvironment } from "../hooks/useGithubEnvironment";

// The secrets section has no design yet, so it's kept wired up but unmounted — flip this
// once there's somewhere for it to go. The fields (presentSecretKeys, azureSecrets, ...)
// keep flowing through useGithubEnvironment either way.
const SECRETS_VISIBLE = false;

type Props = {
  card: CardChrome;
  githubRepo: UseGithubRepo;
  github: UseGithubEnvironment;
  lockedByPR: boolean;
};

/*
 * The repo card actually spans two concerns — which repo, and which environment in
 * it — so unlike the other cards its content is two Detail components, not one.
 */
export default function RepoCard({ card, githubRepo, github, lockedByPR }: Props) {
  const viewRepoAction = githubRepo.repoFullName ? (
    <Button
      size="small"
      variant="outlined"
      aria-label="View on GitHub"
      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
      onClick={() => window.open(getRepoUrl(githubRepo.repoFullName!), "_blank")}
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

  return (
    <Card title="Repository & environment" action={viewRepoAction} {...card}>
      <RepoDetail
        accounts={githubRepo.accounts}
        selectedAccount={githubRepo.selectedAccount}
        onAccountChange={githubRepo.setSelectedAccount}
        repos={githubRepo.repos}
        selectedRepo={githubRepo.selectedRepo}
        onRepoChange={githubRepo.setSelectedRepo}
        templateStatus={githubRepo.templateStatus}
        templateName={githubRepo.templateName}
        defaultTemplateRepo={githubRepo.pipeline.templateRepo}
        isPrivate={githubRepo.isPrivate}
        onIsPrivateChange={githubRepo.setIsPrivate}
        includeAllBranch={githubRepo.includeAllBranch}
        onIncludeAllBranchChange={githubRepo.setIncludeAllBranch}
        cloning={githubRepo.cloning}
        cloneError={githubRepo.cloneError}
        onClone={githubRepo.onClone}
        createEnvs={githubRepo.createEnvs}
        onCreateEnvsChange={githubRepo.setCreateEnvs}
        cloneEnvWarning={githubRepo.cloneEnvWarning}
        repoLoading={githubRepo.repoLoading}
        repoRefreshFailed={githubRepo.repoRefreshFailed}
        onRefresh={githubRepo.onRefresh}
      />
      {!githubRepo.selectedRepo?.isNew && (
        <Box sx={{ mt: 2.5, pt: 2.5, borderTop: "1px solid #f1f5f9" }}>
          <EnvDetail
            envList={github.envList}
            validEnvs={githubRepo.pipeline.validEnvs}
            selectedEnv={github.selectedEnv}
            onEnvChange={github.setSelectedEnv}
            lockedByPR={lockedByPR}
            branchMatchWarning={github.branchMatchWarning}
            branchMatchError={github.branchMatchError}
            loading={github.envLoading}
            refreshFailed={github.envRefreshFailed}
            onRefresh={github.onRefresh}
            repoFullName={githubRepo.repoFullName}
            branches={githubRepo.branches}
            sourceBranch={githubRepo.sourceBranch}
            onSourceBranchChange={githubRepo.setSourceBranch}
            creatingBranch={githubRepo.creatingBranch}
            createBranchError={githubRepo.createBranchError}
            onCreateBranch={githubRepo.onCreateBranch}
          />
          {SECRETS_VISIBLE && github.selectedEnv && !github.branchMatchError && (
            <EnvSecretsDetail
              key={github.selectedEnv.id}
              account={githubRepo.selectedAccount}
              repo={githubRepo.selectedRepo?.name ?? ""}
              selectedEnv={github.selectedEnv}
              presentKeys={github.presentSecretKeys}
              azureSecretsStatus={github.azureSecrets}
              awsSecretsStatus={github.awsSecrets}
              onRecheck={github.onRecheck}
              rechecking={github.rechecking}
              recheckFailed={github.recheckFailed}
            />
          )}
        </Box>
      )}
    </Card>
  );
}
