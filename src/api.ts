import { parse } from "dotenv";
import JSZip from "jszip";
import type { Account, Branch, GhEnv, PullRequest, Repo, WorkflowRun, UpsertSecretResult } from "./types";

const url = import.meta.env.VITE_API_URL;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function verifyAuth(): Promise<{ login: string }> {
  const res = await fetch(`${url}/getUser`, { credentials: "include" });
  if (!res.ok) throw new Error("Unauthorized");
  const data = await res.json();
  return data.user;
}

// ─── Orgs & Repos ─────────────────────────────────────────────────────────────

export async function fetchOrgList(): Promise<Account[]> {
  const [userRes, orgsRes] = await Promise.all([
    fetch(`${url}/getUser`, { credentials: "include" }),
    fetch(`${url}/getOrgs`, { credentials: "include" }),
  ]);
  if (!userRes.ok) throw new Error(`Failed to fetch user: ${userRes.status}`);
  if (!orgsRes.ok) throw new Error(`Failed to fetch orgs: ${orgsRes.status}`);
  const [userData, orgsData] = await Promise.all([userRes.json(), orgsRes.json()]);
  return [
    { login: userData.user.login, type: "User", id: userData.user.id },
    ...orgsData.orgList.map((o: { login: string; id: number }) => ({ login: o.login, type: "Organization" as const, id: o.id })),
  ];
}

export async function fetchRepos(account: Account): Promise<Repo[]> {
  const params = new URLSearchParams({ owner: account.login, type: account.type });
  const res = await fetch(`${url}/getRepos?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch repos: ${res.status}`);
  const data = await res.json();
  return data.repoList || [];
}

// ─── Template ─────────────────────────────────────────────────────────────────

export async function checkTemplate(account: Account, repo: string): Promise<{ isTemplate: boolean; templateName: string }> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/checkTemplate?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to check template: ${res.status}`);
  return res.json();
}

// ─── Repo generation ──────────────────────────────────────────────────────────

export async function generateRepo(
  account: Account,
  targetName: string,
  isPrivate: boolean,
  includeAllBranch: boolean,
  createEnvs: boolean,
): Promise<{ repo: Repo; envSuccess: boolean; results: { envs: { name: string; success: boolean; error?: string }[] } }> {
  const res = await fetch(`${url}/generateRepo`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({
      includeAllBranch,
      isPrivate,
      createEnvs,
      owner: account.login,
      type: account.type,
      repo: targetName,
    }),
  });
  if (!res.ok) throw new Error(`Failed to clone repo: ${res.status}`);
  const data = await res.json();
  return { repo: data.data, envSuccess: data.envSuccess, results: data.results };
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function fetchBranches(account: Account, repo: string): Promise<Branch[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getBranches?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch branches: ${res.status}`);
  const data = await res.json();
  return data.branches || [];
}

export async function createBranch(account: Account, repo: string, branchName: string, sourceBranch: string): Promise<Branch> {
  const res = await fetch(`${url}/createBranch`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ owner: account.login, type: account.type, repo, branch: branchName, source: sourceBranch }),
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${res.status}`);
  const data = await res.json();
  return data.branch;
}

// ─── Pull Requests ────────────────────────────────────────────────────────────

export async function fetchPullRequests(account: Account, repo: string): Promise<PullRequest[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getPullRequests?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch pull requests: ${res.status}`);
  const data = await res.json();
  return data.pullRequests || [];
}

// ─── Workflow Runs ────────────────────────────────────────────────────────────

export async function fetchRuns(account: Account, repo: string, headSha: string): Promise<WorkflowRun[]> {
  // TODO: confirm endpoint name with backend
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, head_sha: headSha });
  const res = await fetch(`${url}/getRuns?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.status}`);
  const data = await res.json();
  return data.runs || [];
}

// ─── GitHub Environments ──────────────────────────────────────────────────────

