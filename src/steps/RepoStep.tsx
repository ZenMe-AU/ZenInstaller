import type { Account, CardStatus, RepoOption, TemplateStatus } from "../types";
import StepWrapper from "../components/StepWrapper";
import RepoCard from "../cards/RepoCard";

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  /** Injected by <Connector> */
  hasNext?: boolean;
  hasPrev?: boolean;
  prevStatus?: CardStatus;
  // ── Domain ───────────────────────────────────────────────────────────────
  accounts: Account[];
  selectedAccount: Account | null;
  onAccountChange: (account: Account) => void;
  repos: RepoOption[];
  selectedRepo: RepoOption | null;
  onRepoChange: (repo: RepoOption | null) => void;
  templateStatus: TemplateStatus;
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
};

export default function RepoStep({
  status, expanded, onToggle, hasNext, hasPrev, prevStatus,
  accounts, selectedAccount, onAccountChange,
  repos, selectedRepo, onRepoChange,
  templateStatus, templateName, defaultTemplateRepo,
  isPrivate, onIsPrivateChange,
  includeAllBranch, onIncludeAllBranchChange,
  cloning, cloneError, onClone,
  createEnvs, onCreateEnvsChange, cloneEnvWarning,
}: Props) {
  return (
    <StepWrapper
      title="Select Repository"
      subtitle="Choose an organisation and repository to work with"
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      hasNext={hasNext}
      hasPrev={hasPrev}
      prevStatus={prevStatus}
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
      />
    </StepWrapper>
  );
}
