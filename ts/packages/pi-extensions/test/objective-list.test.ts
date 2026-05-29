import { describe, expect, test } from "bun:test";

import { parseObjectiveList } from "../src/objective-list.ts";

describe("parseObjectiveList", () => {
	test("parses the current objective list JSON shape", () => {
		const parsed = parseObjectiveList(envelope());

		expect(parsed).toEqual({
			trunkBranch: "main",
			rootPath: ".asdl/objectives",
			statusFilter: "active",
			namesOnly: false,
			records: [
				{
					slug: "alpha",
					status: "open",
					latestUpdateIso: "2026-05-20T10:00:00Z",
				},
			],
		});
	});

	test("parses null latest update timestamps", () => {
		const parsed = parseObjectiveList(envelope({ records: [record({ latest_update_iso: null })] }));

		expect(parsed.records[0]?.latestUpdateIso).toBeNull();
	});

	test("rejects invalid JSON", () => {
		expect(() => parseObjectiveList("{")).toThrow(/objective list JSON/);
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
		expect(() => parseObjectiveList(envelope({ trunk_branch: 42 }))).toThrow(/expected trunk_branch/);
	});

	test("rejects missing records", () => {
		expect(() => parseObjectiveList(envelope({ records: undefined }))).toThrow(/expected trunk_branch/);
	});

	test("rejects missing or non-string slug", () => {
		expect(() => parseObjectiveList(envelope({ records: [record({ slug: undefined })] }))).toThrow(
			/Invalid Objective list record/,
		);
		expect(() => parseObjectiveList(envelope({ records: [record({ slug: 123 })] }))).toThrow(
			/Invalid Objective list record/,
		);
	});

	test("rejects missing or non-string status", () => {
		expect(() => parseObjectiveList(envelope({ records: [record({ status: undefined })] }))).toThrow(
			/Invalid Objective list record/,
		);
		expect(() => parseObjectiveList(envelope({ records: [record({ status: 123 })] }))).toThrow(
			/Invalid Objective list record/,
		);
	});

	test("rejects latest_update_iso values that are neither string nor null", () => {
		expect(() => parseObjectiveList(envelope({ records: [record({ latest_update_iso: undefined })] }))).toThrow(
			/Invalid Objective list record/,
		);
		expect(() => parseObjectiveList(envelope({ records: [record({ latest_update_iso: 123 })] }))).toThrow(
			/Invalid Objective list record/,
		);
	});

	test("rejects old branch-projection envelopes", () => {
		expect(() =>
			parseObjectiveList(
				JSON.stringify({
					exit_code: 0,
					data: {
						base_branch: "main",
						trunk_branch: "main",
						view: "list",
						status_filter: "active",
						current_branch: null,
						filtered_to_current: false,
						names_only: false,
						groups: [],
					},
				}),
			),
		).toThrow(/expected trunk_branch, root_path, status_filter, names_only, and records/);
	});
});

function envelope(dataOverrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			trunk_branch: "main",
			root_path: ".asdl/objectives",
			status_filter: "active",
			names_only: false,
			records: [record()],
			...dataOverrides,
		},
	});
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		slug: "alpha",
		status: "open",
		latest_update_iso: "2026-05-20T10:00:00Z",
		...overrides,
	};
}
