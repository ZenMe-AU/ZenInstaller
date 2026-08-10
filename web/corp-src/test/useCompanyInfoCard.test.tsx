import { describe, expect, it } from "vitest";
import { useCompanyInfoCard } from "../hooks/useCompanyInfoCard";

describe("useCompanyInfoCard", () => {
	it("projects company variables into card state", () => {
		const card = useCompanyInfoCard({
			variableValues: { NAME: "Zenblox", DNS: "zenblox.io" },
			envSelected: true,
		});

		expect(card.cardId).toBe("company_info");
		expect(card.corpName).toBe("Zenblox");
		expect(card.dnsName).toBe("zenblox.io");
		expect(card.status).toBe("complete");
		expect(card.summary).toBe("Zenblox · zenblox.io");
		expect(card.done).toBe(true);
		expect(card.cardRequirements).toEqual(["github_login", "repo"]);
	});

	it("stays idle until an environment is selected", () => {
		const card = useCompanyInfoCard({ variableValues: {}, envSelected: false });

		expect(card.status).toBe("idle");
		expect(card.summary).toBe("Set company info");
		expect(card.done).toBe(false);
	});

	it("shows warning when environment is selected but company info is incomplete", () => {
		const card = useCompanyInfoCard({
			variableValues: { NAME: "Zenblox" },
			envSelected: true,
		});

		expect(card.status).toBe("warning");
		expect(card.summary).toBe("Set company info");
		expect(card.done).toBe(false);
	});
});