import { describe, expect, test } from "vitest";

import { parseLocalStackFile, parseRemoteStackPages } from "../../src/core/gateways/schemas.ts";

const localInput = {
	schemaVersion: 1,
	stacks: [
		{
			id: "12",
			number: 4,
			trunk: { branch: "main" },
			branches: [{ branch: "a", pullRequest: { number: 10 } }],
		},
	],
};

const remoteInput = [
	[
		{
			id: 12,
			number: 4,
			base: { ref: "main" },
			created_at: "2026-01-01T00:00:00Z",
			pull_requests: [{ number: 10, state: "open", merged_at: null, head: { ref: "a" } }],
		},
	],
];

describe("provider schemas", () => {
	test("accepts local additive fields and unfamiliar schema versions", () => {
		expect(
			parseLocalStackFile({
				...localInput,
				schemaVersion: 999,
				future: true,
				stacks: [{ ...localInput.stacks[0], futureStack: true }],
			}),
		).toEqual({
			ok: true,
			value: [
				{
					id: "12",
					number: 4,
					base: "main",
					branches: [{ name: "a", pullRequest: { number: 10, merged: false } }],
				},
			],
		});
	});

	test("rejects malformed required local structure without dropping records", () => {
		const input = { ...localInput, stacks: [...localInput.stacks, { trunk: {}, branches: [] }] };
		expect(parseLocalStackFile(input)).toMatchObject({ ok: false });
	});

	test("accepts and flattens paginated remote responses with additive fields", () => {
		const input = [
			[{ ...remoteInput[0]?.[0], future: { enabled: true } }],
			[
				{
					...remoteInput[0]?.[0],
					id: "13",
					number: 5,
					pull_requests: [
						{ number: 11, state: "closed", merged_at: null, head: { ref: "b" }, draft: true },
					],
				},
			],
		];
		const result = parseRemoteStackPages(input);
		expect(result.ok && result.value).toHaveLength(2);
		expect(result.ok && result.value[0]).toMatchObject({
			id: "12",
			number: 4,
			pullRequests: [{ branch: "a", state: "open" }],
		});
	});

	test("accepts the direct array shape and empty slurped pages", () => {
		expect(parseRemoteStackPages(remoteInput[0])).toMatchObject({ ok: true });
		expect(parseRemoteStackPages([[]])).toEqual({ ok: true, value: [] });
	});

	test.each([
		["not an array", {}],
		["missing base", [{ id: 1, number: 1, created_at: "2026-01-01T00:00:00Z", pull_requests: [] }]],
		[
			"bad PR state",
			[
				[
					{
						...remoteInput[0]?.[0],
						pull_requests: [{ number: 1, state: "unknown", merged_at: null, head: { ref: "a" } }],
					},
				],
			],
		],
	])("rejects malformed remote structure: %s", (_name, input) => {
		expect(parseRemoteStackPages(input)).toMatchObject({ ok: false });
	});
});
