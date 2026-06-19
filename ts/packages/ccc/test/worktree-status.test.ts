import { describe, expect, test } from "vitest";

import { githubWorktreePrStatusQuery } from "@asdl/core/github-status";
import type { GraphiteMetadataWorkerDiagnostic } from "@asdl/ccc/worktree-status/graphite-metadata";
import {
	formatGhStatus,
	formatGtStatus,
	combineWorktreeStatus,
	formatWorktreeStatus,
	loadGtStatus as loadGtStatusReal,
	loadLocalWorktreeStatus as loadLocalWorktreeStatusReal,
	loadWorktreeGhStatus,
	renderWorktreeStatusMessage,
	type ExecGateway,
	type ExecResult,
	type GraphiteMetadataLoader,
	type LoadGtStatusOptions,
	type LoadLocalWorktreeStatusOptions,
	type LocalWorktreeStatus,
	type StatusTheme,
	type WorktreeStatus,
	type WorktreeStatusIdentity,
} from "@asdl/ccc/worktree-status";
import type { GraphiteMetadataStatus } from "@asdl/ccc/worktree-status/graphite-metadata";

const ROOT = "/repo";
const HEAD_OID = "abc123";

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
		const index = this.script.findIndex(
			(expected) => expected.command === command && sameArgs(expected.args, args),
		);
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

function sameArgs(left: string[], right: readonly string[]): boolean {
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

function remoteOriginStep(url = "git@github.com:dagster-io/asdl-tools.git"): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], { stdout: `${url}\n` });
}

function brmemListStep(result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--format", "json"], result);
}

function basicGitStatusScript(base = "main", count = 1, dirtyStdout = ""): ScriptedExec[] {
	return [revListStep(base, count), dirtyStep(dirtyStdout)];
}

function expectNoGtCalls(pi: { calls: readonly ExecCall[] }): void {
	expect(pi.calls.filter((call) => call.command === "gt")).toEqual([]);
}

function identityFor(
	cwd = ROOT,
	overrides: Partial<WorktreeStatusIdentity> = {},
): WorktreeStatusIdentity {
	return {
		cwd,
		head: overrides.head ?? { type: "branch", name: "feature/current" },
		...(overrides.headOid === undefined ? { headOid: HEAD_OID } : { headOid: overrides.headOid }),
	};
}

function trackedMetadata(
	overrides: Partial<Extract<GraphiteMetadataStatus, { type: "tracked" }>> = {},
): GraphiteMetadataStatus {
	return {
		type: "tracked",
		currentBranch: overrides.currentBranch ?? "feature/current",
		parent: Object.hasOwn(overrides, "parent") ? overrides.parent : "main",
		children: overrides.children ?? [],
		isCurrentTrunk: overrides.isCurrentTrunk ?? false,
	};
}

function metadataLoaderFor(status: GraphiteMetadataStatus): GraphiteMetadataLoader {
	return async () => status;
}

const defaultMetadataLoader = metadataLoaderFor(trackedMetadata());

function withDefaultLocalOptions(
	cwd: string,
	options: LoadLocalWorktreeStatusOptions = {},
): LoadLocalWorktreeStatusOptions {
	return {
		signal: options.signal,
		onDiagnostic: options.onDiagnostic,
		identity: options.identity ?? identityFor(cwd),
		metadataLoader: options.metadataLoader ?? defaultMetadataLoader,
	};
}

async function loadLocalWorktreeStatus(
	pi: ExecGateway,
	cwd: string,
	options: LoadLocalWorktreeStatusOptions = {},
): Promise<LocalWorktreeStatus> {
	return loadLocalWorktreeStatusReal(pi, cwd, withDefaultLocalOptions(cwd, options));
}

async function loadGtStatus(options: LoadGtStatusOptions) {
	return loadGtStatusReal({
		...options,
		metadataLoader: options.metadataLoader ?? defaultMetadataLoader,
	});
}

async function loadFormattedStatus(
	script: ScriptedExec[],
	metadata: GraphiteMetadataStatus = trackedMetadata(),
): Promise<{ pi: FakePi; formatted: string }> {
	const pi = new FakePi(script);
	const status = await loadGtStatus({ pi, cwd: ROOT, metadataLoader: metadataLoaderFor(metadata) });
	return { pi, formatted: formatGtStatus(status) };
}

