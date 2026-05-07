// ─── Card ─────────────────────────────────────────────────────────────────────

export type CardId = "repo" | "branch" | "azure_secrets" | "aws_secrets" | "env" | "pr" | "status_update" | "stages";
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

// ─── Pull Request ─────────────────────────────────────────────────────────────

export type PullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
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

// ─── Env ──────────────────────────────────────────────────────────────────────

export type EnvEntry = { key: string; value: string };

export const REQUIRED_ENV_KEYS = ["NAME", "DNS", "SUBSCRIPTION_ID"];

// ─── Secrets ──────────────────────────────────────────────────────────────────

export type SecretsStatus = {
  configured: boolean | null;
  valid: boolean | null;
};

export const AZURE_SECRET_KEYS = ["AZURE_CLIENT_ID", "AZURE_SUBSCRIPTION_ID", "AZURE_TENANT_ID"];
export const AWS_SECRET_KEYS = ["AWS_ACCOUNT_ID", "AWS_ROLE_NAME"];
