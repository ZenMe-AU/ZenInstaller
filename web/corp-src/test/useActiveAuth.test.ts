import { describe, expect, it, vi } from "vitest";

// Verifies if VITE_AUTH_PCKE=false uses useGithubLoginCard otherwise usePkceAuth
const { mockHooks } = vi.hoisted(() => ({
	mockHooks: {
		usePkceAuth: vi.fn(() => ({ source: "pkce" })),
		useGithubLoginCard: vi.fn(() => ({ source: "github" })),
	},
}));

vi.mock("../hooks/usePkceAuth", () => ({
	usePkceAuth: mockHooks.usePkceAuth,
}));

vi.mock("../hooks/useGithubLoginCard", () => ({
	useGithubLoginCard: mockHooks.useGithubLoginCard,
}));

describe("useActiveAuth", () => {
	it("selects the GitHub login hook by default", async () => {
		vi.resetModules();
		vi.stubEnv("VITE_AUTH_PKCE", "false");
		const mod = await import("../hooks/useActiveAuth");
		expect(mod.useActiveAuth).toBe(mockHooks.useGithubLoginCard);
	});

	it("selects the PKCE hook when enabled", async () => {
		vi.resetModules();
		vi.stubEnv("VITE_AUTH_PKCE", "true");
		const mod = await import("../hooks/useActiveAuth");
		expect(mod.useActiveAuth).toBe(mockHooks.usePkceAuth);
	});
});