import type { CardStatus } from "../types";
import StepWrapper from "../components/StepWrapper";
import StatusCard from "../cards/StatusCard";

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
  running: boolean;
  countdown: number;
  lastRunTime: number | null;
  lastTriggeredAt: number | null;
  retryCount: number;
  onRun: () => void;
  runError: string | null;
  lastRunId: number | null;
  repoFullName: string | null;
  workflowId: string;
};

export default function StatusUpdateStep({
  status, expanded, onToggle, disabled, hasNext, hasPrev, prevStatus,
  running, countdown, lastRunTime, lastTriggeredAt, retryCount,
  onRun, runError, lastRunId, repoFullName, workflowId,
}: Props) {
  return (
    <StepWrapper
      title="Run Status Update"
      subtitle="Trigger the GitHub Actions workflow to check deployment state"
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
      hasNext={hasNext}
      hasPrev={hasPrev}
      prevStatus={prevStatus}
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
        repoFullName={repoFullName}
        workflowId={workflowId}
      />
    </StepWrapper>
  );
}