async function loadComposedWorktreeStatus(
	pi: ExecGateway,
	cwd: string,
	options: LoadLocalWorktreeStatusOptions = {},
): Promise<WorktreeStatus> {
	const local = await loadLocalWorktreeStatus(pi, cwd, options);
	const gh = await loadWorktreeGhStatus(pi, cwd, {
		identity: local.identity,
		signal: options.signal,
	});
	return combineWorktreeStatus(local, gh);
}

function ghNoPrSteps(): ScriptedExec[] {
	return [remoteOriginStep(), ghWorktreePrStep({ nodes: [] })];
}

function ghWorktreePrStep(options: {
	nodes: Array<{
		number: number;
		headOid?: string;
		passingChecks?: number;
		pendingChecks?: number;
		failingChecks?: number;
		unknownChecks?: number;
		unresolvedThreads?: number;
		totalThreads?: number;
		threadsHasMore?: boolean;
		checksHasMore?: boolean;
	}>;
	result?: Partial<ExecResult> | undefined;
}): ScriptedExec {
	return step(
		"gh",
		[
			"api",
			"graphql",
			"-f",
			`query=${githubWorktreePrStatusQuery}`,
			"-f",
			"owner=dagster-io",
			"-f",
			"repo=asdl-tools",
			"-f",
			"headRefName=feature/current",
		],
		options.result ?? {
			stdout: JSON.stringify({
				data: {
					repository: {
						pullRequests: {
							nodes: options.nodes.map((node) => worktreePrNode(node)),
						},
					},
				},
			}),
		},
	);
}

function worktreePrNode(options: {
	number: number;
	headOid?: string;
	passingChecks?: number;
	pendingChecks?: number;
	failingChecks?: number;
	unknownChecks?: number;
	unresolvedThreads?: number;
	totalThreads?: number;
	threadsHasMore?: boolean;
	checksHasMore?: boolean;
}): unknown {
	const unresolvedThreads = options.unresolvedThreads ?? 0;
	const totalThreads = options.totalThreads ?? unresolvedThreads;
	const resolvedThreads = Math.max(0, totalThreads - unresolvedThreads);
	return {
		number: options.number,
		url: `https://github.com/dagster-io/asdl-tools/pull/${options.number}`,
		headRefName: "feature/current",
		headRefOid: options.headOid ?? HEAD_OID,
		statusCheckRollup: {
			contexts: {
				pageInfo: { hasNextPage: options.checksHasMore ?? false },
				nodes: [
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
			},
		},
		reviewThreads: {
			totalCount: totalThreads,
			pageInfo: { hasNextPage: options.threadsHasMore ?? false },
			nodes: [
				...Array.from({ length: unresolvedThreads }, () => ({ isResolved: false })),
				...Array.from({ length: resolvedThreads }, () => ({ isResolved: true })),
			],
		},
	};
}

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
				details: {
					prLinks: [
						{ number: 489, url: "https://app.graphite.com/github/pr/dagster-io/asdl-tools/489" },
					],
				},
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
	test("formats gt commits, unknown commits, trunk, and dirty state", () => {
		expect(
			formatGtStatus({ down: "main", up: "-", commits: { type: "count", count: 0 }, dirty: "no" }),
		).toBe("[gt] ↓ main · ↑ - · 0 commits");
		expect(
			formatGtStatus({ down: "main", up: "-", commits: { type: "count", count: 1 }, dirty: "no" }),
		).toBe("[gt] ↓ main · ↑ - · 1 commit");
		expect(
			formatGtStatus({ down: "main", up: "-", commits: { type: "unknown" }, dirty: "no" }),
		).toBe("[gt] ↓ main · ↑ - · commits ?");
		expect(
			formatGtStatus({ down: "main", up: "-", commits: { type: "count", count: 0 }, dirty: "yes" }),
		).toBe("[gt] ↓ main · ↑ - · 0 commits · ✗");
		expect(
			formatGtStatus({
				down: undefined,
				up: "<multiple>",
				commits: { type: "not-applicable" },
				dirty: "no",
			}),
		).toBe("[gt] ↑ <multiple>");
	});

	test("formats gh landability from unresolved comments and action buckets", () => {
		expect(
			formatGhStatus({
				type: "available",
				prNumber: 1736,
				threads: { unresolved: 0, total: 8, hasMore: false },
				checks: { passing: 16, pending: 0, failing: 0, unknown: 0 },
			}),
		).toBe("[gh] #1736 · comments 8/8 · actions 16✓ · landable");
		expect(
			formatGhStatus({
				type: "available",
				prNumber: 1736,
				threads: { unresolved: 18, total: 18, hasMore: false },
				checks: { passing: 16, pending: 0, failing: 0, unknown: 0 },
			}),
		).toBe("[gh] #1736 · comments 0/18 · actions 16✓");
		expect(
			formatGhStatus({
				type: "available",
				prNumber: 1736,
				threads: { unresolved: 2, total: 100, hasMore: true },
				checks: { passing: 16, pending: 3, failing: 1, unknown: 0 },
			}),
		).toBe("[gh] #1736 · comments 98/100+ · actions 3⏳ 1✗");
		expect(formatGhStatus({ type: "no-pr" })).toBe("[gh] no PR");
		expect(formatGhStatus({ type: "head-mismatch" })).toBe("[gh] local ahead of PR");
		expect(formatGhStatus({ type: "unavailable" })).toBe("[gh] unavailable");
		expect(
			formatGhStatus({ type: "unavailable", message: "gh api graphql exited 1: timeout" }),
		).toBe("[gh] unavailable: gh api graphql exited 1: timeout");
	});

	test("colors gh landability by state without changing stripped text", () => {
		const blocked = formatGhStatus(
			{
				type: "available",
				prNumber: 1736,
				threads: { unresolved: 2, total: 100, hasMore: true },
				checks: { passing: 16, pending: 3, failing: 1, unknown: 0 },
			},
			MARKER_THEME,
		);
		expect(blocked).toContain("<dim>[gh]</dim>");
		expect(blocked).toContain("<accent>#1736</accent>");
		expect(blocked).toContain("<warning>98/100+</warning>");
		expect(blocked).toContain("<warning>3⏳</warning>");
		expect(blocked).toContain("<error>1✗</error>");
		expect(formatGhStatus({ type: "no-pr" }, MARKER_THEME)).toBe("<dim>[gh] no PR</dim>");
	});
});

