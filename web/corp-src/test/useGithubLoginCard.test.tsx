import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGithubLoginCard, type UseGithubLoginCard } from "../hooks/useGithubLoginCard";

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		verifyAuth: vi.fn(),
		switchToDirect: vi.fn(),
		switchToBackend: vi.fn(),
	},
}));

vi.mock("../api", () => ({
	verifyAuth: apiMocks.verifyAuth,
	switchToDirect: apiMocks.switchToDirect,
	switchToBackend: apiMocks.switchToBackend,
}));

function HookHarness(props: { onUpdate: (value: UseGithubLoginCard) => void }) {
	const value = useGithubLoginCard();

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

describe("useGithubLoginCard", () => {
	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		vi.clearAllMocks();
		sessionStorage.clear();

		apiMocks.verifyAuth.mockResolvedValue({ login: "octocat" });
	});

	it("verifies auth on mount and exposes a signed-in state", async () => {
		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.account?.login).toBe("octocat");
			expect(latest?.status).toBe("complete");
			expect(latest?.summary).toBe("Signed in as octocat");
			expect(latest?.done).toBe(true);
			expect(latest?.cardId).toBe("github_login");
			expect(latest?.cardDependencyLabel).toBe("Sign in to GitHub");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("restores PAT mode from session storage before verifying auth", async () => {
		sessionStorage.setItem("pat_token", "ghp_saved");

		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_saved");
			expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
			expect(latest?.account?.login).toBe("octocat");
			expect(latest?.status).toBe("complete");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("clears saved PAT and stays idle when verification fails", async () => {
		sessionStorage.setItem("pat_token", "ghp_bad");
		apiMocks.verifyAuth.mockRejectedValueOnce(new Error("invalid token"));

		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.account).toBeNull();
			expect(latest?.status).toBe("idle");
			expect(latest?.summary).toBe("Connect your GitHub account");
			expect(sessionStorage.getItem("pat_token")).toBeNull();
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("marks sessionExpired when auth:session-expired is dispatched", async () => {
		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.sessionExpired).toBe(false);
		});

		await act(async () => {
			window.dispatchEvent(new Event("auth:session-expired"));
		});

		await waitFor(() => {
			expect(latest?.sessionExpired).toBe(true);
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("builds backend login/logout redirect URLs", async () => {
		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);
		const originalLocation = window.location;

		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				href: "https://app.example.com/onboarding?step=github",
			},
		});

		try {
			await act(async () => {
				root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
			});

			await waitFor(() => {
				expect(latest?.loggingIn).toBe(false);
			});

			await act(async () => {
				latest?.login();
			});

			await waitFor(() => {
				expect(latest?.redirecting).toBe("login");
				expect(window.location.href).toContain("/auth/login/github?post_login_redirect_uri=");
			});

			await act(async () => {
				latest?.logout();
			});

			await waitFor(() => {
				expect(latest?.redirecting).toBe("logout");
				expect(window.location.href).toContain("/auth/logout?post_logout_redirect_uri=");
			});
		} finally {
			Object.defineProperty(window, "location", {
				configurable: true,
				value: originalLocation,
			});
			await act(async () => {
				root.unmount();
			});
		}
	});

	it("stores PAT and updates account on successful direct PAT login", async () => {
		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
		});

		apiMocks.verifyAuth.mockResolvedValueOnce({ login: "pat-user" });

		await act(async () => {
			latest?.onPatLogin("ghp_live_token");
		});

		await waitFor(() => {
			expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(2);
			expect(sessionStorage.getItem("pat_token")).toBe("ghp_live_token");
			expect(latest?.account?.login).toBe("pat-user");
			expect(latest?.status).toBe("complete");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("clears account when direct PAT login verification fails", async () => {
		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(latest?.status).toBe("complete");
		});

		apiMocks.verifyAuth.mockRejectedValueOnce(new Error("pat auth failed"));

		await act(async () => {
			latest?.onPatLogin("ghp_broken");
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.account).toBeNull();
			expect(latest?.status).toBe("idle");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("returns to backend mode and clears local PAT state on direct logout", async () => {
		sessionStorage.setItem("pat_token", "ghp_saved");

		let latest: UseGithubLoginCard | null = null;
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(<HookHarness onUpdate={(value) => { latest = value; }} />);
		});

		await waitFor(() => {
			expect(latest?.status).toBe("complete");
			expect(latest?.account?.login).toBe("octocat");
		});

		await act(async () => {
			latest?.onDirectLogout();
		});

		await waitFor(() => {
			expect(apiMocks.switchToBackend).toHaveBeenCalledTimes(1);
			expect(sessionStorage.getItem("pat_token")).toBeNull();
			expect(latest?.account).toBeNull();
			expect(latest?.status).toBe("idle");
			expect(latest?.loggingIn).toBe(false);
		});

		await act(async () => {
			root.unmount();
		});
	});
});
