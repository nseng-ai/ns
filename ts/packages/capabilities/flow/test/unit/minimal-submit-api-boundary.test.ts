import { describe, expect, test } from "vitest";

import { ScriptedCommandExecApi, exitedResult } from "@nseng-ai/foundation/exec/testing";
import {
	createFlowMinimalSubmitClient,
	FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS,
	type FlowMinimalSubmitClient,
	type FlowMinimalSubmitError,
	type FlowMinimalSubmitErrorCode,
} from "@nseng-ai/flow/api";

const HEAD = "a".repeat(40);

describe("Flow minimal-submit Capability API", () => {
	test("exports the closed error contract and shared dirty-path limit", () => {
		const code: FlowMinimalSubmitErrorCode = "flow-minimal-submit-topology-ancestor-cycle";
		const error: FlowMinimalSubmitError = {
			code,
			message: "cycle",
			displayCommand: "git show-ref --verify refs/remotes/origin/demo",
		};

		expect(error.code).toBe(code);
		expect(FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS).toBe(50);
	});

	test("binds source and Graphite planning reads to the caller-provided command channel", async () => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({ stdout: "feature/demo\n" }),
			exitedResult({ stdout: `${HEAD}\n` }),
			exitedResult({ stdout: "" }),
			exitedResult({ code: 1, stderr: "not a repository\n" }),
		]);
		const client: FlowMinimalSubmitClient = createFlowMinimalSubmitClient({
			cwd: "/repo",
			commands,
		});

		expect(await client.planCurrentBranch()).toMatchObject({
			type: "failed",
			stage: "planning",
			error: { code: "flow-minimal-submit-topology-provider-failure" },
		});
		expect(commands.calls()).toEqual([
			{
				command: "git",
				args: ["branch", "--show-current"],
				options: { cwd: "/repo", timeout: 10_000 },
			},
			{
				command: "git",
				args: ["rev-parse", "HEAD"],
				options: { cwd: "/repo", timeout: 10_000 },
			},
			{
				command: "git",
				args: ["status", "--porcelain=v1", "-z"],
				options: { cwd: "/repo", timeout: 10_000 },
			},
			{
				command: "git",
				args: ["rev-parse", "--git-common-dir"],
				options: { cwd: "/repo", timeout: 10_000 },
			},
		]);
	});

	test("planned execution accepts only the authorized plan as its source identity", () => {
		const plannedInput = {
			type: "planned",
			expectedPlan: {
				source: { branch: "feature/demo", headSha: HEAD },
				trunkBranch: "main",
				affectedBranches: ["feature/demo"],
			},
		} as const satisfies Parameters<FlowMinimalSubmitClient["submitCurrentBranch"]>[0];

		expect(plannedInput.expectedPlan.source).toEqual({
			branch: "feature/demo",
			headSha: HEAD,
		});

		const contradictoryInput = {
			type: "planned",
			expectedSource: { branch: "feature/other", headSha: HEAD },
			expectedPlan: plannedInput.expectedPlan,
		};
		// @ts-expect-error Planned submission cannot carry an independent expected source.
		const invalidInput: Parameters<FlowMinimalSubmitClient["submitCurrentBranch"]>[0] =
			contradictoryInput;
		expect(invalidInput.type).toBe("planned");
	});

	test("does not leak submit gateways, runtimes, or presentation results", async () => {
		const flowApi = await import("@nseng-ai/flow/api");
		expect(Object.keys(flowApi)).not.toEqual(
			expect.arrayContaining([
				"RealSubmitGateway",
				"createNsSubmitRuntime",
				"runSubmitCommand",
				"SubmitCommandResult",
			]),
		);
	});
});
