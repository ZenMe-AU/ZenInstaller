import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Button } from "@mui/material";
import type {
  Account,
  Branch,
  CardStatus,
  GhEnv,
  SecretsStatus,
} from "../types";
import StepWrapper from "../components/StepWrapper";
import EnvironmentCard from "../cards/EnvironmentCard";

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Injected by <Connector> */
  hasNext?: boolean;
  hasPrev?: boolean;
  prevStatus?: CardStatus;
  // ── Domain ───────────────────────────────────────────────────────────────
  envList: GhEnv[];
  selectedEnv: GhEnv | null;
  onEnvChange: (env: GhEnv | null) => void;
  lockedByPR: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  loading: boolean;
  onRefresh: () => void;
  presentKeys: string[];
  azureSecretsStatus: SecretsStatus;
  awsSecretsStatus: SecretsStatus;
  repoFullName: string | null;
  onRecheck: () => void;
  rechecking: boolean;
  account: Account | null;
  repo: string;
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
  branches: Branch[];
  sourceBranch: string;
  onSourceBranchChange: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  onCreateBranch: (target: string) => void;
};

export default function EnvStep({
  status, expanded, onToggle, disabled, hasNext, hasPrev, prevStatus,
  envList, selectedEnv, onEnvChange,
  lockedByPR, branchMatchWarning, branchMatchError,
  loading, onRefresh,
  presentKeys, azureSecretsStatus, awsSecretsStatus,
  repoFullName, onRecheck, rechecking,
  account, repo,
  variableValues, onVariableRecheck, variablesRechecking, onVariableConfirmed,
  branches, sourceBranch, onSourceBranchChange,
  creatingBranch, createBranchError, onCreateBranch,
}: Props) {
  return (
    <StepWrapper
      title="Environment"
      subtitle={selectedEnv ? selectedEnv.name : "Select target environment"}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
      hasNext={hasNext}
      hasPrev={hasPrev}
      prevStatus={prevStatus}
      action={
        <Button
          size="small"
          variant="outlined"
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() =>
            window.open(
              `https://github.com/${repoFullName}/settings/environments`,
              "_blank",
            )
          }
          sx={{
            borderColor: "#e2e8f0",
            color: "#475569",
            fontSize: "0.75rem",
            textTransform: "none",
            fontFamily: "'IBM Plex Mono', monospace",
            "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
          }}
        >
          Environments on GitHub
        </Button>
      }
    >
      <EnvironmentCard
        envList={envList}
        selectedEnv={selectedEnv}
        onEnvChange={onEnvChange}
        lockedByPR={lockedByPR}
        branchMatchWarning={branchMatchWarning}
        branchMatchError={branchMatchError}
        loading={loading}
        onRefresh={onRefresh}
        presentKeys={presentKeys}
        azureSecretsStatus={azureSecretsStatus}
        awsSecretsStatus={awsSecretsStatus}
        repoFullName={repoFullName}
        onRecheck={onRecheck}
        rechecking={rechecking}
        account={account}
        repo={repo}
        variableValues={variableValues}
        onVariableRecheck={onVariableRecheck}
        variablesRechecking={variablesRechecking}
        onVariableConfirmed={onVariableConfirmed}
        branches={branches}
        sourceBranch={sourceBranch}
        onSourceBranchChange={onSourceBranchChange}
        creatingBranch={creatingBranch}
        createBranchError={createBranchError}
        onCreateBranch={onCreateBranch}
      />
    </StepWrapper>
  );
}
