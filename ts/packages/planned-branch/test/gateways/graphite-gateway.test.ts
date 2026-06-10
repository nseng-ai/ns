import { describe, expect, test } from "vitest";

import type { ExecResult } from "@asdl/core/exec";
import { RealPlannedBranchGraphiteGateway } from "../../src/graphite-gateway.ts";
import type { CommandExecApi, ExecOptions } from "@asdl/core/exec";
import { InMemoryPlannedBranchGraphiteGateway } from "../support/in-memory-graphite-gateway.ts";

const ROOT = "/repo";
const BRANCH = "planned-branches/branch-scoped-plan";
const PARENT_BRANCH = "feature/source-plan";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: Partial<ExecResult>;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

class ScriptedCommands implements CommandExecApi {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: readonly ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if ("error" in expected) throw expected.error;
		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function errorStep(command: string, args: string[], error: Error): ScriptedExec {
	return { command, args, error };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function infoArgs(branch = PARENT_BRANCH): string[] {
	return ["info", branch, "--no-interactive"];
}

function trackArgs(branch = BRANCH, parentBranch = PARENT_BRANCH): string[] {
	return ["track", branch, "--parent", parentBranch, "--no-interactive"];
}

describe("in-memory planned-branch graphite gateway", () => {
	test("records trackedness checks and succeeds by default", async () => {
		const graphite = new InMemoryPlannedBranchGraphiteGateway();

		expect(await graphite.checkBranchTracked({ cwd: ROOT, branch: PARENT_BRANCH })).toEqual({ ok: true, tracked: true });
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: ROOT, branch: PARENT_BRANCH }]);
	});

	test("returns configured untracked branch checks", async () => {
		const graphite = new InMemoryPlannedBranchGraphiteGateway({
			untrackedBranches: [PARENT_BRANCH],
			untrackedDetail: "untracked parent",
		});

		expect(await graphite.checkBranchTracked({ cwd: ROOT, branch: PARENT_BRANCH })).toEqual({ ok: true, tracked: false, detail: "untracked parent" });
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: ROOT, branch: PARENT_BRANCH }]);
	});

	test("records track calls and succeeds by default", async () => {
		const graphite = new InMemoryPlannedBranchGraphiteGateway();

		expect(await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH })).toEqual({ ok: true });
		expect(graphite.trackBranchCalls).toEqual([{ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH }]);
	});

	test("returns configured track failures", async () => {
		const graphite = new InMemoryPlannedBranchGraphiteGateway({
			trackFailure: { code: "graphite_track_failed", message: "Graphite failed." },
		});

		expect(await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH })).toEqual({
			ok: false,
			error: { code: "graphite_track_failed", message: "Graphite failed." },
		});
		expect(graphite.trackBranchCalls).toEqual([{ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH }]);
	});
});

