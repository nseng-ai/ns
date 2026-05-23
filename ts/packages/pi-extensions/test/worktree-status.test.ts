import { describe, expect, test } from "bun:test";

import { formatGtStatus, loadGtStatus, type ExecResult } from "../src/worktree-status.ts";

const ROOT = "/repo";

type ExecCall = {
	command: string;
	args: string[];
};

type ScriptedExec = {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
};

class FakePi {
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function gtParentStep(result: Partial<ExecResult>): ScriptedExec {
	return step("gt", ["parent"], result);
}

function gtChildrenStep(result: Partial<ExecResult> = {}): ScriptedExec {
	return step("gt", ["children"], result);
}

function revListStep(base: string, count: number): ScriptedExec {
	return step("git", ["rev-list", "--count", `${base}..HEAD`], { stdout: `${count}\n` });
}

function dirtyStep(stdout = ""): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout });
}

async function loadFormattedStatus(script: ScriptedExec[]): Promise<{ pi: FakePi; formatted: string }> {
	const pi = new FakePi(script);
	const status = await loadGtStatus(pi, ROOT);
	return { pi, formatted: formatGtStatus(status) };
}

describe("worktree status formatting", () => {
	test("formats the empty branch icon for zero branch-local commits", () => {
		expect(formatGtStatus({ down: "main", up: "-", commits: "no", dirty: "no" })).toBe("[gt] (↓: main) (↑: -) ∅");
	});

	test("formats commits, unknown commits, and dirty state", () => {
		expect(formatGtStatus({ down: "main", up: "-", commits: "yes", dirty: "no" })).toBe(
			"[gt] (↓: main) (↑: -) (commits)",
		);
		expect(formatGtStatus({ down: "main", up: "-", commits: "?", dirty: "no" })).toBe(
			"[gt] (↓: main) (↑: -) (commits: ?)",
		);
		expect(formatGtStatus({ down: "main", up: "-", commits: "no", dirty: "yes" })).toBe(
			"[gt] (↓: main) (↑: -) ∅ (x)",
		);
	});
});

describe("loadGtStatus", () => {
	test("uses Graphite parent and shows the empty icon for zero commits", async () => {
		const { pi, formatted } = await loadFormattedStatus([
			gtParentStep({ stdout: "main\n" }),
			gtChildrenStep(),
			revListStep("main", 0),
			dirtyStep(),
		]);

		pi.assertDone();
		expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
	});

	test("uses Graphite parent and shows commits when branch-local commits exist", async () => {
		const { pi, formatted } = await loadFormattedStatus([
			gtParentStep({ stdout: "main\n" }),
			gtChildrenStep(),
			revListStep("main", 2),
			dirtyStep(),
		]);

		pi.assertDone();
		expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		expect(formatted).not.toContain("∅");
	});

	test("falls back to the previously checked-out local branch when Graphite parent is unavailable", async () => {
		const { pi, formatted } = await loadFormattedStatus([
			gtParentStep({ code: 1, stderr: "not tracked by Graphite" }),
			step("git", ["rev-parse", "--symbolic-full-name", "@{-1}"], { stdout: "refs/heads/main\n" }),
			step("git", ["show-ref", "--verify", "refs/heads/main"]),
			gtChildrenStep(),
			revListStep("main", 0),
			dirtyStep(),
		]);

		pi.assertDone();
		expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
	});

	test("reports unknown commits rather than a false empty branch when no base is found", async () => {
		const { pi, formatted } = await loadFormattedStatus([
			gtParentStep({ code: 1, stderr: "not tracked by Graphite" }),
			step("git", ["rev-parse", "--symbolic-full-name", "@{-1}"], { code: 1, stderr: "no previous checkout" }),
			gtChildrenStep(),
			dirtyStep(),
		]);

		pi.assertDone();
		expect(formatted).toBe("[gt] (↓: -) (↑: -) (commits: ?)");
		expect(formatted).not.toContain("∅");
	});

	test("combines dirty state with empty state", async () => {
		const { pi, formatted } = await loadFormattedStatus([
			gtParentStep({ stdout: "main\n" }),
			gtChildrenStep(),
			revListStep("main", 0),
			dirtyStep(" M file.txt\n"),
		]);

		pi.assertDone();
		expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅ (x)");
	});
});
