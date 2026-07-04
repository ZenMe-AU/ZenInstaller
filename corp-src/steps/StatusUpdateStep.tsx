import type { CardStatus } from "../../access-pass-src/types";
import StepWrapper from "../../corp-src/components/StepWrapper";
import StatusCard from "../cards/StatusCard";

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  // ── Domain ───────────────────────────────────────────────────────────────
  running: boolean;
  countdown: number;
  lastRunTime: number | null;
  lastTriggeredAt: number | null;
  retryCount: number;
  onRun: () => void;
  runError: string | null;
  lastRunId: number | null;
  statusFileRunId: string | null;
  repoFullName: string | null;
  workflowId: string;
};

export default function StatusUpdateStep({
  status, expanded, onToggle, disabled,
  running, countdown, lastRunTime, lastTriggeredAt, retryCount,
  onRun, runError, lastRunId, statusFileRunId, repoFullName, workflowId,
}: Props) {
  return (
    <StepWrapper
      title="Run Status Update"
      subtitle={statusFileRunId ? `Last run #${statusFileRunId}` : "Trigger the GitHub Actions workflow to check deployment state"}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
    >
      <StatusCard
        running={running}
        countdown={countdown}
        lastRunTime={lastRunTime}
        lastTriggeredAt={lastTriggeredAt}
        retryCount={retryCount}
        onRun={onRun}
        runError={runError}
        lastRunId={lastRunId}
        statusFileRunId={statusFileRunId}
        repoFullName={repoFullName}
        workflowId={workflowId}
      />
    </StepWrapper>
  );
}
