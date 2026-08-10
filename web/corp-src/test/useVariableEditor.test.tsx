import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVariableEditor } from "../hooks/util/useVariableEditor";
import type { Account } from "../types";

async function waitFor(assertion: () => void, timeoutMs = 1000) {
	const start = Date.now();
	for (;;) {
		try {
			assertion();
			return;
		} catch (error) {
			if (Date.now() - start >= timeoutMs) {
				throw error;
			}
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}
}

const { apiMocks } = vi.hoisted(() => ({
	apiMocks: {
		createVariable: vi.fn(),
		updateVariable: vi.fn(),
	},
}));

vi.mock("../api", () => ({
	createVariable: apiMocks.createVariable,
	updateVariable: apiMocks.updateVariable,
}));

function HookHarness(props: {
	onUpdate: (value: ReturnType<typeof useVariableEditor>) => void;
	keys: readonly string[];
	savedValues: Record<string, string>;
	account: Account | null;
	repo: string;
	envName: string | null;
}) {
	const value = useVariableEditor(props);
	useEffect(() => {
		props.onUpdate(value);
	}, [value, props]);
	return null;
}

describe("useVariableEditor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.createVariable.mockResolvedValue(undefined);
		apiMocks.updateVariable.mockResolvedValue(undefined);
	});

	it("tracks edits and saves new and existing variables", async () => {
		let latest: ReturnType<typeof useVariableEditor> | null = null;
		const root = createRoot(document.createElement("div"));
		let saveResult:
			| {
					result: "saved" | "no-changes" | "error";
					savedKeys: string[];
					newlySaved: Record<string, string>;
			  }
			| undefined;

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
					keys={["NAME", "DNS"]}
					savedValues={{ NAME: "Zen" }}
					account={{ login: "org-one", type: "Organization", id: 101 }}
					repo="repo-one"
					envName="prod"
				/>,
			);
		});

		await act(async () => {
			latest?.onChange("NAME", "Zenblox");
			latest?.onChange("DNS", "zenblox.io");
		});

		await waitFor(() => {
			expect(latest?.dirtyKeys).toEqual(["NAME", "DNS"]);
		});

    await act(async () => {
      saveResult = await latest!.save();
    });
    expect(latest?.upsertStatuses).toEqual([
      { key: "NAME", status: "success" },
      { key: "DNS", status: "success" },
    ]);

    expect(saveResult).toEqual({
      result: "saved",
      savedKeys: ["NAME", "DNS"],
      newlySaved: { NAME: "Zenblox", DNS: "zenblox.io" },
    });
    expect(apiMocks.updateVariable).toHaveBeenCalledWith(
      { login: "org-one", type: "Organization", id: 101 },
      "repo-one",
      "NAME",
      "Zenblox",
      "prod",
    );
    expect(apiMocks.createVariable).toHaveBeenCalledWith(
      { login: "org-one", type: "Organization", id: 101 },
      "repo-one",
      "DNS",
      "zenblox.io",
      "prod",
    );

    await act(async () => {
      latest?.onChange("NAME", "Zenblox2");
    });

		await act(async () => {
			latest?.onRevert("DNS");
		});

		expect(latest?.localValues.DNS).toBe("");

		await act(async () => {
			root.unmount();
		});
	});

	it("returns no-changes when values already match the saved state", async () => {
		let latest: ReturnType<typeof useVariableEditor> | null = null;
		const root = createRoot(document.createElement("div"));
		let saveResult:
			| {
					result: "saved" | "no-changes" | "error";
					savedKeys: string[];
					newlySaved: Record<string, string>;
			  }
			| undefined;

		await act(async () => {
			root.render(
				<HookHarness
					onUpdate={(value) => {
						latest = value;
					}}
					keys={["NAME"]}
					savedValues={{ NAME: "Zen" }}
					account={{ login: "org-one", type: "Organization", id: 101 }}
					repo="repo-one"
					envName="prod"
				/>,
			);
		});

		await act(async () => {
			saveResult = await latest!.save();
		});

		expect(saveResult?.result).toBe("no-changes");
		expect(apiMocks.updateVariable).not.toHaveBeenCalled();
		expect(apiMocks.createVariable).not.toHaveBeenCalled();

		await act(async () => {
			root.unmount();
		});
	});
});