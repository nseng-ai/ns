import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { stripTerminalEscapes } from "../src/command-runtime.ts";
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

async function loadFormattedStatus(script: ScriptedExec[], root = ROOT): Promise<{ pi: FakePi; formatted: string }> {
	const pi = new FakePi(script);
	const status = await loadGtStatus(pi, root);
	return { pi, formatted: formatGtStatus(status) };
}

function makeGitRepo(branch: string, prInfos: unknown[]): string {
	const root = mkdtempSync(join(tmpdir(), "worktree-status-"));
	const gitDir = join(root, ".git");
	mkdirSync(gitDir);
	writeFileSync(join(gitDir, "HEAD"), `ref: refs/heads/${branch}\n`);
	writeFileSync(join(gitDir, ".graphite_pr_info"), `${JSON.stringify({ prInfos })}\n`);
	return root;
}

function basicGtScript(): ScriptedExec[] {
	return [gtParentStep({ stdout: "main\n" }), gtChildrenStep(), revListStep("main", 1), dirtyStep()];
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

	test("formats associated PR numbers as terminal hyperlinks", () => {
		const formatted = formatGtStatus({
			down: "main",
			up: "-",
			commits: "yes",
			dirty: "no",
			pr: { number: 488, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488" },
		});

		expect(formatted).toBe(
			"[gt] \x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/488\x07#488\x1B]8;;\x07 (↓: main) (↑: -) (commits)",
		);
		expect(stripTerminalEscapes(formatted)).toBe("[gt] #488 (↓: main) (↑: -) (commits)");
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

	test("loads current branch Graphite PR metadata as a hyperlink", async () => {
		const root = makeGitRepo("feature/current", [
			{
				prNumber: 488,
				headRefName: "feature/current",
				url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488",
			},
		]);

		try {
			const { pi, formatted } = await loadFormattedStatus(basicGtScript(), root);

			pi.assertDone();
			expect(formatted).toContain(
				"\x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/488\x07#488\x1B]8;;\x07",
			);
			expect(stripTerminalEscapes(formatted)).toBe("[gt] #488 (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ignores Graphite PR metadata for other branches", async () => {
		const root = makeGitRepo("feature/current", [
			{
				prNumber: 488,
				headRefName: "feature/other",
				url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488",
			},
		]);

		try {
			const { pi, formatted } = await loadFormattedStatus(basicGtScript(), root);

			pi.assertDone();
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ignores unsafe Graphite PR URLs", async () => {
		const root = makeGitRepo("feature/current", [
			{ prNumber: 488, headRefName: "feature/current", url: "javascript:alert(1)" },
		]);

		try {
			const { pi, formatted } = await loadFormattedStatus(basicGtScript(), root);

			pi.assertDone();
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
