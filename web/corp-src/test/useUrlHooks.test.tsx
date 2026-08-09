import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

function waitFor(assertion: () => void, timeoutMs = 1500) {
	const start = Date.now();
	return new Promise<void>(async (resolve, reject) => {
		while (true) {
			try {
				assertion();
				resolve();
				return;
			} catch (error) {
				if (Date.now() - start > timeoutMs) {
					reject(error);
					return;
				}
				await act(async () => {
					await new Promise((done) => setTimeout(done, 0));
				});
			}
		}
	});
}

describe("useUrlRestore and useUrlSync", () => {
	it("restores URL fields in order and clears the pending state", async () => {
		window.history.replaceState({}, "", "/?account=org-one&repo=repo-one");
		vi.resetModules();
		const { useUrlRestore } = await import("../hooks/useUrlStateManager");
		const applied: string[] = [];
		let latest: ReturnType<typeof useUrlRestore> | null = null;
		const root = createRoot(document.createElement("div"));

		function Harness(props: { repoReady: boolean }) {
			const value = useUrlRestore([
				{
					active: true,
					fields: {
						account: {
							ready: true,
							apply: (value) => {
								applied.push(`account:${value}`);
								return true;
							},
						},
						repo: {
							ready: props.repoReady,
							apply: (value) => {
								applied.push(`repo:${value}`);
								return true;
							},
						},
					},
				},
			]);
			useEffect(() => {
				latest = value;
			}, [value]);
			return null;
		}

		await act(async () => {
			root.render(<Harness repoReady={false} />);
		});

		await waitFor(() => {
			expect(applied).toEqual(["account:org-one"]);
		});

		await act(async () => {
			root.render(<Harness repoReady={true} />);
		});

		await waitFor(() => {
			expect(applied).toEqual(["account:org-one", "repo:repo-one"]);
			expect(latest?.completed).toBe(true);
			expect(latest?.restoring).toBe(false);
		});

		await act(async () => {
			root.unmount();
		});
	});

	it("updates the browser URL when sync is enabled", async () => {
		window.history.replaceState({}, "", "/start#hash");
		vi.resetModules();
		const replaceState = vi.spyOn(window.history, "replaceState");
		const { useUrlSync } = await import("../hooks/useUrlStateManager");

		function Harness() {
			useUrlSync({ account: "org-one", repo: "repo-one", env: undefined }, true);
			return null;
		}

		const root = createRoot(document.createElement("div"));
		await act(async () => {
			root.render(<Harness />);
		});

		expect(replaceState).toHaveBeenCalledWith(null, "", "/start?account=org-one&repo=repo-one#hash");

		await act(async () => {
			root.unmount();
		});
		replaceState.mockRestore();
	});
});