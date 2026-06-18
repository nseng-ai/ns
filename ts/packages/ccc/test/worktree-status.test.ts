import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/exec";
import type { GraphiteMetadataWorkerDiagnostic } from "@asdl/ccc/worktree-status/graphite-metadata";
import {
	makeGitRepo,
	makeGraphiteRepo,
	standardGraphiteRows,
	withTempRoot,
	writeGraphiteMetadataDb,
} from "./worktree-status-fixtures.ts";
import {
	formatGhStatus,
	formatGtStatus,
	combineWorktreeStatus,
	formatWorktreeStatus,
	loadGtStatus,
	loadLocalWorktreeStatus,
	loadWorktreeGhStatus,
	renderWorktreeStatusMessage,
	type ExecGateway,
	type ExecResult,
	type GraphiteMetadataLoader,
	type LoadLocalWorktreeStatusOptions,
	type StatusTheme,
	type WorktreeStatus,
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

async function loadComposedWorktreeStatus(
	pi: ExecGateway,
	cwd: string,
	options?: LoadLocalWorktreeStatusOptions,
): Promise<WorktreeStatus> {
	const local = await loadLocalWorktreeStatus(pi, cwd, options);
	const gh = await loadWorktreeGhStatus(pi, cwd, { signal: options?.signal });
	return combineWorktreeStatus(local, gh);
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

function ghNoPrStep(): ScriptedExec {
	return step("gh", ["pr", "view", "--json", "number,url,statusCheckRollup"], { code: 1, stderr: "no pull request found" });
}

function ghPrViewStep(options: { number: number; passingChecks?: number; pendingChecks?: number; failingChecks?: number; unknownChecks?: number }): ScriptedExec {
	return step("gh", ["pr", "view", "--json", "number,url,statusCheckRollup"], {
		stdout: JSON.stringify({
			number: options.number,
			url: `https://github.com/dagster-io/asdl-tools/pull/${options.number}`,
			statusCheckRollup: [
				...Array.from({ length: options.passingChecks ?? 0 }, (_value, index) => ({
					__typename: "CheckRun",
					conclusion: "SUCCESS",
					name: `passing-${index}`,
					status: "COMPLETED",
				})),
				...Array.from({ length: options.pendingChecks ?? 0 }, (_value, index) => ({
					__typename: "CheckRun",
					name: `pending-${index}`,
					status: "IN_PROGRESS",
				})),
				...Array.from({ length: options.failingChecks ?? 0 }, (_value, index) => ({
					__typename: "CheckRun",
					conclusion: "FAILURE",
					name: `failed-${index}`,
					status: "COMPLETED",
				})),
				...Array.from({ length: options.unknownChecks ?? 0 }, (_value, index) => ({
					__typename: "CheckRun",
					conclusion: "MYSTERY",
					name: `unknown-${index}`,
					status: "COMPLETED",
				})),
			],
		}),
	});
}

function ghReviewThreadsStep(options: { number: number; unresolvedThreads: number; totalThreads: number; hasMore?: boolean }): ScriptedExec {
	const resolvedThreads = Math.max(0, options.totalThreads - options.unresolvedThreads);
	return step(
		"gh",
		[
			"api",
			"graphql",
			"-f",
			"query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){totalCount pageInfo{hasNextPage} nodes{isResolved}}}}}",
			"-f",
			"owner=dagster-io",
			"-f",
			"repo=asdl-tools",
			"-F",
			`number=${options.number}`,
		],
		{
			stdout: JSON.stringify({
				data: {
					repository: {
						pullRequest: {
							reviewThreads: {
								totalCount: options.totalThreads,
								pageInfo: { hasNextPage: options.hasMore ?? false },
								nodes: [
									...Array.from({ length: options.unresolvedThreads }, () => ({ isResolved: false })),
									...Array.from({ length: resolvedThreads }, () => ({ isResolved: true })),
								],
							},
						},
					},
				},
			}),
		},
	);
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

const MARKER_THEME: StatusTheme = {
	fg(color, value) {
		return `<${color}>${value}</${color}>`;
	},
};

describe("worktree status message rendering", () => {
	test("renders PR references from message details as terminal hyperlinks", () => {
		const component = renderWorktreeStatusMessage(
			{
				customType: "worktree-status",
				content: "[gh] #489 · comments 0/0 · actions 12✓ · landable",
				details: { prLinks: [{ number: 489, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/489" }] },
			},
			{ expanded: false },
			{ fg: (_color, text) => text },
		);

		expect(component.render(200)).toEqual([
			"[gh] \x1B]8;;https://app.graphite.com/github/pr/dagster-io/asdl-tools/489\x07#489\x1B]8;;\x07 · comments 0/0 · actions 12✓ · landable",
		]);
	});

	test("ignores unsafe PR link details while rendering", () => {
		const component = renderWorktreeStatusMessage(
			{
				customType: "worktree-status",
				content: "[gh] #489 · comments 0/0 · actions 12✓ · landable",
				details: { prLinks: [{ number: 489, url: "javascript:alert(1)" }] },
			},
			{ expanded: false },
			{ fg: (_color, text) => text },
		);

		expect(component.render(200)).toEqual(["[gh] #489 · comments 0/0 · actions 12✓ · landable"]);
	});
});

describe("worktree status formatting", () => {
	test("formats the empty branch icon for zero branch-local commits", () => {
		expect(formatGtStatus({ down: "main", up: "-", commits: { type: "count", count: 0 }, dirty: "no" })).toBe("[gt] ↓ main · ↑ - · 0 commits");
	});

	test("formats commits, unknown commits, and dirty state", () => {
		expect(formatGtStatus({ down: "main", up: "-", commits: { type: "count", count: 1 }, dirty: "no" })).toBe(
			"[gt] ↓ main · ↑ - · 1 commit",
		);
		expect(formatGtStatus({ down: "main", up: "-", commits: { type: "unknown" }, dirty: "no" })).toBe(
			"[gt] ↓ main · ↑ - · commits ?",
		);
		expect(formatGtStatus({ down: "main", up: "-", commits: { type: "count", count: 0 }, dirty: "yes" })).toBe(
			"[gt] ↓ main · ↑ - · 0 commits · ✗",
		);
	});

	test("omits downstack and commit marker when no downstack branch applies", () => {
		expect(formatGtStatus({ down: undefined, up: "<multiple>", commits: { type: "not-applicable" }, dirty: "no" })).toBe(
			"[gt] ↑ <multiple>",
		);
	});

	test("formats gh landability from unresolved comments and condensed action buckets", () => {
		expect(formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 0, total: 8, hasMore: false }, checks: { passing: 16, pending: 0, failing: 0, unknown: 0 } })).toBe(
			"[gh] #1736 · comments 8/8 · actions 16✓ · landable",
		);
		expect(formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 18, total: 18, hasMore: false }, checks: { passing: 16, pending: 0, failing: 0, unknown: 0 } })).toBe(
			"[gh] #1736 · comments 0/18 · actions 16✓",
		);
		expect(formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 2, total: 100, hasMore: true }, checks: { passing: 16, pending: 3, failing: 1, unknown: 0 } })).toBe(
			"[gh] #1736 · comments 98/100+ · actions 3⏳ 1✗",
		);
		expect(formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 0, total: 8, hasMore: false }, checks: { passing: 16, pending: 0, failing: 0, unknown: 2 } })).toBe(
			"[gh] #1736 · comments 8/8 · actions 2?",
		);
		expect(formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 0, total: 0, hasMore: false }, checks: { passing: 0, pending: 0, failing: 0, unknown: 0 } })).toBe(
			"[gh] #1736 · comments 0/0 · actions 0✓ · landable",
		);
		expect(formatGhStatus({ type: "no-pr" })).toBe("[gh] no PR");
		expect(formatGhStatus({ type: "unavailable" })).toBe("[gh] unavailable");
		expect(formatGhStatus({ type: "unavailable", message: "gh api graphql exited 1: timeout" })).toBe(
			"[gh] unavailable: gh api graphql exited 1: timeout",
		);
	});

	test("colors gh landability by state without changing stripped text", () => {
		const blocked = formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 2, total: 100, hasMore: true }, checks: { passing: 16, pending: 3, failing: 1, unknown: 0 } }, MARKER_THEME);
		expect(blocked).toContain("<dim>[gh]</dim>");
		expect(blocked).toContain("<accent>#1736</accent>");
		expect(blocked).toContain("<warning>98/100+</warning>");
		expect(blocked).toContain("<warning>3⏳</warning>");
		expect(blocked).toContain("<error>1✗</error>");

		const landable = formatGhStatus({ type: "available", prNumber: 1736, threads: { unresolved: 0, total: 8, hasMore: false }, checks: { passing: 16, pending: 0, failing: 0, unknown: 0 } }, MARKER_THEME);
		expect(landable).toContain("<accent>16✓</accent>");
		expect(landable).toContain("<accent>landable</accent>");
		expect(formatGhStatus({ type: "no-pr" }, MARKER_THEME)).toBe("<dim>[gh] no PR</dim>");
		expect(formatGhStatus({ type: "unavailable", message: "timeout" }, MARKER_THEME)).toBe(
			"<warning>[gh] unavailable</warning><dim>: timeout</dim>",
		);
	});

});

