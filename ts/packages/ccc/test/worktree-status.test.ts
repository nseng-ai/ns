import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@asdl/pi-extension-runtime/command-runtime";
import type { GraphiteMetadataWorkerDiagnostic } from "@asdl/ccc/worktree-status/graphite-metadata";
import {
	makeGitRepo,
	makeGraphiteRepo,
	makePyprojectRoot,
	standardGraphiteRows,
	withTempRoot,
	writeGraphiteMetadataDb,
} from "./worktree-status-fixtures.ts";
import {
	formatGtStatus,
	formatWorktreeStatus,
	loadGtStatus,
	loadWorktreeStatus,
	renderWorktreeStatusMessage,
	type ExecResult,
	type GraphiteMetadataLoader,
	type StatusTheme,
} from "@asdl/ccc/worktree-status";

const ROOT = "/repo";

interface ExecCall {
	command: string;
	args: string[];
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

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

class OrderlessFakePi {
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const index = this.script.findIndex((expected) => expected.command === command && sameArgs(expected.args, args));
		if (index === -1) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		const [expected] = this.script.splice(index, 1);
		return execResult(expected?.result);
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

function revListStep(base: string, count: number): ScriptedExec {
	return step("git", ["rev-list", "--count", `${base}..HEAD`], { stdout: `${count}\n` });
}

function dirtyStep(stdout = ""): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout });
}

async function loadFormattedStatus(script: ScriptedExec[], root: string): Promise<{ pi: FakePi; formatted: string }> {
	const pi = new FakePi(script);
	const status = await loadGtStatus({ pi, cwd: root });
	return { pi, formatted: formatGtStatus(status) };
}

function basicGitStatusScript(base = "main", count = 1, dirtyStdout = ""): ScriptedExec[] {
	return [revListStep(base, count), dirtyStep(dirtyStdout)];
}

function expectNoGtCalls(pi: { calls: readonly ExecCall[] }): void {
	expect(pi.calls.filter((call) => call.command === "gt")).toEqual([]);
}

function brmemListStep(result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--format", "json"], result);
}

