import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRepoCard, type UseRepoCard } from "../hooks/useRepoCard";

const { mockHooks } = vi.hoisted(() => ({
	mockHooks: {
		useGithubRepo: vi.fn(),
		useGithubEnvironment: vi.fn(),
	},
}));

vi.mock("../hooks/useGithubRepo", () => ({
	useGithubRepo: mockHooks.useGithubRepo,
}));

vi.mock("../hooks/useGithubEnvironment", () => ({
	useGithubEnvironment: mockHooks.useGithubEnvironment,
}));

vi.mock("../logic/github", () => ({
	getEnvSettingsUrl: vi.fn(() => "https://github.example/settings"),
}));

function HookHarness(props: { onUpdate: (value: UseRepoCard) => void; user: Parameters<typeof useRepoCard>[0]["user"] }) {
	const value = useRepoCard(props);
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useRepoCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockHooks.useGithubRepo.mockReturnValue({
			status: "complete",
			selectedAccount: { login: "org-one" },
			selectedRepo: { id: 1, name: "repo-one" },
			repoFullName: "org-one/repo-one",
			templateStatus: "ready",
			branchList: [],
		} as never);
		mockHooks.useGithubEnvironment.mockReturnValue({
			status: "complete",
			selectedEnv: { id: "env-1", name: "prod" },
			branchMatchError: null,
			branchMatchWarning: null,
		} as never);
	});

	it("combines repo and environment state into a single card", async () => {
		let latest: UseRepoCard | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(<HookHarness user={{ login: "org-one" } as never} onUpdate={(value) => { latest = value; }} />);
		});

		expect(latest?.status).toBe("complete");
		expect(latest?.summary).toBe("org-one/repo-one · prod");
		expect(latest?.githubEnvUrl).toBe("https://github.example/settings");
		expect(latest?.done).toBe(true);
		expect(latest?.cardDependencyLabel).toBeNull();

		await act(async () => {
			root.unmount();
		});
	});
});