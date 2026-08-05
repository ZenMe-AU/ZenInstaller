import { Box, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Card from "../components/Card";
import RepoDetail from "./RepoDetail";
import EnvDetail from "./EnvDetail";
import { getRepoUrl } from "../logic/github";
import { PIPELINE } from "../logic/pipeline";
import { MONO as mono } from "../config/styles";
import type { CardChrome } from "../types";
import type { UseRepoCard } from "../hooks/useRepoCard";

type Props = {
  card: CardChrome;
  githubRepo: UseRepoCard;
  lockedByPR: boolean;
};

/*
 * The repo card actually spans two concerns — which repo, and which environment in
 * it — so unlike the other cards its content is two Detail components, not one.
 */
export default function RepoCard({ card, githubRepo, lockedByPR }: Props) {
  const { repo, env } = githubRepo;
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

  return (
    <Card title="Repository & environment" action={viewRepoAction} {...card}>
      <RepoDetail
        accounts={repo.accounts}
        selectedAccount={repo.selectedAccount}
        onAccountChange={repo.setSelectedAccount}
        repos={repo.repos}
        selectedRepo={repo.selectedRepo}
        onRepoChange={repo.setSelectedRepo}
        templateStatus={repo.templateStatus}
        templateName={repo.templateName}
        defaultTemplateRepo={PIPELINE.templateRepo}
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
            envList={env.envList}
            validEnvs={PIPELINE.validEnvs}
            selectedEnv={env.selectedEnv}
            onEnvChange={env.setSelectedEnv}
            lockedByPR={lockedByPR}
            branchMatchWarning={env.branchMatchWarning}
            branchMatchError={env.branchMatchError}
            loading={env.envLoading}
            refreshFailed={env.envRefreshFailed}
            onRefresh={env.onRefresh}
            repoFullName={repo.repoFullName}
            branches={repo.branches}
            sourceBranch={repo.sourceBranch}
            onSourceBranchChange={repo.setSourceBranch}
            creatingBranch={repo.creatingBranch}
            createBranchError={repo.createBranchError}
            onCreateBranch={repo.onCreateBranch}
          />
        </Box>
      )}
    </Card>
  );
}