function uvBrmemListStep(projectRoot: string, result: Partial<ExecResult>): ScriptedExec {
	return step("uv", ["run", "--directory", projectRoot, "brmem", "list", "--format", "json"], result);
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

describe("worktree status message rendering", () => {
	test("renders PR references from message details as terminal hyperlinks", () => {
		const component = renderWorktreeStatusMessage(
			{
				customType: "worktree-status",
				content: "[gt] (pr: #489) (↓: main) (↑: -) (commits)",
				details: { prLinks: [{ number: 489, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/489" }] },
			},
			{ expanded: false },
			{ fg: (_color, text) => text },
		);

		expect(component.render(200)).toEqual([
			"[gt] (pr: \x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/489\x07#489\x1B]8;;\x07) (↓: main) (↑: -) (commits)",
		]);
	});

	test("ignores unsafe PR link details while rendering", () => {
		const component = renderWorktreeStatusMessage(
			{
				customType: "worktree-status",
				content: "[gt] (pr: #489) (↓: main) (↑: -) (commits)",
				details: { prLinks: [{ number: 489, url: "javascript:alert(1)" }] },
			},
			{ expanded: false },
			{ fg: (_color, text) => text },
		);

		expect(component.render(200)).toEqual(["[gt] (pr: #489) (↓: main) (↑: -) (commits)"]);
	});
});

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

});

describe("loadWorktreeStatus", () => {
	test("returns unavailable brmem status without throwing when the CLI is unavailable", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ code: 127, stderr: "brmem: command not found" }),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
			expect(status.gt).toEqual({ down: "main", up: "-", commits: "yes", dirty: "no" });
		});
	});

	test("uses a later brmem candidate after an earlier candidate is unavailable", async () => {
		await withTempRoot(makePyprojectRoot(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ code: 127, stderr: "brmem: command not found" }),
				uvBrmemListStep(root, {
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [{ namespace: "plans", key: "adapter/details.md" }] },
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(plans: adapter)");
		});
	});

	test("formats base namespace brmem entries from canonical namespace strings", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "base", key: "scratch/plan.md" },
								{ namespace: "plans", key: "adapter/details.md" },
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(base: scratch) (plans: adapter)");
		});
	});

	test("does not normalize legacy handoffs or session-artifact handoff paths", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "handoff", key: "resume-resource-audit-session.md" },
								{ namespace: "handoffs", key: "resume-resource-audit-session.md" },
								{ namespace: "session-artifacts", key: "handoffs/resume-resource-audit-session.md" },
								{ namespace: "session-artifacts", key: "logs/run-123.md" },
								{ namespace: "objectives-archive", key: "closed/objective.md" },
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe(
				"(handoff: resume-resource-audit-session.md) (handoffs: resume-resource-audit-session.md) (session-artifacts: handoffs, logs)",
			);
		});
	});

	test("uses a later brmem candidate after an earlier candidate returns a nonzero envelope", async () => {
		await withTempRoot(makePyprojectRoot(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 2, message: "candidate failed", data: {} }) }),
				uvBrmemListStep(root, {
					stdout: JSON.stringify({
						exit_code: 0,
						data: { entries: [{ namespace: "plans", key: "fallback/details.md" }] },
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(plans: fallback)");
		});
	});

	test("surfaces graphite metadata diagnostics from the convenience loader", async () => {
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];
		const onDiagnostic = (diagnostic: GraphiteMetadataWorkerDiagnostic): void => {
			diagnostics.push(diagnostic);
		};
		const metadataLoader: GraphiteMetadataLoader = async ({ onDiagnostic: actualOnDiagnostic }) => {
			actualOnDiagnostic?.({ type: "worker-timeout", timeoutMs: 7 });
			return {
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: [],
				isCurrentTrunk: false,
			};
		};
		const pi = new OrderlessFakePi([brmemListStep({}), ...basicGitStatusScript()]);

		const status = await loadWorktreeStatus(pi, ROOT, { metadataLoader, onDiagnostic });

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(status.gtMetadataDiagnostic).toEqual({ type: "worker-timeout", timeoutMs: 7 });
		expect(diagnostics).toEqual([{ type: "worker-timeout", timeoutMs: 7 }]);
		expect(formatWorktreeStatus(status).at(-1)).toBe("[gt] metadata worker timed out after 7ms");
	});

	test("degrades malformed brmem JSON output nonfatally", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([brmemListStep({ stdout: "not json" }), ...basicGitStatusScript()]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
			expect(status.gt.down).toBe("main");
		});
	});

	test("ignores malformed brmem entries while formatting valid ones", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({
					stdout: JSON.stringify({
						exit_code: 0,
						data: {
							entries: [
								{ namespace: "plans", key: "adapter/details.md" },
								{ namespace: 123, key: "bad" },
								{ namespace: "bad" },
								null,
								"not an object",
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(plans: adapter)");
		});
	});

	test("treats a non-array brmem entries field as no scopes without throwing", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: "nope" } }) }),
				...basicGitStatusScript(),
			]);

			const status = await loadWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBeUndefined();
			expect(status.gt.down).toBe("main");
		});
	});
});

