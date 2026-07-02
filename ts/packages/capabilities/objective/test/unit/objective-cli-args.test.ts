import { describe, expect, test } from "vitest";

import {
	completeObjectiveListArgs,
	parseObjectiveListArgTokens,
	parseObjectiveListArgs,
	type ObjectiveListArgsParseResult,
} from "../../src/api/index.ts";

describe("objective list argument policy", () => {
	test("completions advertise checkout-local options and status values", () => {
		expect(values("")).toEqual(["--names", "--minimal", "--status", "--help", "-h"]);
		expect(values("--status ")).toEqual(["all", "active", "open", "closed"]);
		expect(values("--status=o")).toEqual(["--status=open"]);
		expect(values("--view")).toEqual([]);
	});

	test("parses accepted checkout-local list arguments", () => {
		expect(parseObjectiveListArgs("--names --minimal --status all")).toEqual({
			type: "valid",
			args: {
				args: ["--names", "--minimal", "--status", "all"],
				isHelpRequested: false,
			},
		});
		expect(parseObjectiveListArgs("--status=closed")).toEqual({
			type: "valid",
			args: {
				args: ["--status", "closed"],
				isHelpRequested: false,
			},
		});
		expect(parseObjectiveListArgs("--help")).toEqual({
			type: "valid",
			args: { args: [], isHelpRequested: true },
		});
	});

	test("parses already-tokenized checkout-local list arguments", () => {
		expect(parseObjectiveListArgTokens(["--names", "--status", "open"])).toEqual({
			type: "valid",
			args: {
				args: ["--names", "--status", "open"],
				isHelpRequested: false,
			},
		});
	});

	test("rejects removed and unsupported list arguments", () => {
		expectInvalid(parseObjectiveListArgs("--current"), /--current is no longer supported/);
		expectInvalid(parseObjectiveListArgs("--view detail"), /--view is no longer supported/);
		expectInvalid(parseObjectiveListArgs("--status in-flight"), /Unsupported --status/);
		expectInvalid(parseObjectiveListArgs("--format json"), /--format is controlled/);
		expectInvalid(parseObjectiveListArgs("--json-schema"), /--json-schema is not supported/);
	});
});

function values(prefix: string): string[] {
	return completeObjectiveListArgs(prefix)?.map((item) => item.value) ?? [];
}

function expectInvalid(result: ObjectiveListArgsParseResult, pattern: RegExp): void {
	expect(result.type).toBe("invalid");
	if (result.type === "invalid") {
		expect(result.message).toMatch(pattern);
	}
}
