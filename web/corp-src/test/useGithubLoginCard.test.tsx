import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	readGithubAuthRecord,
	useGithubLoginCard,
	type UseGithubLoginCard,
} from "../hooks/useGithubLoginCard";

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		verifyAuth: vi.fn(),
		switchToDirect: vi.fn(),
		switchToBackend: vi.fn(),
		backendLogout: vi.fn(),
	},
}));

vi.mock("../api", () => ({
	verifyAuth: apiMocks.verifyAuth,
	switchToDirect: apiMocks.switchToDirect,
	switchToBackend: apiMocks.switchToBackend,
	logout: apiMocks.backendLogout,
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
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
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

	it("starts idle when no auth record is saved", async () => {
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(apiMocks.verifyAuth).not.toHaveBeenCalled();
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.account).toBeNull();
			expect(latest?.status).toBe("idle");
			expect(latest?.summary).toBe("Connect your GitHub account");
			expect(latest?.cardId).toBe("github_login");
			expect(latest?.cardDependencyLabel).toBe("Sign in to GitHub");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("returns null when auth record JSON is invalid", () => {
		sessionStorage.setItem("zeninstaller_github_auth", "{not-valid-json");
		expect(readGithubAuthRecord()).toBeNull();
	});

	it("treats invalid saved auth record as missing and stays idle", async () => {
		sessionStorage.setItem("zeninstaller_github_auth", "{not-valid-json");

		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(apiMocks.verifyAuth).not.toHaveBeenCalled();
			expect(latest?.status).toBe("idle");
			expect(latest?.loggingIn).toBe(false);
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("restores backend auth from session storage on mount", async () => {
		sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "backend" }));

		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(apiMocks.switchToDirect).not.toHaveBeenCalled();
			expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
			expect(latest?.mode).toBe("backend");
			expect(latest?.account?.login).toBe("octocat");
			expect(latest?.status).toBe("complete");
			expect(latest?.done).toBe(true);
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("restores direct auth and switches the API into direct mode", async () => {
		sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "direct", token: "ghp_saved" }));

		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_saved");
			expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
			expect(latest?.mode).toBe("direct");
			expect(latest?.token).toBe("ghp_saved");
			expect(latest?.account?.login).toBe("octocat");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("preserves session record and marks expired when mount auth verification fails", async () => {
		sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "backend" }));
		apiMocks.verifyAuth.mockRejectedValueOnce(new Error("expired"));

		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.account).toBeNull();
			expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({ mode: "backend" });
			expect(latest?.sessionExpired).toBe(true);
			expect(latest?.status).toBe("idle");
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("logs in through the backend mode and persists the selected auth record", async () => {
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
		});

		await act(async () => {
			await latest!.login();
		});

		await waitFor(() => {
			expect(apiMocks.switchToBackend).toHaveBeenCalledTimes(1);
			expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
			expect(latest?.account?.login).toBe("octocat");
			expect(latest?.status).toBe("complete");
			expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({ mode: "backend" });
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("preserves direct token when setting direct mode again", async () => {
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
		});

		await act(async () => {
			latest?.setMode("direct");
			latest?.setToken("ghp_keep_me");
			latest?.setMode("direct");
		});

		await act(async () => {
			await latest!.login();
		});

		await waitFor(() => {
			expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_keep_me");
			expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({
				mode: "direct",
				token: "ghp_keep_me",
			});
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("does not login in direct mode when token is missing", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
		});

		apiMocks.verifyAuth.mockClear();
		await act(async () => {
			latest?.setMode("direct");
			latest?.setToken(null);
			await latest?.login();
		});

		expect(consoleError).toHaveBeenCalledWith("Missing PAT");
		expect(apiMocks.switchToDirect).not.toHaveBeenCalled();
		expect(apiMocks.verifyAuth).not.toHaveBeenCalled();

		consoleError.mockRestore();
		await act(async () => {
			root.unmount();
		});
	});

	it("preserves backend auth record when login verifyAuth fails", async () => {
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
		});

		apiMocks.verifyAuth.mockRejectedValueOnce(new Error("auth failed"));
		await act(async () => {
			await latest?.login();
		});

		await waitFor(() => {
			expect(latest?.account).toBeNull();
			expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({ mode: "backend" });
			expect(latest?.loggingIn).toBe(false);
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("switches to direct mode, stores the token, and clears it on logout", async () => {
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
		});

		await act(async () => {
			latest?.setMode("direct");
			latest?.setToken("ghp_live_token");
		});

		await act(async () => {
			await latest!.login();
		});

		await waitFor(() => {
			expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_live_token");
			expect(latest?.mode).toBe("direct");
			expect(latest?.token).toBe("ghp_live_token");
			expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({ mode: "direct", token: "ghp_live_token" });
		});

		await act(async () => {
			await latest!.logout();
		});

		await waitFor(() => {
			expect(apiMocks.backendLogout).not.toHaveBeenCalled();
			expect(sessionStorage.getItem("zeninstaller_github_auth")).toBeNull();
			expect(latest?.account).toBeNull();
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("calls backend logout in backend mode and swallows backend errors", async () => {
		apiMocks.backendLogout.mockRejectedValueOnce(new Error("network"));
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await waitFor(() => {
			expect(latest?.loggingIn).toBe(false);
			expect(latest?.mode).toBe("backend");
		});

		await act(async () => {
			await latest?.logout();
		});

		expect(apiMocks.backendLogout).toHaveBeenCalledTimes(1);
		expect(latest?.account).toBeNull();
		expect(sessionStorage.getItem("zeninstaller_github_auth")).toBeNull();

		await act(async () => {
			root.unmount();
		});
	});

	it("marks sessionExpired when the session-expired event fires", async () => {
		let latest: UseGithubLoginCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
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
});
