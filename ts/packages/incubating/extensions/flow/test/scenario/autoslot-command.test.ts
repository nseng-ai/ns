import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	autobranchGtCreateFailExec,
	autoslotBranchCreatedExec,
	autoslotStatusProbeFailExec,
	autoslotGhStackDirtyExec,
	autoslotGhStackUntrackedTrunkExec,
	branchLatestCommitChildBranchRefusalExec,
	branchLatestCommitGhStackExec,
	runFlowAutoslotCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls } from "./ns-cli-fakes.ts";

const CHECKPOINT_MESSAGE = "[cp] Move pending work\n\n- Preserve current changes";

describe("flow gt autoslot command outcomes", () => {
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

describe("flow gs autoslot command outcomes", () => {
	test.each([
		["tracked", true],
		["untracked non-trunk", false],
	] as const)(
		"moves a branch created from a dirty %s source into one Slot",
		async (_label, tracked) => {
			const run = runFlowAutoslotCommandWithFakes({
				provider: "gh-stack",
				state: {
					exec: autoslotGhStackDirtyExec({ tracked }),
					textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
				},
			});

			expect(await run.exit).toBe(0);
			expect(await run.result).toMatchObject({
				status: "success",
				data: {
					type: "moved",
					branchName: "move-work",
					slotName: "slot-03",
					worktreePath: "/slots/slot-03",
					warnings: [],
					navigationCommand: "ns slot co move-work",
				},
			});
			expect(run.slotClient.checkoutCurrentCalls).toHaveLength(1);
			const calls = formattedExecCalls(run.context);
			expect(calls).toContain("gh stack add move-work");
			expect(calls.some((call) => call.startsWith("gt "))).toBe(false);
			expect(calls.filter((call) => call === "gh stack init feature/source")).toHaveLength(
				tracked ? 0 : 1,
			);
		},
	);

	test("refuses an untracked Git trunk before stash, provider mutation, or Slot checkout", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			provider: "gh-stack",
			state: {
				exec: autoslotGhStackUntrackedTrunkExec(),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.result).toMatchObject({
			status: "negative",
			data: {
				type: "refused",
				cwd: run.context.cwd,
				reason: "autobranch-refused",
				message:
					"Refusing to initialize github/gh-stack on Git trunk main. Create or check out a non-trunk source branch first.",
			},
		});
		expect(await run.exit).toBe(1);
		expect(stripAnsi(run.stderr.join(""))).toContain(
			"Autoslot did not create a github/gh-stack branch.",
		);
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(0);
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("git stash"))).toBe(false);
		expect(calls.some((call) => call.startsWith("gh stack init"))).toBe(false);
		expect(calls.some((call) => call.startsWith("gh stack add"))).toBe(false);
	});

	test("moves a clean latest commit through real preparation, recovery, adoption, verification, and Slot checkout", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			provider: "gh-stack",
			request: { slug: "demo-branch" },
			state: { exec: branchLatestCommitGhStackExec(), textGeneration: [] },
			slotResult: {
				ok: true,
				target: {
					slotName: "slot-03",
					branchName: "demo-branch",
					worktreePath: "/slots/slot-03",
					isAlreadyAssigned: false,
					hasCreatedBranch: false,
					currentWorktreeNote: null,
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(await run.machineEnvelope).toMatchObject({
			status: "success",
			exitCode: 0,
			data: {
				type: "moved",
				branchName: "demo-branch",
				slotName: "slot-03",
				worktreePath: "/slots/slot-03",
				warnings: [],
				navigationCommand: "ns slot co demo-branch",
			},
		});
		const calls = formattedExecCalls(run.context);
		expect(
			calls.some((call) => /^git branch autobranch-backup\/feature\/\d+ abc123$/u.test(call)),
		).toBe(true);
		expect(calls).toContain("git branch demo-branch abc123");
		expect(calls).toContain("git reset --hard parent456");
		expect(calls).toContain("gh stack add demo-branch");
		expect(calls).toContain("git rev-parse --verify refs/heads/feature");
		expect(calls).toContain("git rev-parse --verify refs/heads/demo-branch");
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(1);
	});

	test("reports the provider branch and skips Slot when actual completion is not clean", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			provider: "gh-stack",
			state: {
				exec: autoslotGhStackDirtyExec({ tracked: true }).map((response, index, all) =>
					index === all.length - 1
						? { ...response, result: { stdout: " M generated.txt\n" } }
						: response,
				),
				textGeneration: [{ ok: true, text: CHECKPOINT_MESSAGE }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(await run.result).toMatchObject({
			status: "success",
			data: {
				type: "branch-created-slot-skipped",
				branchName: "move-work",
				reason: "worktree-not-clean",
			},
		});
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(0);
	});

	test("preserves an actually-created provider branch when Slot checkout fails", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			provider: "gh-stack",
			state: {
				exec: autoslotGhStackDirtyExec({ tracked: true }),
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
			data: { type: "branch-created-slot-failed", branchName: "move-work" },
		});
		expect(run.slotClient.checkoutCurrentCalls).toHaveLength(1);
	});
});
