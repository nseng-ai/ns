import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	autobranchGtCreateFailExec,
	autoslotBranchCreatedExec,
	autoslotStatusProbeFailExec,
	branchLatestCommitChildBranchRefusalExec,
	runFlowAutoslotCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls } from "./ns-cli-fakes.ts";

const CHECKPOINT_MESSAGE = "[cp] Move pending work\n\n- Preserve current changes";

describe("flow autoslot command outcomes", () => {
	test("guardrail refusal is negative with structured no-mutation data", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: { exec: branchLatestCommitChildBranchRefusalExec(), textGeneration: [] },
		});

		expect(await run.exit).toBe(1);
		expect(await run.result).toMatchObject({
			status: "negative",
			data: {
				type: "refused",
				reason: "autobranch-refused",
			},
		});
		expect(await run.machineEnvelope).toMatchObject({
			status: "negative",
			exitCode: 1,
			data: { type: "refused", reason: "autobranch-refused" },
		});
		expect(run.stdout.join("")).toBe("");
		expect(stripAnsi(run.stderr.join(""))).toContain("Autoslot did not create a Graphite branch.");
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(0);
	});

	test("operational failure before branch creation is failure", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: { exec: autoslotStatusProbeFailExec(), textGeneration: [] },
		});

		expect(await run.exit).toBe(2);
		expect(await run.result).toMatchObject({
			status: "failure",
			errorType: "flow-command-failed",
			data: { type: "failed", cause: "autobranch-failed" },
		});
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Autoslot could not create a Graphite branch.");
		expect(stderr).toContain("Could not inspect git status.");
		expect(stderr).toContain("fatal: status failed");
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(0);
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
	});

	test("created branch with dirty worktree is successful partial completion", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autoslotBranchCreatedExec({ isClean: false }),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(await run.result).toEqual({
			status: "success",
			data: {
				type: "branch-created-slot-skipped",
				cwd: run.context.cwd,
				branchName: "move-work",
				warnings: [],
				reason: "worktree-not-clean",
			},
		});
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Autoslot created move-work, but slot movement was skipped.");
		expect(stdout).not.toContain("Autoslot completed.");
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(0);
	});

	test("slot checkout failure retains the created branch in structured failure data", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autoslotBranchCreatedExec(),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
			slotResult: {
				ok: false,
				failure: { errorType: "slot-unavailable", message: "No free slot." },
			},
		});

		expect(await run.exit).toBe(2);
		expect(await run.result).toMatchObject({
			status: "failure",
			data: {
				type: "branch-created-slot-failed",
				branchName: "move-work",
				failure: { errorType: "slot-unavailable", message: "No free slot." },
			},
		});
		expect(stripAnsi(run.stderr.join(""))).toContain(
			"Autoslot created move-work, but ns slot checkout failed.",
		);
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(1);
	});

	test("successful slot movement returns structured navigation facts", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autoslotBranchCreatedExec(),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(await run.result).toEqual({
			status: "success",
			data: {
				type: "moved",
				cwd: run.context.cwd,
				branchName: "move-work",
				slotName: "slot-03",
				worktreePath: "/slots/slot-03",
				warnings: [],
				navigationCommand: "ns slot co move-work",
			},
		});
		expect(await run.machineEnvelope).toEqual({
			status: "success",
			exitCode: 0,
			data: {
				type: "moved",
				cwd: run.context.cwd,
				branchName: "move-work",
				slotName: "slot-03",
				worktreePath: "/slots/slot-03",
				warnings: [],
				navigationCommand: "ns slot co move-work",
			},
		});
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Autoslot moved move-work to slot-03.");
		expect(stdout).toContain("Worktree: /slots/slot-03");
		expect(stdout).toContain("ns slot co move-work");
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(1);
	});

	test("uses the command context text generator and keeps phases on live stderr", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autobranchGtCreateFailExec(),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.context.textGeneratorCalls[0]).toMatchObject({ operation: "checkpoint-message" });
		expect(run.liveOutput).toContainEqual({ stream: "stderr", text: "Inspecting worktree…\n" });
		expect(run.liveOutput.some((entry) => entry.stream === "stdout")).toBe(false);
	});
});