describe("composed local and gh worktree status loading", () => {
	test("returns unavailable brmem status without throwing when the CLI is unavailable", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ code: 127, stderr: "brmem: command not found" }),
				...basicGitStatusScript(),
			]);

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
			expect(status.gt).toEqual({ down: "main", up: "-", commits: { type: "count", count: 1 }, dirty: "no" });
		});
	});

	test("does not fall back to Python candidates after PATH brmem is unavailable", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ code: 127, stderr: "brmem: command not found" }),
				...basicGitStatusScript(),
			]);

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
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
								{ namespace: "base", key: "scratch/note.md" },
								{ namespace: "notes", key: "adapter/details.md" },
							],
						},
					}),
				}),
				...basicGitStatusScript(),
			]);

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(base: scratch) (notes: adapter)");
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

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe(
				"(handoff: resume-resource-audit-session.md) (handoffs: resume-resource-audit-session.md) (session-artifacts: handoffs, logs)",
			);
		});
	});

	test("does not fall back to Python candidates after PATH brmem returns a nonzero envelope", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 2, message: "candidate failed", data: {} }) }),
				...basicGitStatusScript(),
			]);

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("unavailable");
		});
	});

	test("surfaces graphite metadata diagnostics from the local loader", async () => {
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

		const status = await loadLocalWorktreeStatus(pi, ROOT, { metadataLoader, onDiagnostic });

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(status.gtMetadataDiagnostic).toEqual({ type: "worker-timeout", timeoutMs: 7 });
		expect(diagnostics).toEqual([{ type: "worker-timeout", timeoutMs: 7 }]);
		const fullStatus = combineWorktreeStatus(status, { type: "no-pr" });
		expect(formatWorktreeStatus(fullStatus).at(-1)).toBe("[gt] metadata worker timed out after 7ms");
	});

	test("degrades malformed brmem JSON output nonfatally", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([brmemListStep({ stdout: "not json" }), ...basicGitStatusScript()]);

			const status = await loadLocalWorktreeStatus(pi, root);

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
								{ namespace: "notes", key: "adapter/details.md" },
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

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBe("(notes: adapter)");
		});
	});

	test("treats a non-array brmem entries field as no scopes without throwing", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: "nope" } }) }),
				...basicGitStatusScript(),
			]);

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.brmem).toBeUndefined();
			expect(status.gt.down).toBe("main");
		});
	});

	test("loads gh status for current branch PR landability", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				ghPrViewStep({ number: 1736, passingChecks: 4, pendingChecks: 2, failingChecks: 1 }),
				ghReviewThreadsStep({ number: 1736, unresolvedThreads: 3, totalThreads: 5 }),
				...basicGitStatusScript(),
			]);

			const status = await loadComposedWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.gh).toMatchObject({
				type: "available",
				prNumber: 1736,
				threads: { unresolved: 3, total: 5, hasMore: false },
				checks: { passing: 4, pending: 2, failing: 1, unknown: 0 },
			});
			expect(formatWorktreeStatus(status)).toContain("[gh] #1736 · comments 2/5 · actions 2⏳ 1✗");
		});
	});

	test("unknown gh checks block landability", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				ghPrViewStep({ number: 1736, passingChecks: 4, unknownChecks: 1 }),
				ghReviewThreadsStep({ number: 1736, unresolvedThreads: 0, totalThreads: 0 }),
				...basicGitStatusScript(),
			]);

			const status = await loadComposedWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.gh).toMatchObject({ type: "available", checks: { unknown: 1 } });
			const formatted = formatWorktreeStatus(status);
			expect(formatted).toContain("[gh] #1736 · comments 0/0 · actions 1?");
			expect(formatted.join("\n")).not.toContain("landable");
		});
	});

	test("loads local worktree status without invoking gh", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				...basicGitStatusScript(),
			]);

			const status = await loadLocalWorktreeStatus(pi, root);

			pi.assertDone();
			expect(pi.calls.some((call) => call.command === "gh")).toBe(false);
			expect(status.gt).toEqual({ down: "main", up: "-", commits: { type: "count", count: 1 }, dirty: "no" });
		});
	});

	test("classifies known gh pr view no-PR failures narrowly", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				ghNoPrStep(),
				...basicGitStatusScript(),
			]);

			const status = await loadComposedWorktreeStatus(pi, root);

			pi.assertDone();
			expect(status.gh).toEqual({ type: "no-pr" });
		});
	});

	test("reports gh pr view auth failures as unavailable instead of no PR", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				step("gh", ["pr", "view", "--json", "number,url,statusCheckRollup"], { code: 1, stderr: "HTTP 401: Bad credentials" }),
				...basicGitStatusScript(),
			]);

			const status = await loadComposedWorktreeStatus(pi, root);

			pi.assertDone();
			expect(status.gh).toEqual({ type: "unavailable", message: "gh pr view exited 1: HTTP 401: Bad credentials" });
			expect(formatWorktreeStatus(status)).toContain("[gh] unavailable: gh pr view exited 1: HTTP 401: Bad credentials");
		});
	});

	test("includes a dim unavailable message when gh review thread loading fails", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const failedReviewThreads = ghReviewThreadsStep({ number: 1736, unresolvedThreads: 0, totalThreads: 0 });
			failedReviewThreads.result = { code: 1, stderr: "GraphQL: API rate limit exceeded" };
			const pi = new OrderlessFakePi([
				brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
				ghPrViewStep({ number: 1736, passingChecks: 4 }),
				failedReviewThreads,
				...basicGitStatusScript(),
			]);

			const status = await loadComposedWorktreeStatus(pi, root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(status.gh).toEqual({ type: "unavailable", message: "gh api graphql exited 1: GraphQL: API rate limit exceeded" });
			expect(formatWorktreeStatus(status)).toContain("[gh] unavailable: gh api graphql exited 1: GraphQL: API rate limit exceeded");
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
		expect(formatGtStatus(status)).toBe("[gt] ↓ main · ↑ feature/child · 3 commits");
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
		expect(formatGtStatus(status)).toBe("[gt] ↓ main · ↑ - · 1 commit");
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
		expect(formatGtStatus(status)).toBe("[gt] ↓ - · ↑ - · commits ?");
		expectNoGtCalls(pi);
	});

	test("uses Graphite metadata parent and shows the empty icon for zero commits", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 0), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] ↓ main · ↑ - · 0 commits");
		});
	});

	test("uses Graphite metadata parent and shows commits when branch-local commits exist", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 2), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] ↓ main · ↑ - · 2 commits");
			expect(formatted).not.toContain("∅");
		});
	});

	test("uses an unknown base when metadata DB is missing", async () => {
		await withTempRoot(makeGitRepo("feature/current"), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] ↓ - · ↑ - · commits ?");
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
				expect(formatted).toBe("[gt] ↑ <multiple>");
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
			expect(formatted).toBe("[gt] ↓ main · ↑ <multiple> · 1 commit");
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
				expect(formatted).toBe("[gt] ↓ - · ↑ - · commits ?");
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
			expect(formatted).toBe("[gt] ↓ main · ↑ - · 1 commit");
		});
	});

	test("combines dirty state with empty state", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 0), dirtyStep(" M file.txt\n")], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] ↓ main · ↑ - · 0 commits · ✗");
		});
	});

	test("does not load passive PR status from gt branch info", async () => {
		await withTempRoot(makeGraphiteRepo(), async (root) => {
			const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()], root);

			pi.assertDone();
			expectNoGtCalls(pi);
			expect(formatted).toBe("[gt] ↓ main · ↑ - · 1 commit");
			expect(formatted).not.toContain("pr:");
		});
	});
});
