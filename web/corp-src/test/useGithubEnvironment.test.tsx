import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGithubEnvironment, type UseGithubEnvironment } from "../hooks/useGithubEnvironment";

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		fetchEnvs: vi.fn(),
		fetchVariables: vi.fn(),
	},
}));

vi.mock("../api", () => ({
	fetchEnvs: apiMocks.fetchEnvs,
	fetchVariables: apiMocks.fetchVariables,
}));

function HookHarness(props: { onUpdate: (value: UseGithubEnvironment) => void } & Parameters<typeof useGithubEnvironment>[0]) {
	const value = useGithubEnvironment(props);
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useGithubEnvironment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.fetchEnvs.mockResolvedValue([{ id: 1, name: "prod" }]);
		apiMocks.fetchVariables.mockResolvedValue({ NAME: "Zenblox" });
	});

	it("loads environments, matches the selected branch, and restores by name", async () => {
		let latest: UseGithubEnvironment | null = null;
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				<HookHarness
					account={{ login: "org-one", id: 1 } as never}
					repo={{ id: 11, name: "repo-one" } as never}
					branches={[{ name: "prod" } as never]}
					isRepoReady={true}
					onUpdate={(value) => {
						latest = value;
					}}
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(apiMocks.fetchEnvs).toHaveBeenCalledWith({ login: "org-one", id: 1 }, "repo-one");

		await act(async () => {
			latest?.setSelectedEnv(latest.envList[0]);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(latest?.status).toBe("complete");
		expect(latest?.branchMatchWarning).toBeNull();
		expect(latest?.presentVariableValues).toEqual({ NAME: "Zenblox" });
		expect(latest?.restore.env.apply("prod")).toBe(true);

		await act(async () => {
			root.unmount();
		});
	});
});