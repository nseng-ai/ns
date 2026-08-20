import { describe, expect, test } from "vitest";

import {
	FLOW_COMMAND_SPECS,
	FLOW_SUBMIT_CHECK_FAILURE_MARKER,
	flowSkillBackedCommandRegistrations,
	resolveFlowSubmitCheckRecovery,
	runFlowStackSquash,
	runTrunkPullDetailed,
} from "../../src/api/index.ts";

const EXPECTED_COMMAND_SURFACES = [
	{
		id: "flow:changes",
		provider: undefined,
		argvPrefix: ["flow", "changes"],
		displayName: "flow changes",
		piSurface: "ns:flow:changes",
	},
	{
		id: "flow:cp",
		provider: undefined,
		argvPrefix: ["flow", "cp"],
		displayName: "flow cp",
		piSurface: "ns:flow:cp",
	},
	{
		id: "flow:gt:autobranch",
		provider: "graphite",
		argvPrefix: ["flow", "gt", "autobranch"],
		displayName: "flow gt autobranch",
		piSurface: "ns:flow:gt:autobranch",
	},
	{
		id: "flow:gt:branch-latest-commit",
		provider: "graphite",
		argvPrefix: ["flow", "gt", "branch-latest-commit"],
		displayName: "flow gt branch-latest-commit",
		piSurface: "ns:flow:gt:branch-latest-commit",
	},
	{
		id: "flow:gt:autoslot",
		provider: "graphite",
		argvPrefix: ["flow", "gt", "autoslot"],
		displayName: "flow gt autoslot",
		piSurface: "ns:flow:gt:autoslot",
	},
	{
		id: "flow:gt:submit",
		provider: "graphite",
		argvPrefix: ["flow", "gt", "submit"],
		displayName: "flow gt submit",
		piSurface: "ns:flow:gt:submit",
	},
	{
		id: "flow:generate-pr-inventory",
		provider: undefined,
		argvPrefix: ["flow", "generate-pr-inventory"],
		displayName: "flow generate-pr-inventory",
		piSurface: "ns:flow:generate-pr-inventory",
	},
	{
		id: "flow:push",
		provider: undefined,
		argvPrefix: ["flow", "push"],
		displayName: "flow push",
		piSurface: "ns:flow:push",
	},
	{
		id: "flow:gt:land",
		provider: "graphite",
		argvPrefix: ["flow", "gt", "land"],
		displayName: "flow gt land",
		piSurface: "ns:flow:gt:land",
	},
	{
		id: "flow:pull-trunk",
		provider: undefined,
		argvPrefix: ["flow", "pull-trunk"],
		displayName: "flow pull-trunk",
		piSurface: "ns:flow:pull-trunk",
	},
	{
		id: "flow:gt:squash-stack",
		provider: "graphite",
		argvPrefix: ["flow", "gt", "squash-stack"],
		displayName: "flow gt squash-stack",
		piSurface: "ns:flow:gt:squash-stack",
	},
] as const;

describe("flow extension API", () => {
	test("exports the exact submit-check failure marker", () => {
		expect(FLOW_SUBMIT_CHECK_FAILURE_MARKER).toBe("NS_FLOW_SUBMIT_CHECK_FAILURE");
	});

	test("removes the obsolete Autoslot CLI adapter from the curated API", async () => {
		const api = await import("../../src/api/index.ts");

		expect(api).not.toHaveProperty("runAutoslotCli");
	});

	test("publishes stable unique identities and explicit command surfaces", () => {
		expect(
			FLOW_COMMAND_SPECS.map(({ id, provider, argvPrefix, displayName, piSurface }) => ({
				id,
				provider,
				argvPrefix,
				displayName,
				piSurface,
			})),
		).toEqual(EXPECTED_COMMAND_SURFACES);
		expect(new Set(FLOW_COMMAND_SPECS.map((command) => command.id)).size).toBe(
			FLOW_COMMAND_SPECS.length,
		);
		expect(new Set(FLOW_COMMAND_SPECS.map((command) => command.piSurface)).size).toBe(
			FLOW_COMMAND_SPECS.length,
		);
	});

	test("exports cohesive host-independent Flow interfaces", () => {
		expect(FLOW_COMMAND_SPECS).toHaveLength(11);
		expect(flowSkillBackedCommandRegistrations).toHaveLength(4);
		expect(resolveFlowSubmitCheckRecovery).toBeTypeOf("function");
		expect(runFlowStackSquash).toBeTypeOf("function");
		expect(runTrunkPullDetailed).toBeTypeOf("function");
	});
});