describe("real planned-branch graphite gateway", () => {
	test("preserves trackedness command protocol", async () => {
		const commands = new ScriptedCommands([step("gt", infoArgs())]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		expect(await graphite.checkBranchTracked({ cwd: ROOT, branch: PARENT_BRANCH })).toEqual({ ok: true, tracked: true });
		commands.assertDone();
		expect(commands.execCalls).toEqual([{ command: "gt", args: infoArgs(), options: { cwd: ROOT, timeout: 30_000 } }]);
	});

	test("threads AbortSignal into the trackedness command", async () => {
		const controller = new AbortController();
		const commands = new ScriptedCommands([step("gt", infoArgs())]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		expect(await graphite.checkBranchTracked({ cwd: ROOT, branch: PARENT_BRANCH, signal: controller.signal })).toEqual({ ok: true, tracked: true });
		commands.assertDone();
		expect(commands.execCalls[0]?.options).toEqual({ cwd: ROOT, timeout: 30_000, signal: controller.signal });
	});

	test("returns nonzero trackedness checks as untracked with detail", async () => {
		const commands = new ScriptedCommands([step("gt", infoArgs(), { code: 1, stderr: `ERROR: Cannot perform this operation on untracked branch ${PARENT_BRANCH}` })]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		const result = await graphite.checkBranchTracked({ cwd: ROOT, branch: PARENT_BRANCH });

		expect(result).toMatchObject({ ok: true, tracked: false });
		if (result.ok && !result.tracked) {
			expect(result.detail).toContain("gt info could not verify Graphite tracking");
			expect(result.detail).toContain(`Command: gt info ${PARENT_BRANCH} --no-interactive`);
			expect(result.detail).toContain("Cannot perform this operation on untracked branch");
		}
		commands.assertDone();
	});

	test("returns startup failures from trackedness checks as typed errors", async () => {
		const commands = new ScriptedCommands([errorStep("gt", infoArgs(), new Error("spawn gt ENOENT"))]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		const result = await graphite.checkBranchTracked({ cwd: ROOT, branch: PARENT_BRANCH });

		expect(result).toMatchObject({ ok: false, error: { code: "graphite_startup_failed" } });
		if (!result.ok) {
			expect(result.error.message).toContain("gt command failed before completion");
			expect(result.error.message).toContain(`Command: gt info ${PARENT_BRANCH} --no-interactive`);
			expect(result.error.message).toContain("spawn gt ENOENT");
		}
		commands.assertDone();
	});

	test("preserves track command protocol", async () => {
		const commands = new ScriptedCommands([step("gt", trackArgs())]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		expect(await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH })).toEqual({ ok: true });
		commands.assertDone();
		expect(commands.execCalls).toEqual([{ command: "gt", args: trackArgs(), options: { cwd: ROOT, timeout: 30_000 } }]);
	});

	test("threads AbortSignal into the track command", async () => {
		const controller = new AbortController();
		const commands = new ScriptedCommands([step("gt", trackArgs())]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		expect(await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH, signal: controller.signal })).toEqual({ ok: true });
		commands.assertDone();
		expect(commands.execCalls[0]?.options).toEqual({ cwd: ROOT, timeout: 30_000, signal: controller.signal });
	});

	test("returns nonzero track failures as typed errors", async () => {
		const commands = new ScriptedCommands([step("gt", trackArgs(), { code: 2, stderr: "parent branch is not tracked" })]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		const result = await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH });

		expect(result).toMatchObject({ ok: false, error: { code: "graphite_track_failed", displayCommand: `gt track ${BRANCH} --parent ${PARENT_BRANCH} --no-interactive` } });
		if (!result.ok) {
			expect(result.error.message).toContain("gt track failed");
			expect(result.error.message).toContain(`Command: gt track ${BRANCH} --parent ${PARENT_BRANCH} --no-interactive`);
			expect(result.error.message).toContain("parent branch is not tracked");
		}
		commands.assertDone();
	});

	test("returns killed track failures with timeout wording", async () => {
		const commands = new ScriptedCommands([step("gt", trackArgs(), { code: 124, killed: true })]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		const result = await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH });

		expect(result).toMatchObject({ ok: false, error: { code: "graphite_track_failed" } });
		if (!result.ok) {
			expect(result.error.message).toContain("process was killed or timed out");
		}
		commands.assertDone();
	});

	test("returns startup failures as typed errors", async () => {
		const commands = new ScriptedCommands([errorStep("gt", trackArgs(), new Error("spawn gt ENOENT"))]);
		const graphite = new RealPlannedBranchGraphiteGateway(commands);

		const result = await graphite.trackBranch({ cwd: ROOT, branch: BRANCH, parentBranch: PARENT_BRANCH });

		expect(result).toMatchObject({ ok: false, error: { code: "graphite_startup_failed" } });
		if (!result.ok) {
			expect(result.error.message).toContain("gt command failed before completion");
			expect(result.error.message).toContain(`Command: gt track ${BRANCH} --parent ${PARENT_BRANCH} --no-interactive`);
			expect(result.error.message).toContain("spawn gt ENOENT");
		}
		commands.assertDone();
	});
});
