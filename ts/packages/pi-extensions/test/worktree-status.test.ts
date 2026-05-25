import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { stripTerminalEscapes } from "../src/command-runtime.ts";
import { formatGtStatus, loadGtStatus, type ExecResult, type StatusTheme } from "../src/worktree-status.ts";

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

function gtTrunkStep(result: Partial<ExecResult> = {}): ScriptedExec {
	return step("gt", ["trunk", "--no-interactive"], result);
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

function makeGitRepo(branch: string): string {
	const root = mkdtempSync(join(tmpdir(), "worktree-status-"));
	const gitDir = join(root, ".git");
	mkdirSync(gitDir);
	writeFileSync(join(gitDir, "HEAD"), `ref: refs/heads/${branch}\n`);
	return root;
}

function basicGtScript(extraSteps: ScriptedExec[] = []): ScriptedExec[] {
	return [gtParentStep({ stdout: "main\n" }), gtChildrenStep(), revListStep("main", 1), dirtyStep(), ...extraSteps];
}

function gtBranchInfoStep(branch: string, stdout = ""): ScriptedExec {
	return step("gt", ["branch", "info", branch, "--no-interactive"], { stdout });
}

const TEST_THEME: StatusTheme = {
	fg(color, value) {
		const code = color === "accent" ? "36" : "90";
		return `\x1B[${code}m${value}\x1B[39m`;
	},
	underline(value) {
		return `\x1B[4m${value}\x1B[24m`;
	},
};

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

	test("omits downstack and commit marker when no downstack branch applies", () => {
		expect(formatGtStatus({ down: undefined, up: "<multiple>", commits: "n/a", dirty: "no" })).toBe(
			"[gt] (↑: <multiple>)",
		);
	});

	test("formats associated PR status as a labeled terminal hyperlink", () => {
		const formatted = formatGtStatus({
			down: "main",
			up: "-",
			commits: "yes",
			dirty: "no",
			pr: { number: 488, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488" },
		});

		expect(formatted).toBe(
			"\x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/488\x07[gt] (pr: #488) (↓: main) (↑: -) (commits)\x1B]8;;\x07",
		);
		expect(stripTerminalEscapes(formatted)).toBe("[gt] (pr: #488) (↓: main) (↑: -) (commits)");
	});

	test("colorizes the linked PR number when formatting for the UI", () => {
		const formatted = formatGtStatus(
			{
				down: "main",
				up: "-",
				commits: "yes",
				dirty: "no",
				pr: { number: 488, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/488" },
			},
			TEST_THEME,
		);

		expect(formatted).toContain("\x1B[36m\x1B[4m#488\x1B[24m\x1B[39m");
		expect(formatted).toContain("\x1B[90m[gt]\x1B[39m");
		expect(stripTerminalEscapes(formatted)).toBe("[gt] (pr: #488) (↓: main) (↑: -) (commits)");
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

	test("omits downstack and skips previous-checkout fallback on Graphite trunk", async () => {
		const root = makeGitRepo("master");

		try {
			const { pi, formatted } = await loadFormattedStatus(
				[
					gtParentStep({ stdout: "\n" }),
					gtTrunkStep({ stdout: "master\n" }),
					gtChildrenStep({ stdout: "feature/one\nfeature/two\n" }),
					dirtyStep(),
					gtBranchInfoStep("master", "master\n"),
				],
				root,
			);

			pi.assertDone();
			expect(formatted).toBe("[gt] (↑: <multiple>)");
			expect(formatted).not.toContain("(↓:");
			expect(formatted).not.toContain("commits");
			expect(formatted).not.toContain("∅");
			expect(pi.calls).not.toContainEqual({ command: "git", args: ["rev-parse", "--symbolic-full-name", "@{-1}"] });
			expect(pi.calls.some((call) => call.command === "git" && call.args[0] === "rev-list")).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves previous-checkout fallback when Graphite parent is unavailable off trunk", async () => {
		const root = makeGitRepo("feature/current");

		try {
			const { pi, formatted } = await loadFormattedStatus(
				[
					gtParentStep({ code: 1, stderr: "not tracked by Graphite" }),
					gtTrunkStep({ stdout: "master\n" }),
					step("git", ["rev-parse", "--symbolic-full-name", "@{-1}"], { stdout: "refs/heads/main\n" }),
					step("git", ["show-ref", "--verify", "refs/heads/main"]),
					gtChildrenStep(),
					revListStep("main", 0),
					dirtyStep(),
					gtBranchInfoStep("feature/current", "feature/current\n"),
				],
				root,
			);

			pi.assertDone();
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
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

	test("loads current branch Graphite PR from gt branch info as a hyperlink", async () => {
		const root = makeGitRepo("feature/current");

		try {
			const { pi, formatted } = await loadFormattedStatus(
				basicGtScript([
					gtBranchInfoStep(
						"feature/current",
						[
							"feature/current",
							"2 hours ago",
							"",
							"PR #489 (Ready to merge as stack) Add sessions library",
							"https://app.graphite.com/github/pr/dagster-io/asdl-tools/489",
						].join("\n"),
					),
				]),
				root,
			);

			pi.assertDone();
			expect(formatted).toBe(
				"\x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/489\x07[gt] (pr: #489) (↓: main) (↑: -) (commits)\x1B]8;;\x07",
			);
			expect(stripTerminalEscapes(formatted)).toBe("[gt] (pr: #489) (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("omits PR status when gt branch info has no PR", async () => {
		const root = makeGitRepo("feature/current");

		try {
			const { pi, formatted } = await loadFormattedStatus(
				basicGtScript([gtBranchInfoStep("feature/current", "feature/current\n")]),
				root,
			);

			pi.assertDone();
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ignores unsafe Graphite PR URLs from gt branch info", async () => {
		const root = makeGitRepo("feature/current");

		try {
			const { pi, formatted } = await loadFormattedStatus(
				basicGtScript([gtBranchInfoStep("feature/current", "PR #488 Bad\njavascript:alert(1)\n")]),
				root,
			);

			pi.assertDone();
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
