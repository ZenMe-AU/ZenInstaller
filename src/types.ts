// ─── Card ─────────────────────────────────────────────────────────────────────

export type CardId = "repo" | "pr" | "env" | "azure_secrets" | "aws_secrets" | "status_update" | "stages";
export type CardStatus = "idle" | "loading" | "complete" | "warning" | "error";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type User = { login: string };

// ─── Account & Repo ───────────────────────────────────────────────────────────

export type Account = {
  login: string;
  type: "User" | "Organization";
  id: number;
  isInstalled: boolean;
};

export type Repo = {
  id: number;
  name: string;
};

export type RepoOption = {
  id: number | string;
  name: string;
  isNew?: boolean;
};

// ─── Branch ───────────────────────────────────────────────────────────────────

export type Branch = {
  name: string;
  commit: string;
  protected: boolean;
};

export type BranchOption = {
  name: string;
  isNew?: boolean;
};

// ─── GitHub Environment ───────────────────────────────────────────────────────

export type GhEnv = {
  name: string;
  id: number;
  url: string;
};

// Whitelist — only these env names (case-insensitive) are shown and selectable
export const VALID_ENV_NAMES = ["PROD", "TEST"] as const;

export function isValidEnvName(name: string): boolean {
  return VALID_ENV_NAMES.some((v) => v.toLowerCase() === name.toLowerCase());
}

// Match result when comparing a branch name to an env list
export type EnvMatchResult =
  | { status: "exact"; env: GhEnv }
  | { status: "case"; env: GhEnv }
  | { status: "multiple"; envs: GhEnv[] }
  | { status: "none" };

export function matchEnv(name: string, envList: GhEnv[]): EnvMatchResult {
  const filtered = envList.filter((e) => isValidEnvName(e.name));
  const matches = filtered.filter((e) => e.name.toLowerCase() === name.toLowerCase());
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "multiple", envs: matches };
  const match = matches[0];
  if (match.name === name) return { status: "exact", env: match };
  return { status: "case", env: match };
}

// Match an env against the branch list
export type BranchMatchResult =
  | { status: "exact"; branch: Branch }
  | { status: "case"; branch: Branch }
  | { status: "multiple"; branches: Branch[] }
  | { status: "none" };

export function matchBranch(envName: string, branches: Branch[]): BranchMatchResult {
  const matches = branches.filter((b) => b.name.toLowerCase() === envName.toLowerCase());
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "multiple", branches: matches };
  const match = matches[0];
  if (match.name === envName) return { status: "exact", branch: match };
  return { status: "case", branch: match };
}

// ─── Pull Request ─────────────────────────────────────────────────────────────

export type PullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  base_branch: string;
  head_sha: string;
};

// ─── Workflow Run ─────────────────────────────────────────────────────────────

export type WorkflowRun = {
  id: number;
  head_sha: string;
  workflow_id: string;
  created_at: string;
  actor: string;
};

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export type PrerequisiteCard = { type: "card"; cardId: CardId };
export type PrerequisiteEnv = { type: "env"; key: string };
export type Prerequisite = PrerequisiteCard | PrerequisiteEnv;

export type StageDefinition = {
  key: string;
  label: string;
  prerequisites: Prerequisite[];
};

export type PipelineConfig = {
  workflowId: string;
  label: string;
  templateRepo: string;
  stages: StageDefinition[];
};

// ─── Stage ────────────────────────────────────────────────────────────────────

export type StageStatus = "deployed" | "success" | "failed" | "pending";

export type Stage = {
  stage: string;
  status: StageStatus;
  planPath?: string;
  planJsonId?: string;
  planJsonUrl?: string;
  runId?: string;
};

export const STAGE_STATUS_CONFIG: Record<StageStatus, { color: string; label: string }> = {
  deployed: { color: "#22c55e", label: "Deployed" },
  success: { color: "#f97316", label: "Ready to deploy" },
  failed: { color: "#ef4444", label: "Failed" },
  pending: { color: "#94a3b8", label: "Not yet executed" },
};

// ─── Secrets ──────────────────────────────────────────────────────────────────

export type SecretsStatus = {
  configured: boolean | null;
  valid: boolean | null;
};

export type UpsertSecretResult = {
  success: boolean;
  name: string;
  env: string;
};

export const AZURE_SECRET_KEYS = ["AZURE_CLIENT_ID", "AZURE_SUBSCRIPTION_ID", "AZURE_TENANT_ID"];
export const AWS_SECRET_KEYS = ["AWS_ACCOUNT_ID", "AWS_ROLE_NAME"];
export const GITHUB_VARIABLE_KEYS = ["NAME", "DNS"] as const;

// ─── Pending secrets / upsert ─────────────────────────────────────────────────

export type PendingSecret = { key: string; value: string };
export type UpsertStatus = { key: string; status: "success" | "error"; error?: string };

// ─── Plan view ────────────────────────────────────────────────────────────────

export type PlanItem = {
  address: string;
  change: {
    actions: string[];
  };
};

export type ActionType = "create" | "delete" | "update" | "replace" | "noOp" | "unknown";
