import { describe, expect, test } from "vitest";

import { parseObjectiveList } from "../src/objective-list.ts";

describe("parseObjectiveList", () => {
	test("parses the current objective list JSON shape", () => {
		const parsed = parseObjectiveList(envelope());

		expect(parsed).toEqual({
			type: "valid",
			list: {
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
			},
		});
	});

	test("parses null latest update timestamps", () => {
		const parsed = parseObjectiveList(envelope({ records: [record({ latestUpdateIso: null })] }));

		expect(parsed.type).toBe("valid");
		if (parsed.type === "valid") {
			expect(parsed.list.records[0]?.latestUpdateIso).toBeNull();
		}
	});

	test("rejects invalid JSON", () => {
		expectInvalid(parseObjectiveList("{"), /objective list JSON/);
	});

	test("rejects a non-object envelope", () => {
		expectInvalid(parseObjectiveList("[]"), /expected an envelope object/);
	});

	test("rejects a nonzero envelope exit code", () => {
		expectInvalid(parseObjectiveList(JSON.stringify({ exit_code: 2, data: {} })), /exit_code 2/);
	});

	test("rejects missing data", () => {
		expectInvalid(parseObjectiveList(JSON.stringify({ exit_code: 0 })), /expected a data object/);
	});

	test("rejects invalid top-level fields", () => {
		expectInvalid(parseObjectiveList(envelope({ trunkBranch: 42 })), /expected trunkBranch/);
	});

	test("rejects missing records", () => {
		expectInvalid(parseObjectiveList(envelope({ records: undefined })), /expected trunkBranch/);
	});

	test("rejects missing or non-string slug", () => {
		expectInvalid(
			parseObjectiveList(envelope({ records: [record({ slug: undefined })] })),
			/Invalid Objective list record/,
		);
		expectInvalid(
			parseObjectiveList(envelope({ records: [record({ slug: 123 })] })),
			/Invalid Objective list record/,
		);
	});

	test("rejects missing or non-string status", () => {
		expectInvalid(
			parseObjectiveList(envelope({ records: [record({ status: undefined })] })),
			/Invalid Objective list record/,
		);
		expectInvalid(
			parseObjectiveList(envelope({ records: [record({ status: 123 })] })),
			/Invalid Objective list record/,
		);
	});

	test("rejects latestUpdateIso values that are neither string nor null", () => {
		expectInvalid(
			parseObjectiveList(envelope({ records: [record({ latestUpdateIso: undefined })] })),
			/Invalid Objective list record/,
		);
		expectInvalid(
			parseObjectiveList(envelope({ records: [record({ latestUpdateIso: 123 })] })),
			/Invalid Objective list record/,
		);
	});

	test("rejects old branch-projection envelopes", () => {
		expectInvalid(
			parseObjectiveList(
				JSON.stringify({
					exit_code: 0,
					data: {
						base_branch: "main",
						trunkBranch: "main",
						view: "list",
						statusFilter: "active",
						current_branch: null,
						filtered_to_current: false,
						namesOnly: false,
						groups: [],
					},
				}),
			),
			/expected trunkBranch, rootPath, statusFilter, namesOnly, and records/,
		);
	});
});

type ObjectiveListResult = ReturnType<typeof parseObjectiveList>;

function expectInvalid(result: ObjectiveListResult, pattern: RegExp): void {
	expect(result.type).toBe("invalid");
	if (result.type === "invalid") {
		expect(result.message).toMatch(pattern);
	}
}

function envelope(dataOverrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			trunkBranch: "main",
			rootPath: ".asdl/objectives",
			statusFilter: "active",
			namesOnly: false,
			records: [record()],
			...dataOverrides,
		},
	});
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		slug: "alpha",
		status: "open",
		latestUpdateIso: "2026-05-20T10:00:00Z",
		...overrides,
	};
}
