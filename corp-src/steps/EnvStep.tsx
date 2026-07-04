import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Button } from "@mui/material";
import type {
  Account,
  Branch,
  CardStatus,
  GhEnv,
  SecretsStatus,
} from "../../access-pass-src/types";
import StepWrapper from "../../corp-src/components/StepWrapper";
import EnvironmentCard from "../cards/EnvironmentCard";

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  // ── Domain ───────────────────────────────────────────────────────────────
  envList: GhEnv[];
  validEnvs: readonly string[];
  selectedEnv: GhEnv | null;
  onEnvChange: (env: GhEnv | null) => void;
  lockedByPR: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  loading: boolean;
  refreshFailed?: boolean;
  onRefresh: () => void;
  presentKeys: string[];
  azureSecretsStatus: SecretsStatus;
  awsSecretsStatus: SecretsStatus;
  repoFullName: string | null;
  onRecheck: () => void;
  rechecking: boolean;
  recheckFailed?: boolean;
  account: Account | null;
  repo: string;
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  varRecheckFailed?: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
  branches: Branch[];
  sourceBranch: string;
  onSourceBranchChange: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  onCreateBranch: (target: string) => void;
};

export default function EnvStep({
  status, expanded, onToggle, disabled,
  envList, validEnvs, selectedEnv, onEnvChange,
  lockedByPR, branchMatchWarning, branchMatchError,
  loading, refreshFailed, onRefresh,
  presentKeys, azureSecretsStatus, awsSecretsStatus,
  repoFullName, onRecheck, rechecking, recheckFailed,
  account, repo,
  variableValues, onVariableRecheck, variablesRechecking, varRecheckFailed, onVariableConfirmed,
  branches, sourceBranch, onSourceBranchChange,
  creatingBranch, createBranchError, onCreateBranch,
}: Props) {
  return (
    <StepWrapper
      title="Choose the environment to set up"
      subtitle={selectedEnv ? selectedEnv.name : `${validEnvs.length === 2 ? validEnvs.join(" and ") : validEnvs.join(", ")} are set up separately`}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
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
        validEnvs={validEnvs}
        selectedEnv={selectedEnv}
        onEnvChange={onEnvChange}
        lockedByPR={lockedByPR}
        branchMatchWarning={branchMatchWarning}
        branchMatchError={branchMatchError}
        loading={loading}
        refreshFailed={refreshFailed}
        onRefresh={onRefresh}
        presentKeys={presentKeys}
        azureSecretsStatus={azureSecretsStatus}
        awsSecretsStatus={awsSecretsStatus}
        repoFullName={repoFullName}
        onRecheck={onRecheck}
        rechecking={rechecking}
        recheckFailed={recheckFailed}
        account={account}
        repo={repo}
        variableValues={variableValues}
        onVariableRecheck={onVariableRecheck}
        variablesRechecking={variablesRechecking}
        varRecheckFailed={varRecheckFailed}
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
