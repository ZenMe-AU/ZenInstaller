import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useGithubVariables } from "../hooks/useGithubVariables";
import type { UseGithubVariables } from "../hooks/useGithubVariables";
import type { Account } from "../types";

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    fetchVariables: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  fetchVariables: mockApi.fetchVariables,
}));

function HookHarness(props: {
  params: Parameters<typeof useGithubVariables>[0];
  onUpdate: (value: UseGithubVariables) => void;
}) {
  const value = useGithubVariables(props.params);

  useEffect(() => {
    props.onUpdate(value);
  }, [value, props]);

  return null;
}

async function waitFor(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now();
  while (true) {
    let passed = false;
    let lastError: unknown;

    await act(async () => {
      try {
        assertion();
        passed = true;
      } catch (error) {
        lastError = error;
      }
    });

    if (passed) return;
    if (Date.now() - start > timeoutMs) throw lastError;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function renderHook(params: Parameters<typeof useGithubVariables>[0]) {
  let latest: UseGithubVariables | null = null;
  const container = document.createElement("div");
  const root = createRoot(container);

  function rerender(nextParams: Parameters<typeof useGithubVariables>[0]) {
    act(() => {
      root.render(
        <HookHarness
          params={nextParams}
          onUpdate={(v) => {
            latest = v;
          }}
        />,
      );
    });
  }

  rerender(params);

  return {
    get current(): UseGithubVariables {
      if (!latest) throw new Error("Hook result not ready");
      return latest;
    },
    rerender,
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useGithubVariables", () => {
  const account: Account = { login: "org-one", type: "Organization", id: 101 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.fetchVariables.mockResolvedValue({ NAME: "Zenblox" });
  });

  it("does not fetch when account, repoName, or envName is missing", async () => {
    const harness = renderHook({ account: null, repoName: null, envName: null });

    await waitFor(() => expect(harness.current.loading).toBe(false));

    expect(mockApi.fetchVariables).not.toHaveBeenCalled();
    expect(harness.current.values).toEqual({});
    expect(harness.current.error).toBe(false);

    harness.unmount();
  });

  it("loads variables once account, repoName, and envName are all present", async () => {
    const harness = renderHook({ account, repoName: "repo-a", envName: "PROD" });

    await waitFor(() => expect(harness.current.loading).toBe(false));

    expect(mockApi.fetchVariables).toHaveBeenCalledWith(account, "repo-a", "PROD");
    expect(harness.current.values).toEqual({ NAME: "Zenblox" });
    expect(harness.current.error).toBe(false);

    harness.unmount();
  });

  it("surfaces an error and resets to empty values when fetching fails", async () => {
    mockApi.fetchVariables.mockRejectedValue(new Error("network error"));
    const harness = renderHook({ account, repoName: "repo-a", envName: "PROD" });

    await waitFor(() => expect(harness.current.loading).toBe(false));

    expect(harness.current.error).toBe(true);
    expect(harness.current.values).toEqual({});

    harness.unmount();
  });

  it("reloads and clears stale values when the target account/repo/env changes", async () => {
    const harness = renderHook({ account, repoName: "repo-a", envName: "PROD" });
    await waitFor(() => expect(harness.current.loading).toBe(false));
    expect(harness.current.values).toEqual({ NAME: "Zenblox" });

    mockApi.fetchVariables.mockResolvedValue({ NAME: "Other" });
    harness.rerender({ account, repoName: "repo-b", envName: "PROD" });

    await waitFor(() => expect(harness.current.loading).toBe(false));

    expect(mockApi.fetchVariables).toHaveBeenLastCalledWith(account, "repo-b", "PROD");
    expect(harness.current.values).toEqual({ NAME: "Other" });

    harness.unmount();
  });

  it("re-fetches variables via onRefresh, toggling refreshing state", async () => {
    const harness = renderHook({ account, repoName: "repo-a", envName: "PROD" });
    await waitFor(() => expect(harness.current.loading).toBe(false));

    mockApi.fetchVariables.mockResolvedValue({ NAME: "Refreshed" });

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = harness.current.onRefresh();
    });
    await act(async () => {
      await refreshPromise;
    });

    expect(harness.current.refreshing).toBe(false);
    expect(harness.current.values).toEqual({ NAME: "Refreshed" });

    harness.unmount();
  });

  it("sets error when onRefresh fails", async () => {
    const harness = renderHook({ account, repoName: "repo-a", envName: "PROD" });
    await waitFor(() => expect(harness.current.loading).toBe(false));

    mockApi.fetchVariables.mockRejectedValue(new Error("refresh failed"));

    await act(async () => {
      await harness.current.onRefresh();
    });

    expect(harness.current.error).toBe(true);

    harness.unmount();
  });

  it("does nothing on onRefresh when account, repoName, or envName is missing", async () => {
    const harness = renderHook({ account: null, repoName: null, envName: null });
    await waitFor(() => expect(harness.current.loading).toBe(false));

    await act(async () => {
      await harness.current.onRefresh();
    });

    expect(mockApi.fetchVariables).not.toHaveBeenCalled();
    expect(harness.current.refreshing).toBe(false);

    harness.unmount();
  });

  it("optimistically applies a confirmed value via onConfirmed", async () => {
    const harness = renderHook({ account, repoName: "repo-a", envName: "PROD" });
    await waitFor(() => expect(harness.current.loading).toBe(false));

    act(() => {
      harness.current.onConfirmed("EXTRA", "value-1");
    });

    await waitFor(() => expect(harness.current.values).toEqual({ NAME: "Zenblox", EXTRA: "value-1" }));

    harness.unmount();
  });
});
