import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { deployChangeset, fetchStatus, getPlanEnv, triggerWorkflow } from "../api";
import { isPlanStale } from "../logic/stage";
import type { Account, Branch, CardStatus, GhEnv, PipelineConfig, PlanSummary, Stage } from "../types";

interface PollContext {
  attempt: number;
  triggerTime: number;
  prevRunId: string | null;
}

export interface UseDeploymentPlan {
  stages: Stage[];
  stageSummaries: Record<string, PlanSummary>;
  hasPlan: boolean;
  running: boolean;
  stagesLoading: boolean;
  runError: string | null;
  countdown: number;
  lastTriggeredAt: number | null;
  retryCount: number;
  deployedEnv: Record<string, string> | null;
  isStale: boolean;
  statusUpdateStatus: CardStatus;
  statusFileRunId: string | null;
  // Both take just the stage key: the hook already holds the pipeline, the stages, the selected
  // env and the branches, so handing them back in would be a second source for the same value.
  onRun: (stageKey: string) => Promise<void>; // One card, one stage — never the whole pipeline.
  deployStage: (stageKey: string) => Promise<void>;
  setStageSummary: (key: string, summary: PlanSummary) => void;
}

const POLL_DELAYS = [150, 180, 200, 300];

export function useDeploymentPlan(opts: {
  account: Account | null;
  repoName: string | null;
  pipeline: PipelineConfig;
  selectedEnv: GhEnv | null;
  branches: Branch[];
  branchMatchError: string | null;
  envReady: boolean;
}): UseDeploymentPlan {
  const accountRef = useRef(opts.account);
  const repoNameRef = useRef(opts.repoName);
  const pipelineRef = useRef(opts.pipeline);
  const selectedEnvRef = useRef(opts.selectedEnv);
  const branchesRef = useRef(opts.branches);
  const envReadyRef = useRef(opts.envReady);
  useLayoutEffect(() => {
    accountRef.current = opts.account;
    repoNameRef.current = opts.repoName;
    pipelineRef.current = opts.pipeline;
    selectedEnvRef.current = opts.selectedEnv;
    branchesRef.current = opts.branches;
    envReadyRef.current = opts.envReady;
  });

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
  const [lastTriggeredAt, setLastTriggeredAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [deployedEnv, setDeployedEnv] = useState<Record<string, string> | null>(null);
  const [statusUpdateStatus, setStatusUpdateStatus] = useState<CardStatus>("idle");
  const [statusFileRunId, setStatusFileRunId] = useState<string | null>(null);
  const lastFetchedEnvId = useRef<number | null>(null);

  const implRef = useRef<{
    loadPlanImpl: (ref: string, poll?: PollContext) => void;
    startPollingImpl: (ref: string, attempt: number, triggerTime: number, prevRunId: string | null) => void;
  }>({ loadPlanImpl: () => {}, startPollingImpl: () => {} });

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
        const fileUpdatedAt = typeof statusData.updatedAt === "number" ? statusData.updatedAt * 1000 : null;
        const fetchedRunId =
          (statusData.runId as string | undefined) ?? (statusData.stages as Stage[] | undefined)?.[0]?.runId ?? null;
        const envId = typeof statusData.envId === "number" ? statusData.envId : null;
        if (fetchedRunId) setStatusFileRunId(fetchedRunId);

        if (poll) {
          const stale = isPlanStale(poll.triggerTime, fileUpdatedAt, fetchedRunId, poll.prevRunId);
          if (stale) {
            const next = poll.attempt + 1;
            setRetryCount(next);
            if (next >= POLL_DELAYS.length) setRunError("Workflow is taking too long. Please check GitHub Actions.");
            else implRef.current.startPollingImpl(ref, next, poll.triggerTime, poll.prevRunId);
          } else {
            setLastTriggeredAt(null);
            setRetryCount(0);
          }
        }

        if (envId && envId !== lastFetchedEnvId.current) {
          lastFetchedEnvId.current = envId;
          getPlanEnv(acc, repo, envId).then(setDeployedEnv).catch(console.error);
        }

        const fetched = (statusData.stages as Stage[]) || [];
        setStages(
          pipe.stages.map(({ key }) => {
            const found = fetched.find((s) => s.stage === key);
            return found ?? { stage: key, status: "failed" as const };
          }),
        );
        setHasPlan(true);
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

  useEffect(() => {
    setRunning(false);
    setRunError(null);
    setCountdown(0);
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

  useEffect(() => {
    if (!opts.selectedEnv || opts.branchMatchError) return;
    const branch = branchesRef.current.find((b) => b.name.toLowerCase() === opts.selectedEnv!.name.toLowerCase());
    if (branch) implRef.current.loadPlanImpl(branch.name);
  }, [opts.selectedEnv?.id, opts.branchMatchError]);

  const onRun = useCallback(async (stageKey: string) => {
    const acc = accountRef.current;
    const repo = repoNameRef.current;
    const env = selectedEnvRef.current;
    const stage = pipelineRef.current.stages.find((s) => s.key === stageKey);
    if (!acc || !repo || !envReadyRef.current || !env || !stage) return;
    setRunError(null);
    setStatusUpdateStatus("loading");
    const triggerTime = Date.now();
    const prevRunId = stagesRef.current[0]?.runId ?? null;
    setLastTriggeredAt(triggerTime);
    setRetryCount(0);

    try {
      await triggerWorkflow(acc, repo, stage.workflowId, env.name, env.name);
    } catch (e) {
      console.error("Failed to trigger workflow:", e);
      setStatusUpdateStatus("error");
      setRunError("Failed to trigger workflow");
      setLastTriggeredAt(null);
      return;
    }

    const matchedBranch = branchesRef.current.find((b) => b.name.toLowerCase() === env.name.toLowerCase());
    if (!matchedBranch) {
      setRunError(`No branch found matching env "${env.name}"`);
      return;
    }
    implRef.current.startPollingImpl(matchedBranch.name, 0, triggerTime, prevRunId);
  }, []);

  const deployStage = useCallback(async (stageKey: string) => {
    const acc = accountRef.current;
    const repo = repoNameRef.current;
    const env = selectedEnvRef.current;
    const stageDef = pipelineRef.current.stages.find((s) => s.key === stageKey);
    const stage = stagesRef.current.find((s) => s.stage === stageKey);
    if (!acc || !repo || !env || !stageDef || !stage?.runId) return;

    try {
      await deployChangeset(
        acc,
        repo,
        stage.runId,
        pipelineRef.current.deployWorkflowId,
        stageDef.label,
        env.name,
        env.name,
      );
    } catch (e) {
      console.error("Failed to trigger deploy:", e);
      return;
    }

    const triggerTime = Date.now();
    const prevRunId = stagesRef.current[0]?.runId ?? null;
    setLastTriggeredAt(triggerTime);
    setRetryCount(0);
    // Same branch lookup onRun does, from the same ref. onRun treats no match as an error while
    // this falls back to the env name — left as it was rather than changed in passing.
    const ref = branchesRef.current.find((b) => b.name.toLowerCase() === env.name.toLowerCase())?.name ?? env.name;
    implRef.current.startPollingImpl(ref, 0, triggerTime, prevRunId);
  }, []);

  const setStageSummary = useCallback((key: string, summary: PlanSummary) => {
    setStageSummariesState((prev) => ({ ...prev, [key]: summary }));
  }, []);

  return {
    stages,
    stageSummaries,
    hasPlan,
    running,
    stagesLoading,
    runError,
    countdown,
    lastTriggeredAt,
    retryCount,
    deployedEnv,
    isStale: running || lastTriggeredAt !== null || retryCount > 0,
    statusUpdateStatus,
    statusFileRunId,
    onRun,
    deployStage,
    setStageSummary,
  };
}
