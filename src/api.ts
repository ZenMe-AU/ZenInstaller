import { parse } from "dotenv";
import type { Account, Branch, EnvEntry, PullRequest, Repo } from "./types";

const url = import.meta.env.VITE_API_URL;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function verifyAuth(): Promise<{ login: string }> {
  const res = await fetch(`${url}/getOrgs`, { credentials: "include" }); // TODO: use getOrg endpoint to verify auth
  if (!res.ok) throw new Error("Unauthorized");
  const data = await res.json();
  return data.user;
}

// ─── Orgs & Repos ─────────────────────────────────────────────────────────────

export async function fetchOrgList(): Promise<Account[]> {
  const res = await fetch(`${url}/getOrgs`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch orgs: ${res.status}`);
  const data = await res.json();
  return [
    { login: data.user.login, type: "User", id: data.user.id, isInstalled: data.user.isInstalled },
    ...data.orgList.map((o: any) => ({ login: o.login, type: "Organization", id: o.id, isInstalled: o.isInstalled })),
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

export async function generateRepo(account: Account, targetName: string, isPrivate: boolean, includeAllBranch: boolean): Promise<Repo> {
  const res = await fetch(`${url}/generateRepo`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ includeAllBranch, isPrivate, owner: account.login, type: account.type, repo: targetName }),
  });
  if (!res.ok) throw new Error(`Failed to clone repo: ${res.status}`);
  const data = await res.json();
  return data.data;
}

// ─── Secrets ──────────────────────────────────────────────────────────────────

export async function fetchSecrets(account: Account, repo: string): Promise<string[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getSecrets?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch secrets: ${res.status}`);
  const data = await res.json();
  return (data.secrets || []) as string[];
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

export async function saveEnv(account: Account, repo: string, entries: EnvEntry[]): Promise<void> {
  const env = Object.fromEntries(entries.map((e) => [e.key, e.value]));
  // TODO: implement PUT to repo
  console.log("Saving env", env);
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function triggerWorkflow(account: Account, repo: string, workflowId: string, env: Record<string, string>) {
  const res = await fetch(`${url}/triggerActions`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ env: JSON.stringify(env), repo, owner: account.login, type: account.type, workflow_id: workflowId }),
  });
  if (!res.ok) throw new Error(`Failed to trigger workflow: ${res.status}`);
  return res.json();
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

export async function fetchPullRequests(account: Account, repo: string, branch: string): Promise<PullRequest[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, ref: branch });
  const res = await fetch(`${url}/getPullRequests?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch pull requests: ${res.status}`);
  const data = await res.json();
  return data.pullRequests || [];
}

// ─── Trigger from PR ──────────────────────────────────────────────────────────

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
