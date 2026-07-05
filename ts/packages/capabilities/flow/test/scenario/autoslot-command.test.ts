import { describe, expect, test } from "vitest";
import { stripAnsi } from "@ns/clinkr/testing";

import {
	autoslotStatusProbeFailExec,
	branchLatestCommitChildBranchRefusalExec,
	runFlowAutoslotCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls } from "./ns-cli-fakes.ts";

// `ns flow autoslot` routes through the Flow CLI runner (`runFlowCli` → `runAutoslotCli`), which
// renders durable outcomes in the house style next to where their facts are computed. The happy
// slot-move path uses a real `SlotClient`; these scenarios pin the wrapper's caps resolution +
// stdout/stderr routing on the outcomes that settle before slot checkout.
describe("flow autoslot command outcomes", () => {
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
		expect(stderr).toContain("Cwd: /work");
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
		expect(stderr).toContain("Cwd: /work");
		// No branch creation and no slot checkout occurred.
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
		expect(calls.some((call) => call.includes("stash"))).toBe(false);
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