describe("composed local and gh worktree status loading", () => {
	test("returns unavailable brmem status without throwing when the CLI is unavailable", async () => {
		const pi = new OrderlessFakePi([
			brmemListStep({ code: 127, stderr: "brmem: command not found" }),
			...basicGitStatusScript(),
		]);

		const status = await loadLocalWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(status.brmem).toBe("unavailable");
		expect(status.gt).toEqual({
			down: "main",
			up: "-",
			commits: { type: "count", count: 1 },
			dirty: "no",
		});
	});

	test("formats base namespace brmem entries from canonical namespace strings", async () => {
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

		const status = await loadLocalWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(status.brmem).toBe("(base: scratch) (notes: adapter)");
	});

	test("does not normalize legacy handoffs or session-artifact handoff paths", async () => {
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

		const status = await loadLocalWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expect(status.brmem).toBe(
			"(handoff: resume-resource-audit-session.md) (handoffs: resume-resource-audit-session.md) (session-artifacts: handoffs, logs)",
		);
	});

	test("degrades malformed brmem JSON and entries nonfatally", async () => {
		const malformedJsonPi = new OrderlessFakePi([
			brmemListStep({ stdout: "not json" }),
			...basicGitStatusScript(),
		]);
		expect((await loadLocalWorktreeStatus(malformedJsonPi, ROOT)).brmem).toBe("unavailable");
		malformedJsonPi.assertDone();

		const malformedEntriesPi = new OrderlessFakePi([
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
		expect((await loadLocalWorktreeStatus(malformedEntriesPi, ROOT)).brmem).toBe(
			"(notes: adapter)",
		);
		malformedEntriesPi.assertDone();
	});

	test("surfaces graphite metadata diagnostics from the local loader", async () => {
		const diagnostics: GraphiteMetadataWorkerDiagnostic[] = [];
		const onDiagnostic = (diagnostic: GraphiteMetadataWorkerDiagnostic): void => {
			diagnostics.push(diagnostic);
		};
		const metadataLoader: GraphiteMetadataLoader = async ({ onDiagnostic: actualOnDiagnostic }) => {
			actualOnDiagnostic?.({ type: "worker-timeout", timeoutMs: 7 });
			return trackedMetadata();
		};
		const pi = new OrderlessFakePi([brmemListStep({}), ...basicGitStatusScript()]);

		const status = await loadLocalWorktreeStatus(pi, ROOT, { metadataLoader, onDiagnostic });

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(status.gtMetadataDiagnostic).toEqual({ type: "worker-timeout", timeoutMs: 7 });
		expect(diagnostics).toEqual([{ type: "worker-timeout", timeoutMs: 7 }]);
		const fullStatus = combineWorktreeStatus(status, { type: "no-pr" });
		expect(formatWorktreeStatus(fullStatus).at(-1)).toBe(
			"[gt] metadata worker timed out after 7ms",
		);
	});

	test("loads gh status for current branch PR landability", async () => {
		const pi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			remoteOriginStep(),
			ghWorktreePrStep({
				nodes: [
					{
						number: 1736,
						passingChecks: 4,
						pendingChecks: 2,
						failingChecks: 1,
						unresolvedThreads: 3,
						totalThreads: 5,
					},
				],
			}),
			...basicGitStatusScript(),
		]);

		const status = await loadComposedWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(pi.calls.filter((call) => call.command === "gh")).toHaveLength(1);
		expect(status.gh).toMatchObject({
			type: "available",
			prNumber: 1736,
			threads: { unresolved: 3, total: 5, hasMore: false },
			checks: { passing: 4, pending: 2, failing: 1, unknown: 0 },
		});
		expect(formatWorktreeStatus(status)).toContain("[gh] #1736 · comments 2/5 · actions 2⏳ 1✗");
	});

	test("treats a PR head OID mismatch as local ahead of PR", async () => {
		const pi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			remoteOriginStep(),
			ghWorktreePrStep({
				nodes: [{ number: 1736, headOid: "different", passingChecks: 4 }],
			}),
			...basicGitStatusScript(),
		]);

		const status = await loadComposedWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expect(status.gh).toEqual({ type: "head-mismatch" });
		expect(formatWorktreeStatus(status)).toContain("[gh] local ahead of PR");
		expect(formatWorktreeStatus(status).join("\n")).not.toContain("#1736");
	});

	test("unknown gh checks block landability", async () => {
		const pi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			remoteOriginStep(),
			ghWorktreePrStep({
				nodes: [{ number: 1736, passingChecks: 4, unknownChecks: 1 }],
			}),
			...basicGitStatusScript(),
		]);

		const status = await loadComposedWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expect(status.gh).toMatchObject({ type: "available", checks: { unknown: 1 } });
		const formatted = formatWorktreeStatus(status);
		expect(formatted).toContain("[gh] #1736 · comments 0/0 · actions 1?");
		expect(formatted.join("\n")).not.toContain("landable");
	});

	test("loads local worktree status without invoking gh", async () => {
		const pi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			...basicGitStatusScript(),
		]);

		const status = await loadLocalWorktreeStatus(pi, ROOT);

		pi.assertDone();
		expect(pi.calls.some((call) => call.command === "gh")).toBe(false);
		expect(status.gt).toEqual({
			down: "main",
			up: "-",
			commits: { type: "count", count: 1 },
			dirty: "no",
		});
	});

	test("degrades gh status nonfatally when repository or branch facts are unavailable", async () => {
		const missingOriginPi = new OrderlessFakePi([
			step("git", ["config", "--get", "remote.origin.url"], { code: 1 }),
		]);
		expect(
			await loadWorktreeGhStatus(missingOriginPi, ROOT, { identity: identityFor(ROOT) }),
		).toEqual({
			type: "unavailable",
			message: "could not identify GitHub repository from origin remote",
		});
		missingOriginPi.assertDone();

		const notBranchPi = new OrderlessFakePi([]);
		expect(
			await loadWorktreeGhStatus(notBranchPi, ROOT, {
				identity: identityFor(ROOT, { head: { type: "detached" } }),
			}),
		).toEqual({ type: "unavailable", message: "not on a branch" });
		notBranchPi.assertDone();
	});

	test("classifies no-PR, auth failure, and GraphQL failure GH responses", async () => {
		const noPrPi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			...ghNoPrSteps(),
			...basicGitStatusScript(),
		]);
		expect((await loadComposedWorktreeStatus(noPrPi, ROOT)).gh).toEqual({ type: "no-pr" });
		noPrPi.assertDone();

		const authPi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			remoteOriginStep(),
			ghWorktreePrStep({ nodes: [], result: { code: 1, stderr: "HTTP 401: Bad credentials" } }),
			...basicGitStatusScript(),
		]);
		expect((await loadComposedWorktreeStatus(authPi, ROOT)).gh).toEqual({
			type: "unavailable",
			message: "gh api graphql exited 1: HTTP 401: Bad credentials",
		});
		authPi.assertDone();

		const graphQlPi = new OrderlessFakePi([
			brmemListStep({ stdout: JSON.stringify({ exit_code: 0, data: { entries: [] } }) }),
			remoteOriginStep(),
			ghWorktreePrStep({
				nodes: [],
				result: { code: 1, stderr: "GraphQL: API rate limit exceeded" },
			}),
			...basicGitStatusScript(),
		]);
		const graphQlStatus = await loadComposedWorktreeStatus(graphQlPi, ROOT);
		expect(graphQlStatus.gh).toEqual({
			type: "unavailable",
			message: "gh api graphql exited 1: GraphQL: API rate limit exceeded",
		});
		expect(formatWorktreeStatus(graphQlStatus)).toContain(
			"[gh] unavailable: gh api graphql exited 1: GraphQL: API rate limit exceeded",
		);
		graphQlPi.assertDone();
	});
});

