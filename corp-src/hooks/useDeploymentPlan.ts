import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { deployChangeset, fetchRuns, fetchStatus, getPlanEnv, triggerWorkflow, triggerWorkflowFromPR } from "../api";
import { isPlanStale } from "../logic/stage";
import type { Account, Branch, CardStatus, GhEnv, PipelineConfig, PlanSummary, PullRequest, Stage, StageDefinition } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PollContext {
  attempt: number;
  triggerTime: number; // ms
  prevRunId: string | null;
}

export interface TriggerPlanParams {
  workflowId: string;
  envName: string;
  triggerRef: string; // branch name (non-PR) or PR head SHA (PR mode, unused for polling ref)
  pr: PullRequest | null;
  branches: Branch[];
}

export interface DeployStageParams {
  stageDef: StageDefinition;
  stage: Stage;
  envName: string;
  pr: PullRequest | null;
  branches: Branch[];
}

export interface UseDeploymentPlan {
  // ── State ─────────────────────────────────────────────────────────────────
  stages: Stage[];
  stageSummaries: Record<string, PlanSummary>;
  /** True when a valid status file was found (false = file missing / fetch error). */
  hasPlan: boolean;
  running: boolean;
  /** True while the status file fetch is in-flight (distinct from countdown). */
  stagesLoading: boolean;
  runError: string | null;
  countdown: number;
  /** Timestamp (ms) of the last status-file update. */
  lastRunTime: number | null;
  /** GitHub workflow run ID for the "view run" link. */
  lastRunId: number | null;
  /** runId field from the status file — persists across page reloads. */
  statusFileRunId: string | null;
  /** Timestamp (ms) when the user last pressed Run — null once fresh data arrives. */
  lastTriggeredAt: number | null;
  retryCount: number;
  deployedEnv: Record<string, string> | null;
  // ── Derived ───────────────────────────────────────────────────────────────
  /** True when a poll is in progress (countdown active OR stale retries pending). */
  isStale: boolean;
  /** CardStatus for the "Run Status Update" pipeline card. */
  statusUpdateStatus: CardStatus;
  // ── Actions ───────────────────────────────────────────────────────────────
  loadPlan: (ref: string) => void;
  triggerPlan: (params: TriggerPlanParams) => Promise<void>;
  deployStage: (params: DeployStageParams) => Promise<void>;
  resetPlan: () => void;
  /** Convenience — triggers the workflow run using the current env/PR/branch context. */
  onRun: () => Promise<void>;
  setStageSummary: (key: string, summary: PlanSummary) => void;
  setLastRunId: (id: number | null) => void;
  setRunError: (err: string | null) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Seconds to wait between each successive poll attempt.
const POLL_DELAYS = [150, 180, 200, 300];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeploymentPlan(opts: {
  account: Account | null;
  repoName: string | null;
  pipeline: PipelineConfig;
  // ── Env context (drives auto-reset, auto-load, and onRun) ──────────────
  selectedEnv: GhEnv | null;
  branches: Branch[];
  branchMatchError: string | null;
  isCloneRepo: boolean;
  selectedPR: PullRequest | null;
  envReady: boolean;
  // ── Callbacks ──────────────────────────────────────────────────────────
  onAzureValid?: (valid: boolean | null) => void;
  onAwsValid?: (valid: boolean | null) => void;
}): UseDeploymentPlan {
  const accountRef = useRef(opts.account);
  const repoNameRef = useRef(opts.repoName);
  const pipelineRef = useRef(opts.pipeline);
  const selectedEnvRef = useRef(opts.selectedEnv);
  const branchesRef = useRef(opts.branches);
  const selectedPRRef = useRef(opts.selectedPR);
  const isCloneRepoRef = useRef(opts.isCloneRepo);
  const envReadyRef = useRef(opts.envReady);
  const onAzureValidRef = useRef(opts.onAzureValid);
  const onAwsValidRef = useRef(opts.onAwsValid);
  useLayoutEffect(() => {
    accountRef.current = opts.account;
    repoNameRef.current = opts.repoName;
    pipelineRef.current = opts.pipeline;
    selectedEnvRef.current = opts.selectedEnv;
    branchesRef.current = opts.branches;
    selectedPRRef.current = opts.selectedPR;
    isCloneRepoRef.current = opts.isCloneRepo;
    envReadyRef.current = opts.envReady;
    onAzureValidRef.current = opts.onAzureValid;
    onAwsValidRef.current = opts.onAwsValid;
  });

  // ── State ─────────────────────────────────────────────────────────────────
  const [stages, setStages] = useState<Stage[]>([]);
  const stagesRef = useRef<Stage[]>([]);
  useLayoutEffect(() => {
    stagesRef.current = stages;
  });

  const [stageSummaries, setStageSummariesState] = useState<Record<string, PlanSummary>>({});
  const [hasPlan, setHasPlan] = useState(true);
  const [running, setRunning] = useState(false);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  const [lastTriggeredAt, setLastTriggeredAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [deployedEnv, setDeployedEnv] = useState<Record<string, string> | null>(null);
  const [statusUpdateStatus, setStatusUpdateStatus] = useState<CardStatus>("idle");
  const [statusFileRunId, setStatusFileRunId] = useState<string | null>(null);
  const lastFetchedEnvId = useRef<number | null>(null);

  // ── Mutual-recursion bridge ────────────────────────────────────────────────
  // loadPlanImpl calls startPollingImpl and vice-versa. Using a ref avoids
  // circular useCallback dependencies while ensuring each call sites gets the
  // freshest implementation (which closes over current state setters).
  const implRef = useRef<{
    loadPlanImpl: (ref: string, poll?: PollContext) => void;
    startPollingImpl: (ref: string, attempt: number, triggerTime: number, prevRunId: string | null) => void;
  }>({ loadPlanImpl: () => {}, startPollingImpl: () => {} });

  // ── startPollingImpl ──────────────────────────────────────────────────────
  const startPollingImpl = (ref: string, attempt: number, triggerTime: number, prevRunId: string | null) => {
    const delay = POLL_DELAYS[attempt] ?? POLL_DELAYS[POLL_DELAYS.length - 1];
    setRunning(true);
    setCountdown(delay);
    let remaining = delay;
    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        implRef.current.loadPlanImpl(ref, { attempt, triggerTime, prevRunId });
      }
    }, 1000);
  };

  // ── loadPlanImpl ──────────────────────────────────────────────────────────
  const loadPlanImpl = (ref: string, poll?: PollContext) => {
    const acc = accountRef.current;
    const repo = repoNameRef.current;
    const pipe = pipelineRef.current;
    if (!acc || !repo) return;

    setStagesLoading(true);

    fetchStatus(acc, repo, ref)
      .then((data) => {
        setRunning(false);
        setStagesLoading(false);

        if (!data) {
          setStages(pipe.stages.map(({ key }) => ({ stage: key, status: "pending" as const })));
          setHasPlan(false);
          setStatusUpdateStatus("idle");
          return;
        }

        const statusData = data as Record<string, unknown>;
        // updatedAt from the server is UNIX seconds; normalise to ms for all comparisons.
        const fileUpdatedAt = typeof statusData.updatedAt === "number" ? statusData.updatedAt * 1000 : null;
        const fetchedRunId = (statusData.runId as string | undefined) ?? (statusData.stages as Stage[] | undefined)?.[0]?.runId ?? null;
        const envId = typeof statusData.envId === "number" ? statusData.envId : null;
        if (fetchedRunId) setStatusFileRunId(fetchedRunId);

        // ── Staleness check (only during an active poll) ────────────────
        if (poll) {
          const stale = isPlanStale(poll.triggerTime, fileUpdatedAt, fetchedRunId, poll.prevRunId);
          if (stale) {
            const next = poll.attempt + 1;
            setRetryCount(next);
            if (next >= POLL_DELAYS.length) {
              setRunError("Workflow is taking too long. Please check GitHub Actions.");
            } else {
              implRef.current.startPollingImpl(ref, next, poll.triggerTime, poll.prevRunId);
            }
            // Fall through — still render whatever data we have
          } else {
            setLastTriggeredAt(null);
            setRetryCount(0);
          }
        }

        // Refresh the deployed env snapshot only when envId changes
        if (envId && acc && repo && envId !== lastFetchedEnvId.current) {
          lastFetchedEnvId.current = envId;
          getPlanEnv(acc, repo, envId).then(setDeployedEnv).catch(console.error);
        }

        if (fileUpdatedAt) setLastRunTime(fileUpdatedAt);

        const fetched = (statusData.stages as Stage[]) || [];
        const merged = pipe.stages.map(({ key }) => {
          const found = fetched.find((s: Stage) => s.stage === key);
          return found ?? { stage: key, status: "failed" as const };
        });
        setStages(merged);
        setHasPlan(true);

        // Notify caller about secret validity from the status file
        if (statusData.azure) onAzureValidRef.current?.((statusData.azure as { valid: boolean | null }).valid ?? null);
        if (statusData.aws) onAwsValidRef.current?.((statusData.aws as { valid: boolean | null }).valid ?? null);

        setStatusUpdateStatus("complete");
      })
      .catch((e) => {
        console.error("Failed to fetch status:", e);
        setRunning(false);
        setStagesLoading(false);
        setStages(pipe.stages.map(({ key }) => ({ stage: key, status: "pending" as const })));
        setHasPlan(false);
        setStatusUpdateStatus("idle");
      });
  };

  useLayoutEffect(() => {
    implRef.current.loadPlanImpl = loadPlanImpl;
    implRef.current.startPollingImpl = startPollingImpl;
  });

  // ── Env-driven lifecycle ──────────────────────────────────────────────────

  // Reset plan state whenever the selected environment changes.
  useEffect(() => {
    setRunning(false);
    setRunError(null);
    setCountdown(0);
    setLastRunTime(null);
    setLastRunId(null);
    setLastTriggeredAt(null);
    setRetryCount(0);
    setStages([]);
    setStageSummariesState({});
    setHasPlan(true);
    setStatusUpdateStatus("idle");
    setDeployedEnv(null);
    setStagesLoading(false);
    setStatusFileRunId(null);
    lastFetchedEnvId.current = null;
  }, [opts.selectedEnv?.id]);

  // Auto-load plan when env is confirmed (env selected + no branch mismatch).
  useEffect(() => {
    if (!opts.selectedEnv || opts.branchMatchError) return;
    const branch = branchesRef.current.find((b) => b.name.toLowerCase() === opts.selectedEnv!.name.toLowerCase());
    if (branch) implRef.current.loadPlanImpl(branch.name);
  }, [opts.selectedEnv?.id, opts.branchMatchError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API (stable callbacks) ─────────────────────────────────────────

  const loadPlan = useCallback((ref: string) => {
    implRef.current.loadPlanImpl(ref);
  }, []); // stable — calls impl via ref

  const triggerPlan = useCallback(async (params: TriggerPlanParams) => {
    const acc = accountRef.current;
    const repo = repoNameRef.current;
    if (!acc || !repo) return;

    setRunError(null);
    setStatusUpdateStatus("loading");

    const triggerTime = Date.now();
    // Snapshot prevRunId synchronously before the async trigger
    const prevRunId = stagesRef.current[0]?.runId ?? null;
    setLastTriggeredAt(triggerTime);
    setRetryCount(0);

    try {
      if (params.pr) {
        await triggerWorkflowFromPR(acc, repo, params.workflowId, params.envName, params.pr.head_sha);
        // Fetch the run ID asynchronously for the "view run" link
        fetchRuns(acc, repo, params.pr.head_sha)
          .then((runs) => {
            if (runs.length > 0) setLastRunId(runs[0].id);
          })
          .catch(console.error);
      } else {
        await triggerWorkflow(acc, repo, params.workflowId, params.envName, params.triggerRef);
      }
    } catch (e) {
      console.error("Failed to trigger workflow:", e);
      setStatusUpdateStatus("error");
      setRunError("Failed to trigger workflow");
      setLastTriggeredAt(null);
      return;
    }

    // Polling always uses the branch that matches the env name
    const matchedBranch = params.branches.find((b) => b.name.toLowerCase() === params.envName.toLowerCase());
    if (!matchedBranch) {
      console.error(`No branch found matching env "${params.envName}"`);
      return;
    }
    implRef.current.startPollingImpl(matchedBranch.name, 0, triggerTime, prevRunId);
  }, []); // stable — reads latest state via refs

  const deployStage = useCallback(async (params: DeployStageParams) => {
    const acc = accountRef.current;
    const repo = repoNameRef.current;
    if (!acc || !repo || !params.stage.runId) return;

    try {
      await deployChangeset(acc, repo, params.stage.runId, params.stageDef.label, params.envName, params.envName);
    } catch (e) {
      console.error("Failed to trigger deploy:", e);
      return;
    }

    const triggerTime = Date.now();
    const prevRunId = stagesRef.current[0]?.runId ?? null;
    setLastTriggeredAt(triggerTime);
    setRetryCount(0);

    const ref = params.pr
      ? params.pr.head_sha
      : (params.branches.find((b) => b.name.toLowerCase() === params.envName.toLowerCase())?.name ?? params.envName);
    implRef.current.startPollingImpl(ref, 0, triggerTime, prevRunId);
  }, []); // stable — reads latest state via refs

  const resetPlan = useCallback(() => {
    setRunning(false);
    setRunError(null);
    setCountdown(0);
    setLastRunTime(null);
    setLastRunId(null);
    setLastTriggeredAt(null);
    setRetryCount(0);
    setStages([]);
    setStageSummariesState({});
    setHasPlan(true);
    setStatusUpdateStatus("idle");
    setDeployedEnv(null);
    setStagesLoading(false);
  }, []);

  const onRun = useCallback(async () => {
    const env = selectedEnvRef.current;
    const pr = selectedPRRef.current;
    if (!isCloneRepoRef.current || !envReadyRef.current || !env) return;
    await triggerPlan({
      workflowId: pipelineRef.current.workflowId,
      envName: env.name,
      triggerRef: pr ? pr.head_sha : env.name,
      pr,
      branches: branchesRef.current,
    });
  }, [triggerPlan]); // triggerPlan is stable

  const setStageSummary = useCallback((key: string, summary: PlanSummary) => {
    setStageSummariesState((prev) => ({ ...prev, [key]: summary }));
  }, []);

  const setLastRunIdStable = useCallback((id: number | null) => setLastRunId(id), []);
  const setRunErrorStable = useCallback((err: string | null) => setRunError(err), []);

  return {
    stages,
    stageSummaries,
    hasPlan,
    running,
    stagesLoading,
    runError,
    countdown,
    lastRunTime,
    lastRunId,
    statusFileRunId,
    lastTriggeredAt,
    retryCount,
    deployedEnv,
    isStale: running || retryCount > 0,
    statusUpdateStatus,
    loadPlan,
    triggerPlan,
    deployStage,
    resetPlan,
    onRun,
    setStageSummary,
    setLastRunId: setLastRunIdStable,
    setRunError: setRunErrorStable,
  };
}
