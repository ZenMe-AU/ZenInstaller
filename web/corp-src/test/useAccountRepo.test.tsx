import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAccountRepo, type UseAccountRepo } from "../hooks/useAccountRepo";
import type { Account, PendingRestore } from "../types";

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    fetchOrgList: vi.fn(),
    fetchRepos: vi.fn(),
    checkTemplate: vi.fn(),
    fetchBranches: vi.fn(),
    generateRepo: vi.fn(),
    createBranch: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  default: {
    fetchOrgList: mockApi.fetchOrgList,
    fetchRepos: mockApi.fetchRepos,
    checkTemplate: mockApi.checkTemplate,
    fetchBranches: mockApi.fetchBranches,
    generateRepo: mockApi.generateRepo,
    createBranch: mockApi.createBranch,
  },
  fetchOrgList: mockApi.fetchOrgList,
  fetchRepos: mockApi.fetchRepos,
  checkTemplate: mockApi.checkTemplate,
  fetchBranches: mockApi.fetchBranches,
  generateRepo: mockApi.generateRepo,
  createBranch: mockApi.createBranch,
}));

function HookHarness(props: {
  opts: Parameters<typeof useAccountRepo>[0];
  onUpdate: (value: UseAccountRepo) => void;
}) {
  const value = useAccountRepo(props.opts);

  useEffect(() => {
    props.onUpdate(value);
  }, [value, props]);

  return null;
}

async function waitFor(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

function makePendingRestore(partial?: Partial<PendingRestore>): React.MutableRefObject<PendingRestore> {
  return {
    current: {
      account: null,
      repo: null,
      pr: null,
      env: null,
      ...partial,
    },
  };
}

describe("useAccountRepo", () => {
  const accountOne: Account = { login: "org-one", type: "Organization", id: 101 };
  const accountTwo: Account = { login: "org-two", type: "Organization", id: 102 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.fetchOrgList.mockResolvedValue([accountOne, accountTwo]);
    mockApi.fetchRepos.mockImplementation(async (account: Account) => {
      if (account.login === "org-two") return [{ id: 2, name: "repo-b" }];
      return [{ id: 1, name: "repo-a" }];
    });
    mockApi.checkTemplate.mockResolvedValue({ templateName: "" });
    mockApi.fetchBranches.mockResolvedValue([]);
    mockApi.generateRepo.mockResolvedValue({
      repo: { id: 33, name: "new-repo" },
      envSuccess: true,
      results: { envs: [] },
    });
    mockApi.createBranch.mockResolvedValue({ name: "feature/test", commit: "abc", protected: false });
  });

  it("loads accounts and selects the first account by default", async () => {
    let latest: UseAccountRepo | null = null;
    const container = document.createElement("div");
    const root = createRoot(container);

    const opts: Parameters<typeof useAccountRepo>[0] = {
      user: { login: "jake" },
      pendingRestore: makePendingRestore(),
      urlAccountApplied: { current: false },
      addRestoreWarning: vi.fn(),
      checkRestoreDone: vi.fn(),
    };

    await act(async () => {
      root.render(<HookHarness opts={opts} onUpdate={(v) => { latest = v; }} />);
    });

    await waitFor(() => {
      expect(latest?.selectedAccount?.login).toBe("org-one");
      expect(latest?.accounts).toHaveLength(2);
    });

    await waitFor(() => {
      expect(mockApi.fetchRepos).toHaveBeenCalledWith(accountOne);
      expect(latest?.repos.map((r) => r.name)).toEqual(["repo-a"]);
    });

    root.unmount();
  });

  it("restores account and repo from pending URL state", async () => {
    let latest: UseAccountRepo | null = null;
    const container = document.createElement("div");
    const root = createRoot(container);

    const pendingRestore = makePendingRestore({
      account: "org-two",
      repo: "repo-b",
      pr: "12",
      env: "PROD",
    });
    const checkRestoreDone = vi.fn();

    const opts: Parameters<typeof useAccountRepo>[0] = {
      user: { login: "jake" },
      pendingRestore,
      urlAccountApplied: { current: false },
      addRestoreWarning: vi.fn(),
      checkRestoreDone,
    };

    await act(async () => {
      root.render(<HookHarness opts={opts} onUpdate={(v) => { latest = v; }} />);
    });

    await waitFor(() => {
      expect(latest?.selectedAccount?.login).toBe("org-two");
      expect(latest?.selectedRepo?.name).toBe("repo-b");
    });

    expect(pendingRestore.current.account).toBeNull();
    expect(pendingRestore.current.repo).toBeNull();
    expect(checkRestoreDone).toHaveBeenCalled();
    expect(mockApi.fetchRepos).toHaveBeenCalledWith(accountTwo);

    root.unmount();
  });

  it("prevents cloning when the target repository already exists", async () => {
    let latest: UseAccountRepo | null = null;
    const container = document.createElement("div");
    const root = createRoot(container);

    const opts: Parameters<typeof useAccountRepo>[0] = {
      user: { login: "jake" },
      pendingRestore: makePendingRestore(),
      urlAccountApplied: { current: false },
      addRestoreWarning: vi.fn(),
      checkRestoreDone: vi.fn(),
    };

    await act(async () => {
      root.render(<HookHarness opts={opts} onUpdate={(v) => { latest = v; }} />);
    });

    await waitFor(() => {
      expect(latest?.repos.some((r) => r.name === "repo-a")).toBe(true);
    });

    await act(async () => {
      latest?.setSelectedRepo({ id: "repo-a", name: "repo-a", isNew: true });
    });

    await waitFor(() => {
      expect(latest?.selectedRepo?.name).toBe("repo-a");
    });

    await act(async () => {
      await latest?.onClone();
    });

    expect(latest?.cloneError).toBe('Repository "repo-a" already exists');
    expect(mockApi.generateRepo).not.toHaveBeenCalled();

    root.unmount();
  });
});