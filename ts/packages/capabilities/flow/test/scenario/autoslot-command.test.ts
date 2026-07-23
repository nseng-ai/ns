import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	autobranchGtCreateFailExec,
	autoslotHappyExec,
	autoslotStatusProbeFailExec,
	branchLatestCommitChildBranchRefusalExec,
	runFlowAutoslotCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls } from "./ns-cli-fakes.ts";

// `ns flow autoslot` routes through the Flow CLI runner (`runFlowCli` → `runAutoslotCli`), which
// renders durable outcomes in the house style next to where their facts are computed. Slot placement
// crosses the injected command-exec seam, so the complete path remains fake-driven here.
describe("flow autoslot command outcomes", () => {
	test("creates a branch and moves it through the Slots CLI boundary", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autoslotHappyExec(),
				textGeneration: [
					{ ok: true, text: "[cp] Move autoslot work\n\n- Preserve pending changes" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Autoslot moved move-work to slot-03.");
		expect(stdout).toContain("Worktree: /slots/repos/work/worktrees/slot-03");
		expect(stdout).toContain("ns slot co move-work");
		expect(formattedExecCalls(run.context)).toContain(
			"ns slot checkout --current --no-clipboard --format json",
		);
	});

	test("keeps successful placement and guidance when the parent-shell directive write fails", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autoslotHappyExec({
					status: "failed",
					path: "/missing-parent/ns-cd",
					failureDetail: "parent directory does not exist",
				}),
				textGeneration: [
					{ ok: true, text: "[cp] Move autoslot work\n\n- Preserve pending changes" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stderr.join(""))).toContain(
			"Slot checkout succeeded, but the parent-shell navigation directive could not be written",
		);
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Autoslot moved move-work to slot-03.");
		expect(stdout).toContain("ns slot co move-work");
	});

	test("snapshot probe failure exits 1 on stderr with a house-style failure block", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: { exec: autoslotStatusProbeFailExec(), textGeneration: [] },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Autoslot could not create a Graphite branch.");
		expect(stderr).toContain("Could not inspect git status.");
		// The failed git probe transcript is preserved in the failure body.
		expect(stderr).toContain("fatal: status failed");
		expect(stderr).toContain(`Cwd: ${run.context.cwd}`);
		// The slot checkout is never attempted, so no Graphite branch is created either.
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
	});

	test("clean worktree with Graphite children refuses as warn on stderr and skips slot checkout", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: { exec: branchLatestCommitChildBranchRefusalExec(), textGeneration: [] },
		});

		// A declined eligibility guardrail still flips the exit code, but renders as a first-class warn
		// refusal (house-style §7.3), not a red failure.
		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Autoslot did not create a Graphite branch.");
		expect(stderr).toContain(`Cwd: ${run.context.cwd}`);
		// No branch creation and no slot checkout occurred.
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
		expect(calls.some((call) => call.includes("stash"))).toBe(false);
	});

	test("injects the command context text generator into checkpoint generation", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: {
				exec: autobranchGtCreateFailExec(),
				textGeneration: [
					{
						ok: true,
						text: "[cp] Checkpoint autoslot work\n\n- Prove injected generation",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]).toMatchObject({
			operation: "checkpoint-message",
		});
	});

	test("transient phases route through onOutput on stderr, never stdout", async () => {
		const run = runFlowAutoslotCommandWithFakes({
			state: { exec: autoslotStatusProbeFailExec(), textGeneration: [] },
		});

		await run.exit;
		// Flow CLI `NsCommandIo` phases are transient stderr-side progress (`onOutput`), keeping stdout clean.
		expect(run.liveOutput).toContainEqual({ stream: "stderr", text: "Inspecting worktree…\n" });
		expect(run.liveOutput.some((entry) => entry.stream === "stdout")).toBe(false);
	});
});
