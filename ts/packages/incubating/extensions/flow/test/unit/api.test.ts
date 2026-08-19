import { describe, expect, test } from "vitest";

import {
	FLOW_COMMAND_SPECS,
	FLOW_SUBMIT_CHECK_FAILURE_MARKER,
	flowSkillBackedCommandRegistrations,
	nsFlowCommandSurface,
	resolveFlowSubmitCheckRecovery,
	runFlowStackSquash,
	runTrunkPullDetailed,
} from "../../src/api/index.ts";

describe("flow extension API", () => {
	test("exports the exact submit-check failure marker", () => {
		expect(FLOW_SUBMIT_CHECK_FAILURE_MARKER).toBe("NS_FLOW_SUBMIT_CHECK_FAILURE");
	});

	test("removes the obsolete Autoslot CLI adapter from the curated API", async () => {
		const api = await import("../../src/api/index.ts");

		expect(api).not.toHaveProperty("runAutoslotCli");
	});

	test.each([
		["autobranch", "ns:flow:gt:autobranch"],
		["branch-latest-commit", "ns:flow:gt:branch-latest-commit"],
		["autoslot", "ns:flow:gt:autoslot"],
		["submit", "ns:flow:gt:submit"],
		["land", "ns:flow:gt:land"],
		["squash-stack", "ns:flow:gt:squash-stack"],
		["changes", "ns:flow:changes"],
	] as const)("maps %s to its Pi command surface", (command, expectedSurface) => {
		expect(nsFlowCommandSurface(command)).toBe(expectedSurface);
	});

	test("exports cohesive host-independent Flow interfaces", () => {
		expect(FLOW_COMMAND_SPECS).toHaveLength(11);
		expect(flowSkillBackedCommandRegistrations).toHaveLength(4);
		expect(resolveFlowSubmitCheckRecovery).toBeTypeOf("function");
		expect(runFlowStackSquash).toBeTypeOf("function");
		expect(runTrunkPullDetailed).toBeTypeOf("function");
	});
});