export async function fetchEnvs(account: Account, repo: string): Promise<GhEnv[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getEnvs?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch envs: ${res.status}`);
  const data = await res.json();
  return data.envList || [];
}

// ─── Secrets ──────────────────────────────────────────────────────────────────

export async function fetchSecrets(account: Account, repo: string, envName: string): Promise<string[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, env: envName });
  const res = await fetch(`${url}/getSecrets?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch secrets: ${res.status}`);
  const data = await res.json();
  return (data.secrets || []) as string[];
}

export async function fetchPublicKey(account: Account, repo: string, envName?: string): Promise<{ key: string; keyId: string }> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  if (envName) params.set("env", envName);
  const res = await fetch(`${url}/getPublicKey?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch public key: ${res.status}`);
  const data = await res.json();
  return { key: data.key, keyId: data.keyId };
}

export async function upsertSecret(
  account: Account,
  repo: string,
  name: string,
  encryptedValue: string,
  keyId: string,
  envName?: string,
): Promise<UpsertSecretResult> {
  const res = await fetch(`${url}/upsertSecret`, {
    credentials: "include",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: account.login,
      repo,
      type: account.type,
      name,
      value: encryptedValue,
      keyId,
      ...(envName ? { env: envName } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Failed to upsert secret "${name}": ${res.status}`);
  return res.json();
}

// ─── Variables ────────────────────────────────────────────────────────────────

export async function fetchVariables(account: Account, repo: string, envName: string): Promise<Record<string, string>> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, env: envName });
  const res = await fetch(`${url}/getVariables?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch variables: ${res.status}`);
  const data = await res.json();
  return data.variables || {};
}

export async function createVariable(account: Account, repo: string, name: string, value: string, envName: string): Promise<void> {
  const res = await fetch(`${url}/createVariable`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: account.login, repo, name, value, env: envName }),
  });
  if (!res.ok) throw new Error(`Failed to create variable "${name}": ${res.status}`);
}

export async function updateVariable(account: Account, repo: string, name: string, value: string, envName: string): Promise<void> {
  const res = await fetch(`${url}/updateVariable`, {
    credentials: "include",
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: account.login, repo, name, value, env: envName }),
  });
  if (!res.ok) throw new Error(`Failed to update variable "${name}": ${res.status}`);
}

// ─── Status file ──────────────────────────────────────────────────────────────

export async function fetchStatus(account: Account, repo: string) {
  const params = new URLSearchParams({
    path: "corpSetup/deploymentChangeset.json",
    owner: account.login,
    repo,
    type: account.type,
  });
  const res = await fetch(`${url}/getContents?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.content);
}

// ─── Env ──────────────────────────────────────────────────────────────────────

export async function fetchEnv(account: Account, repo: string): Promise<Record<string, string>> {
  const params = new URLSearchParams({ path: "corpSetup/corp.env", owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getContents?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch env: ${res.status}`);
  const data = await res.json();
  return parse(data.content);
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function triggerWorkflow(account: Account, repo: string, workflowId: string, env: Record<string, string>, ref: string) {
  const res = await fetch(`${url}/triggerActions`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ env: JSON.stringify(env), repo, owner: account.login, type: account.type, workflow_id: workflowId, ref }),
  });
  if (!res.ok) throw new Error(`Failed to trigger workflow: ${res.status}`);
  return res.json();
}

export async function triggerWorkflowFromPR(account: Account, repo: string, workflowId: string, env: Record<string, string>, commitSha: string) {
  // Currently uses the same endpoint — replace URI here when splitting
  const res = await fetch(`${url}/triggerActions`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ env: JSON.stringify(env), repo, owner: account.login, type: account.type, workflow_id: workflowId, ref: commitSha }),
  });
  if (!res.ok) throw new Error(`Failed to trigger workflow from PR: ${res.status}`);
  return res.json();
}

// ─── Plan (artifact) ──────────────────────────────────────────────────────────

export async function fetchPlan(id: string, account: { login: string; type: string }, repo: string) {
  const params = new URLSearchParams({ artifacts_id: id, owner: account.login, type: account.type, repo, ref: "dev" });
  const res = await fetch(`${url}/downloadArtifacts?${params.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch plan for ${id}`);
  const data = await res.json();
  const zip = await JSZip.loadAsync(data.content as string, { base64: true });
  const fileName = Object.keys(zip.files).find((f) => f.endsWith(".json"));
  if (!fileName) throw new Error("No JSON file found in artifact zip");
  const content = await zip.file(fileName)!.async("string");
  return JSON.parse(content);
}
