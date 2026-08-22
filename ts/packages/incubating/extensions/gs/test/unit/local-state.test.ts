import { describe, expect, it } from "vitest";

import { gsLocalStackSummary, parseGsLocalState } from "../../src/core/local-state.ts";

function expectParsed(input: unknown) {
	const result = parseGsLocalState(input);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

describe("parseGsLocalState", () => {
	it("tolerates an unfamiliar schema version and additive provider fields", () => {
		const inventory = expectParsed({
			schemaVersion: 999,
			repository: "owner/repo",
			stacks: [
				{
					id: "provider-id",
					number: 42,
					future: true,
					trunk: { branch: "main", repository: "owner/repo" },
					branches: [
						{
							branch: "base",
							head: "sha",
							base: "main",
							pullRequest: { number: 101, id: "PR_id", url: "https://example.test/101" },
						},
						{ branch: "top", pullRequest: { number: 102, merged: true } },
					],
				},
			],
		});

		expect(inventory).toEqual({
			stacks: [
				{
					number: 42,
					base: "main",
					branches: [
						{
							name: "base",
							pullRequest: { number: 101, recordedMerged: false },
						},
						{
							name: "top",
							pullRequest: { number: 102, recordedMerged: true },
						},
					],
				},
			],
		});
		expect(inventory).not.toHaveProperty("stacks.0.id");
	});

	it("rejects the entire state when one consumed record is malformed", () => {
		const result = parseGsLocalState({
			schemaVersion: 1,
			stacks: [
				{ trunk: { branch: "main" }, branches: [{ branch: "valid" }] },
				{
					trunk: { branch: "main" },
					branches: [{ branch: "invalid", pullRequest: { number: 0 } }],
				},
			],
		});

		expect(result.ok).toBe(false);
	});

	it("sorts all stacks without filtering or deduplicating", () => {
		const inventory = expectParsed({
			schemaVersion: 1,
			stacks: [
				{
					number: 5,
					trunk: { branch: "main" },
					branches: [{ branch: "z", pullRequest: { number: 5, merged: true } }],
				},
				{ number: 9, trunk: { branch: "main" }, branches: [{ branch: "middle" }] },
				{ trunk: { branch: "main" }, branches: [{ branch: "b" }, { branch: "top" }] },
				{ number: 5, trunk: { branch: "main" }, branches: [{ branch: "a" }] },
				{ trunk: { branch: "main" }, branches: [{ branch: "a" }] },
			],
		});

		expect(inventory.stacks.map((stack) => [stack.number, gsLocalStackSummary(stack)])).toEqual([
			[null, "a"],
			[null, "b...top"],
			[9, "middle"],
			[5, "a"],
			[5, "z"],
		]);
		expect(inventory.stacks).toHaveLength(5);
		expect(inventory.stacks.at(-1)?.branches[0]?.pullRequest?.recordedMerged).toBe(true);
	});

	it.each([
		{},
		{ stacks: [] },
		{ schemaVersion: 1 },
		{ schemaVersion: 1, stacks: [{ trunk: { branch: "main" }, branches: [] }] },
	])("rejects missing or malformed consumed structure", (input) => {
		expect(parseGsLocalState(input).ok).toBe(false);
	});
});
