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
        defaultTemplateRepo={PIPELINE.templateRepo}
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
            envList={githubRepo.envList}
            validEnvs={PIPELINE.validEnvs}
            selectedEnv={githubRepo.selectedEnv}
            onEnvChange={githubRepo.setSelectedEnv}
            lockedByPR={lockedByPR}
            branchMatchWarning={githubRepo.branchMatchWarning}
            branchMatchError={githubRepo.branchMatchError}
            loading={githubRepo.envLoading}
            refreshFailed={githubRepo.envRefreshFailed}
            onRefresh={githubRepo.onRefresh}
            repoFullName={githubRepo.repoFullName}
            branches={githubRepo.branches}
            sourceBranch={githubRepo.sourceBranch}
            onSourceBranchChange={githubRepo.setSourceBranch}
            creatingBranch={githubRepo.creatingBranch}
            createBranchError={githubRepo.createBranchError}
            onCreateBranch={githubRepo.onCreateBranch}
          />
        </Box>
      )}
    </Card>
  );
}
