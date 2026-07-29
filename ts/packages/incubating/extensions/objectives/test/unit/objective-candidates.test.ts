import { describe, expect, test } from "vitest";

import { objectiveCompletionItem, parseObjectiveCandidatesData } from "../../src/api/index.ts";

describe("parseObjectiveCandidatesData", () => {
	test("parses candidate payloads", () => {
		const parsed = parseObjectiveCandidatesData({
			records: [
				{ owner: "tester", slug: "alpha", locator: "tester/alpha", status: "open" },
				{ owner: "tester", slug: "bravo", locator: "tester/bravo", status: "closed" },
			],
		});

		expect(parsed).toEqual({
			type: "valid",
			records: [
				{ owner: "tester", slug: "alpha", locator: "tester/alpha", status: "open" },
				{ owner: "tester", slug: "bravo", locator: "tester/bravo", status: "closed" },
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
		expect(
			objectiveCompletionItem({
				owner: "tester",
				slug: "alpha",
				locator: "tester/alpha",
				status: "open",
			}),
		).toEqual({
			value: "tester/alpha",
			label: "tester/alpha",
			description: "open",
		});
		expect(
			objectiveCompletionItem({
				owner: "tester",
				slug: "bravo",
				locator: "tester/bravo",
				status: "closed",
			}),
		).toEqual({
			value: "tester/bravo",
			label: "tester/bravo",
			description: "closed",
		});
	});
});
