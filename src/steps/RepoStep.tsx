import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Button } from "@mui/material";
import type { Account, CardStatus, Repo, RepoOption } from "../types";
import StepWrapper from "../components/StepWrapper";
import RepoCard from "../cards/RepoCard";

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  // ── Domain ───────────────────────────────────────────────────────────────
  accounts: Account[];
  selectedAccount: Account | null;
  onAccountChange: (account: Account) => void;
  repos: Repo[];
  selectedRepo: RepoOption | null;
  onRepoChange: (repo: RepoOption | null) => void;
  templateStatus: "checking" | "ready" | "not_clone";
  templateName: string | null;
  defaultTemplateRepo: string;
  isPrivate: boolean;
  onIsPrivateChange: (v: boolean) => void;
  includeAllBranch: boolean;
  onIncludeAllBranchChange: (v: boolean) => void;
  cloning: boolean;
  cloneError: string | null;
  onClone: () => void;
  createEnvs: boolean;
  onCreateEnvsChange: (v: boolean) => void;
  cloneEnvWarning: string | null;
  repoLoading: boolean;
  repoRefreshFailed: boolean;
  onRefresh: () => void;
  repoFullName: string | null;
};

export default function RepoStep({
  status, expanded, onToggle, disabled,
  accounts, selectedAccount, onAccountChange,
  repos, selectedRepo, onRepoChange,
  templateStatus, templateName, defaultTemplateRepo,
  isPrivate, onIsPrivateChange,
  includeAllBranch, onIncludeAllBranchChange,
  cloning, cloneError, onClone,
  createEnvs, onCreateEnvsChange, cloneEnvWarning,
  repoLoading, repoRefreshFailed, onRefresh, repoFullName,
}: Props) {
  const isNewRepo = selectedRepo?.isNew ?? false;
  const subtitle = selectedAccount && selectedRepo && !isNewRepo
    ? `${selectedAccount.login} / ${selectedRepo.name}`
    : "Choose an organisation and target repository to install the corp environment into.";

  return (
    <StepWrapper
      title="Select Target Repository"
      subtitle={subtitle}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
      action={
        repoFullName ? (
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => window.open(`https://github.com/${repoFullName}`, "_blank")}
            sx={{
              borderColor: "#e2e8f0",
              color: "#475569",
              fontSize: "0.75rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
            }}
          >
            View on GitHub
          </Button>
        ) : undefined
      }
    >
      <RepoCard
        accounts={accounts}
        selectedAccount={selectedAccount}
        onAccountChange={onAccountChange}
        repos={repos}
        selectedRepo={selectedRepo}
        onRepoChange={onRepoChange}
        templateStatus={templateStatus}
        templateName={templateName}
        defaultTemplateRepo={defaultTemplateRepo}
        isPrivate={isPrivate}
        onIsPrivateChange={onIsPrivateChange}
        includeAllBranch={includeAllBranch}
        onIncludeAllBranchChange={onIncludeAllBranchChange}
        cloning={cloning}
        cloneError={cloneError}
        onClone={onClone}
        createEnvs={createEnvs}
        onCreateEnvsChange={onCreateEnvsChange}
        cloneEnvWarning={cloneEnvWarning}
        repoLoading={repoLoading}
        repoRefreshFailed={repoRefreshFailed}
        onRefresh={onRefresh}
      />
    </StepWrapper>
  );
}
