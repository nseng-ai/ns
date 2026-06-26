import { describe, expect, test } from "vitest";

import { objectiveCompletionItem, parseObjectiveCandidatesData } from "../../src/api.ts";

describe("parseObjectiveCandidatesData", () => {
	test("parses candidate payloads", () => {
		const parsed = parseObjectiveCandidatesData({
			records: [
				{ slug: "alpha", status: "open" },
				{ slug: "bravo", status: "closed" },
			],
		});

		expect(parsed).toEqual({
			type: "valid",
			records: [
				{ slug: "alpha", status: "open" },
				{ slug: "bravo", status: "closed" },
			],
		});
	});

	test("rejects malformed payloads", () => {
		const parsed = parseObjectiveCandidatesData({ records: [{ slug: 42 }] });

		expect(parsed.type).toBe("invalid");
		if (parsed.type === "invalid") {
			expect(parsed.message).toMatch(/Invalid objective candidates JSON/);
		}
	});
});

describe("objectiveCompletionItem", () => {
	test("includes descriptions for each candidate", () => {
		expect(objectiveCompletionItem({ slug: "alpha", status: "open" })).toEqual({
			value: "alpha",
			label: "alpha",
			description: "open",
		});
		expect(objectiveCompletionItem({ slug: "bravo", status: "closed" })).toEqual({
			value: "bravo",
			label: "bravo",
			description: "closed",
		});
	});
});