describe("loadGtStatus", () => {
	test("uses an injected async metadata loader before deriving downstack and upstack status", async () => {
		const metadataLoader: GraphiteMetadataLoader = async ({ cwd, signal }) => {
			expect(cwd).toBe(ROOT);
			expect(signal).toBeUndefined();
			return {
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: ["feature/child"],
				isCurrentTrunk: false,
			};
		};
		const pi = new FakePi([revListStep("main", 3), dirtyStep()]);

		const status = await loadGtStatus({ pi, cwd: ROOT, metadataLoader });

		pi.assertDone();
		expect(formatGtStatus(status)).toBe("[gt] (↓: main) (↑: feature/child) (commits)");
		expectNoGtCalls(pi);
	});

	test("threads metadata diagnostics through the async metadata loader", async () => {
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];
		const onDiagnostic = (diagnostic: GraphiteMetadataWorkerDiagnostic): void => {
			diagnostics.push(diagnostic);
		};
		const metadataLoader: GraphiteMetadataLoader = async ({ cwd, signal, onDiagnostic: actualOnDiagnostic }) => {
			expect(cwd).toBe(ROOT);
			expect(signal).toBeUndefined();
			expect(actualOnDiagnostic).toBe(onDiagnostic);
			actualOnDiagnostic?.({ type: "worker-timeout", timeoutMs: 1 });
			return {
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: [],
				isCurrentTrunk: false,
			};
		};
		const pi = new FakePi([revListStep("main", 1), dirtyStep()]);

		const status = await loadGtStatus({ pi, cwd: ROOT, metadataLoader, onDiagnostic });

		pi.assertDone();
		expect(formatGtStatus(status)).toBe("[gt] (↓: main) (↑: -) (commits)");
		expect(diagnostics).toEqual([{ type: "worker-timeout", timeoutMs: 1 }]);
		expectNoGtCalls(pi);
	});

	test("degrades when the async metadata loader reports unavailable", async () => {
		const metadataLoader: GraphiteMetadataLoader = async () => ({
			type: "unavailable",
			reason: "read-failed",
			currentBranch: "feature/current",
		});
		const pi = new FakePi([dirtyStep()]);

		const status = await loadGtStatus({ pi, cwd: ROOT, metadataLoader });

		pi.assertDone();
		expect(formatGtStatus(status)).toBe("[gt] (↓: -) (↑: -) (commits: ?)");
		expectNoGtCalls(pi);
	});

	test("uses Graphite metadata parent and shows the empty icon for zero commits", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 0), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅");
		});
	});

	test("uses Graphite metadata parent and shows commits when branch-local commits exist", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 2), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
			expect(formatted).not.toContain("∅");
		});
	});

	test("uses an unknown base when metadata DB is missing", async () => {
		await withTempRoot(makeGitRepo("feature/current"), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: -) (↑: -) (commits: ?)");
			expect(formatted).not.toContain("∅");
			expect(pi.calls).not.toContainEqual({ command: "git", args: ["rev-parse", "--symbolic-full-name", "@{-1}"] });
		});
	});

	test("omits downstack and skips previous-checkout fallback on Graphite trunk", async () => {
		await withTempRoot(
			makeGraphiteRepo("master", [
				{ branchName: "master", children: ["feature/one", "feature/two"], validationResult: "TRUNK" },
				{ branchName: "feature/one", parentBranchName: "master" },
				{ branchName: "feature/two", parentBranchName: "master" },
			]),
			async (root) => {
				const { pi, formatted } = await loadFormattedStatus([dirtyStep()], root);

				pi.assertDone();
				expectNoGtCalls(pi);
				expect(formatted).toBe("[gt] (↑: <multiple>)");
				expect(formatted).not.toContain("(↓:");
				expect(formatted).not.toContain("commits");
				expect(formatted).not.toContain("∅");
				expect(pi.calls).not.toContainEqual({ command: "git", args: ["rev-parse", "--symbolic-full-name", "@{-1}"] });
				expect(pi.calls.some((call) => call.command === "git" && call.args[0] === "rev-list")).toBe(false);
			},
		);
	});

	test("formats multiple metadata children as multiple upstack branches", async () => {
		await withTempRoot(makeGraphiteRepo("feature/current", [
			{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
			{ branchName: "feature/current", parentBranchName: "main", children: ["feature/one", "feature/two"] },
			{ branchName: "feature/one", parentBranchName: "feature/current" },
			{ branchName: "feature/two", parentBranchName: "feature/current" },
		]), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: <multiple>) (commits)");
		});
	});

	test("uses an unknown base when current branch is untracked by metadata", async () => {
		await withTempRoot(
			makeGraphiteRepo("feature/current", [
				{ branchName: "main", validationResult: "TRUNK" },
				{ branchName: "feature/other", parentBranchName: "main" },
			]),
			async (root) => {
				const { pi, formatted } = await loadFormattedStatus([dirtyStep()], root);

				pi.assertDone();
				expectNoGtCalls(pi);
				expect(formatted).toBe("[gt] (↓: -) (↑: -) (commits: ?)");
				expect(formatted).not.toContain("∅");
				expect(pi.calls).not.toContainEqual({ command: "git", args: ["rev-parse", "--symbolic-full-name", "@{-1}"] });
			},
		);
	});

	test("reads metadata from a linked worktree common git dir", async () => {
		await withTempRoot(mkdtempSync(join(tmpdir(), "worktree-status-")), async (root) => {
			const commonGitDir = join(root, "common.git");
			const worktreeGitDir = join(root, "worktrees", "feature-current");
			mkdirSync(commonGitDir, { recursive: true });
			mkdirSync(worktreeGitDir, { recursive: true });
			writeFileSync(join(root, ".git"), `gitdir: ${worktreeGitDir}\n`);
			writeFileSync(join(worktreeGitDir, "HEAD"), "ref: refs/heads/feature/current\n");
			writeFileSync(join(worktreeGitDir, "commondir"), `${commonGitDir}\n`);
			writeGraphiteMetadataDb(commonGitDir, standardGraphiteRows());

			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
		});
	});

	test("combines dirty state with empty state", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 0), dirtyStep(" M file.txt\n")], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) ∅ (x)");
		});
	});

	test("does not load passive PR status from gt branch info", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] (↓: main) (↑: -) (commits)");
			expect(formatted).not.toContain("pr:");
		});
	});
});
