import { describe, expect, test } from "bun:test";

import { parseObjectiveList } from "../src/objective-list.ts";

describe("parseObjectiveList", () => {
	test("parses the current objective list JSON shape", () => {
		const parsed = parseObjectiveList(envelope());

		expect(parsed).toEqual({
			baseBranch: "main",
			trunkBranch: "main",
			view: "list",
			statusFilter: "active",
			currentBranch: null,
			filteredToCurrent: false,
			namesOnly: false,
			groups: [
				{
					slug: "alpha",
					status: "open",
					latestUpdateIso: "2026-05-20T10:00:00Z",
					latestWorkBranch: "feat/alpha",
					branches: [
						{
							branch: "feat/alpha",
							updatedIso: "2026-05-20T10:00:00Z",
							aheadBase: 3,
						},
					],
				},
			],
		});
	});

	test("parses legacy branch fields", () => {
		const parsed = parseObjectiveList(
			envelope({
				groups: [
					group({
						branches: [
							{
								branch: "feat/legacy",
								tip_head_iso: "2026-05-19T10:00:00Z",
								ahead_trunk: 7,
							},
						],
					}),
				],
			}),
		);

		expect(parsed.groups[0]?.branches[0]).toEqual({
			branch: "feat/legacy",
			updatedIso: "2026-05-19T10:00:00Z",
			aheadBase: 7,
		});
	});

	test("falls back baseBranch to trunkBranch when base_branch is absent", () => {
		const parsed = parseObjectiveList(envelope({ base_branch: undefined, trunk_branch: "master" }));

		expect(parsed.baseBranch).toBe("master");
		expect(parsed.trunkBranch).toBe("master");
	});

	test("falls back missing status_filter to an empty string", () => {
		const parsed = parseObjectiveList(envelope({ status_filter: undefined }));

		expect(parsed.statusFilter).toBe("");
	});

	test("rejects invalid JSON", () => {
		expect(() => parseObjectiveList("{")).toThrow(/Failed to parse objective list JSON/);
	});

	test("rejects a non-object envelope", () => {
		expect(() => parseObjectiveList("[]")).toThrow(/expected an envelope object/);
	});

	test("rejects a nonzero envelope exit code", () => {
		expect(() => parseObjectiveList(JSON.stringify({ exit_code: 2, data: {} }))).toThrow(/exit_code 2/);
	});

	test("rejects missing data", () => {
		expect(() => parseObjectiveList(JSON.stringify({ exit_code: 0 }))).toThrow(/expected a data object/);
	});

	test("rejects invalid top-level fields", () => {
		expect(() => parseObjectiveList(envelope({ trunk_branch: 42 }))).toThrow(/expected base_branch/);
	});

	test("rejects invalid group fields", () => {
		expect(() => parseObjectiveList(envelope({ groups: [group({ slug: 123 })] }))).toThrow(/Invalid Objective list group/);
	});

	test("rejects invalid branch fields", () => {
		expect(() =>
			parseObjectiveList(
				envelope({
					groups: [group({ branches: [{ branch: "feat/a", updated_iso: null, ahead_base: "3" }] })],
				}),
			),
		).toThrow(/Invalid Objective list branch/);
	});

	test("rejects non-finite ahead_base", () => {
		const stdout = `{
			"exit_code": 0,
			"data": {
				"base_branch": "main",
				"trunk_branch": "main",
				"view": "list",
				"status_filter": "active",
				"current_branch": null,
				"filtered_to_current": false,
				"names_only": false,
				"groups": [{
					"slug": "alpha",
					"status": "open",
					"latest_update_iso": null,
					"latest_work_branch": null,
					"branches": [{"branch": "feat/a", "updated_iso": null, "ahead_base": 1e999}]
				}]
			}
		}`;

		expect(() => parseObjectiveList(stdout)).toThrow(/Invalid Objective list branch/);
	});
});

function envelope(dataOverrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			base_branch: "main",
			trunk_branch: "main",
			view: "list",
			status_filter: "active",
			current_branch: null,
			filtered_to_current: false,
			names_only: false,
			groups: [group()],
			...dataOverrides,
		},
	});
}

function group(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		slug: "alpha",
		status: "open",
		latest_update_iso: "2026-05-20T10:00:00Z",
		latest_work_branch: "feat/alpha",
		branches: [
			{
				branch: "feat/alpha",
				updated_iso: "2026-05-20T10:00:00Z",
				ahead_base: 3,
			},
		],
		...overrides,
	};
}
