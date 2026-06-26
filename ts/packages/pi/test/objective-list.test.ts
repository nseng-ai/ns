import { describe, expect, test } from "vitest";

import { parseObjectiveList } from "../src/objectives/list.ts";

describe("parseObjectiveList", () => {
	test("returns invalid when machine envelope parsing fails", () => {
		const parsed = parseObjectiveList("{");

		expect(parsed.type).toBe("invalid");
		if (parsed.type === "invalid") {
			expect(parsed.message).toMatch(/Malformed objective list JSON/);
		}
	});

	test("returns invalid when payload structure is incorrect", () => {
		const parsed = parseObjectiveList(envelope({ records: [{ slug: 42 }] }));

		expect(parsed.type).toBe("invalid");
		if (parsed.type === "invalid") {
			expect(parsed.message).toMatch(/Invalid objective list JSON/);
		}
	});

	test("returns Objective list when payload parses", () => {
		const parsed = parseObjectiveList(envelope());

		expect(parsed).toEqual({
			type: "valid",
			list: baseList(),
		});
	});
});

function envelope(dataOverrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		status: "ok",
		exitCode: 0,
		data: {
			...baseList(),
			...dataOverrides,
		},
	});
}

function baseList() {
	return {
		trunkBranch: "main",
		rootPath: ".sdl/objectives",
		statusFilter: "active",
		namesOnly: false,
		records: [
			{
				slug: "alpha",
				status: "open",
				latestUpdateIso: "2026-05-20T10:00:00Z",
				hasOutstandingChanges: false,
			},
		],
	};
}
