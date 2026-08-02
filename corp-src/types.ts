import type { AccountInfo } from "@azure/msal-browser";

// ─── Card ─────────────────────────────────────────────────────────────────────

export type CardId =
  | "github_login"
  | "azure_login"
  | "repo"
  | "azure_subscription"
  | "company_info"
  | "azure_app_registration"
  | "core_infra"
  | "create_domain";
export type CardStatus = "idle" | "loading" | "complete" | "warning" | "error" | "skipped";

export type CardRequirements = CardId[]; //["github_login","repo"]

// A missing prerequisite, plus the card that resolves it (so it can be clicked to jump there).
export type Requirement = { label: string; target: CardId };

// Everything App derives for a card's frame — exactly what cardProps() returns and Card renders.
export type CardChrome = {
  cardId: CardId;
  status: CardStatus;
  summary?: string;
  locked: boolean;
  requirements: Requirement[];
  unavailable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRequirementClick: (id: CardId) => void;
};

// Every card-backing hook self-reports its own completion via `done`, plus the face
// App renders for it (status icon + collapsed summary), so other cards can query it and
// App never has to re-derive per-card state itself.
export interface CardHook {
  readonly cardId: CardId;
  done: boolean;
  status: CardStatus;
  summary?: string;
  cardRequirements?: CardRequirements;
  cardDependencyLabel?: string;
}

// ─── Composable hook shapes ───────────────────────────────────────────────────
export interface LoginHook<TAccount> {
  account: TAccount | null;
  loggingIn: boolean;
  login: () => void;
  logout: () => void;
}

export interface ResettableHook {
  reset: () => void;
}

export interface AzureConfigHook extends ResettableHook {
  steps: SetupStep[];
  running: boolean;
  run: () => Promise<void>;
}

export interface AzureTarget {
  azureAccount: AccountInfo | null;
  subscriptionId: string;
  tenantId?: string; // MSA (personal) accounts sign in via the consumer tenant, so the real AAD tenant is passed explicitly.
}
export interface AzureSpTarget extends AzureTarget {
  spClientId: string; // Client id of the GitHub Actions app registration (AZURE_CLIENT_ID variable).
}

export type SetupStep = { id: string; label: string; status: "pending" | "running" | "done" | "skipped" | "error"; detail?: string };

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type User = { login: string };

// ─── Account & Repo ───────────────────────────────────────────────────────────

export type Account = {
  login: string;
  type: "User" | "Organization";
  id: number;
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

// ─── URL Restore ─────────────────────────────────────────────────────────────

// Shared across hooks that participate in URL-parameter restoration.
export type PendingRestore = {
  account: string | null;
  repo: string | null;
  pr: string | null;
  env: string | null;
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
export type PrerequisiteVar = { type: "var"; key: string };
export type PrerequisiteVarGroup = { type: "varGroup"; keys: readonly string[]; label: string };
// Stage-local editable variables — checked like varGroup but also rendered as inline edit fields inside the stage card
export type PrerequisiteStageVar = {
  type: "stageVar";
  keys: readonly string[];
  label: string;
  descriptions?: Partial<Record<string, string>>; // Optional per-key hint shown below the input field
};
export type Prerequisite = PrerequisiteCard | PrerequisiteVar | PrerequisiteVarGroup | PrerequisiteStageVar;

export type StageDefinition = {
  key: string;
  label: string;
  prerequisites: Prerequisite[];
  optional?: boolean; // When true, a pending stage is treated as skipped rather than waiting.
  azurePermissions?: readonly string[]; // Microsoft Graph application permission IDs required by this stage.
};

export type PipelineConfig = {
  workflowId: string;
  label: string;
  templateRepo: string;
  validEnvs: readonly string[];
  stages: StageDefinition[];
};

// ─── Stage ────────────────────────────────────────────────────────────────────

export type StageStatus = "deployed" | "success" | "failed" | "pending" | "skipped";

export type Stage = {
  stage: string;
  status: StageStatus;
  planPath?: string;
  planJsonId?: string;
  planJsonUrl?: string;
  runId?: string;
  deployPlanRunId?: string;
  deployStatus?: string;
  deployRunId?: string;
  deployedAt?: number;
  deployLogId?: number;
  deployLogUrl?: string;
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

// ─── Pending secrets / upsert ─────────────────────────────────────────────────

export type PendingSecret = { key: string; value: string };
export type UpsertStatus = { key: string; status: "success" | "error"; error?: string };

// ─── Plan view ────────────────────────────────────────────────────────────────

export type PlanSummary = { create: number; update: number; delete: number; replace: number };

export type PlanItem = {
  address: string;
  change: {
    actions: string[];
  };
};

export type ActionType = "create" | "delete" | "update" | "replace" | "noOp" | "unknown";