describe("loadGtStatus", () => {
	test("uses an injected async metadata loader before deriving downstack and upstack status", async () => {
		const metadataLoader: GraphiteMetadataLoader = async ({ cwd, signal }) => {
			expect(cwd).toBe(ROOT);
			expect(signal).toBeUndefined();
			return trackedMetadata({ children: ["feature/child"] });
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
		const metadataLoader: GraphiteMetadataLoader = async ({ onDiagnostic: actualOnDiagnostic }) => {
			expect(actualOnDiagnostic).toBe(onDiagnostic);
			actualOnDiagnostic?.({ type: "worker-timeout", timeoutMs: 1 });
			return trackedMetadata();
		};
		const pi = new FakePi([revListStep("main", 1), dirtyStep()]);

		const status = await loadGtStatus({ pi, cwd: ROOT, metadataLoader, onDiagnostic });

		pi.assertDone();
		expect(formatGtStatus(status)).toBe("[gt] ↓ main · ↑ - · 1 commit");
		expect(diagnostics).toEqual([{ type: "worker-timeout", timeoutMs: 1 }]);
		expectNoGtCalls(pi);
	});

	test("degrades when metadata is unavailable or untracked", async () => {
		const missingDb = await loadFormattedStatus([dirtyStep()], {
			type: "unavailable",
			reason: "missing-db",
			currentBranch: "feature/current",
		});
		missingDb.pi.assertDone();
		expect(missingDb.formatted).toBe("[gt] ↓ - · ↑ - · commits ?");

		const untracked = await loadFormattedStatus([dirtyStep()], {
			type: "untracked",
			currentBranch: "feature/current",
		});
		untracked.pi.assertDone();
		expect(untracked.formatted).toBe("[gt] ↓ - · ↑ - · commits ?");
	});

	test("uses Graphite metadata parent for commit counts and dirty state", async () => {
		const zero = await loadFormattedStatus([revListStep("main", 0), dirtyStep()]);
		zero.pi.assertDone();
		expectNoGtCalls(zero.pi);
		expect(zero.formatted).toBe("[gt] ↓ main · ↑ - · 0 commits");

		const dirty = await loadFormattedStatus([revListStep("main", 0), dirtyStep(" M file.txt\n")]);
		dirty.pi.assertDone();
		expect(dirty.formatted).toBe("[gt] ↓ main · ↑ - · 0 commits · ✗");
	});

	test("omits downstack and rev-list on Graphite trunk", async () => {
		const { pi, formatted } = await loadFormattedStatus(
			[dirtyStep()],
			trackedMetadata({
				currentBranch: "master",
				parent: undefined,
				children: ["feature/one", "feature/two"],
				isCurrentTrunk: true,
			}),
		);

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(formatted).toBe("[gt] ↑ <multiple>");
		expect(pi.calls.some((call) => call.command === "git" && call.args[0] === "rev-list")).toBe(
			false,
		);
	});

	test("formats multiple metadata children as multiple upstack branches", async () => {
		const { pi, formatted } = await loadFormattedStatus(
			[revListStep("main", 1), dirtyStep()],
			trackedMetadata({ children: ["feature/one", "feature/two"] }),
		);

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(formatted).toBe("[gt] ↓ main · ↑ <multiple> · 1 commit");
	});

	test("does not load passive PR status from gt branch info", async () => {
		const { pi, formatted } = await loadFormattedStatus([revListStep("main", 1), dirtyStep()]);

		pi.assertDone();
		expectNoGtCalls(pi);
		expect(formatted).toBe("[gt] ↓ main · ↑ - · 1 commit");
		expect(formatted).not.toContain("pr:");
	});
});
