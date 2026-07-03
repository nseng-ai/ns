import { describe, expect, test } from "vitest";

import { parseObjectiveListData } from "../../src/api/index.ts";

describe("parseObjectiveListData", () => {
	test("parses the current objective list JSON shape", () => {
		const parsed = parseObjectiveListData(objectiveListPayload());

		expect(parsed).toEqual({
			type: "valid",
			list: objectiveListPayload(),
		});
	});

	test("parses null latest update timestamps", () => {
		const parsed = parseObjectiveListData(
			objectiveListPayload({ records: [record({ latestUpdateIso: null })] }),
		);

		expect(parsed.type).toBe("valid");
		if (parsed.type === "valid") {
			expect(parsed.list.records[0]?.latestUpdateIso).toBeNull();
		}
	});

	test("rejects non-object payloads", () => {
		const parsed = parseObjectiveListData("not an object");

		expect(parsed.type).toBe("invalid");
		if (parsed.type === "invalid") {
			expect(parsed.message).toMatch(/Invalid objective list JSON/);
		}
	});

	test("rejects invalid records", () => {
		const parsed = parseObjectiveListData(
			objectiveListPayload({
				records: JSON.parse('[{"slug":42}]') as ObjectiveRecordPayload[],
			}),
		);

		expect(parsed.type).toBe("invalid");
		if (parsed.type === "invalid") {
			expect(parsed.message).toMatch(/Invalid objective list JSON/);
		}
	});
});

interface ObjectiveRecordPayload {
	slug: string;
	status: "open" | "closed";
	latestUpdateIso: string | null;
	hasOutstandingChanges: boolean;
}

interface ObjectiveListPayload {
	trunkBranch: string;
	rootPath: string;
	statusFilter: "active";
	namesOnly: boolean;
	records: ObjectiveRecordPayload[];
}

function objectiveListPayload(overrides: Partial<ObjectiveListPayload> = {}): ObjectiveListPayload {
	const { records, ...rest } = overrides;
	const payload: ObjectiveListPayload = {
		trunkBranch: "main",
		rootPath: ".ji/objectives",
		statusFilter: "active",
		namesOnly: false,
		records: [record()],
	};
	return {
		...payload,
		...rest,
		records: records ?? payload.records,
	};
}

function record(overrides: Partial<ObjectiveRecordPayload> = {}): ObjectiveRecordPayload {
	return {
		slug: "alpha",
		status: "open",
		latestUpdateIso: "2026-05-20T10:00:00Z",
		hasOutstandingChanges: false,
		...overrides,
	};
}
