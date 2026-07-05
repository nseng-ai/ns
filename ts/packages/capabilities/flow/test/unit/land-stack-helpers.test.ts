import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@ns/core/command";
import { createManualClock } from "@ns/core/time/testing";
import { ScriptedQueue } from "@ns/core/test-kit";
import { shortSha } from "../../src/commit-display/index.ts";
import { outputTail } from "../../src/land/stack/command-exec.ts";
import {
	createLandGraphiteCommandChannel,
	formatGraphiteOperation,
	isGtDeleteMissingBranch,
	parseGitCheckedOutElsewhere,
	stripAnsi,
} from "../../src/land/stack/graphite-command-channel.ts";
import { landStackFailure, type LandStackResult } from "../../src/land/stack/errors.ts";
import {
	createLandUiCommandIo,
	LandStackCommandStream,
	withCommandStreaming,
} from "../../src/land/stack/command-stream.ts";
import { landArgumentCompletions, parseArgs } from "../../src/land/land-stack.ts";
import type { FlowLandExternalCallTelemetryEvent } from "../../src/land/stack/external-call-telemetry.ts";
import {
	landCommandOptionSpecs,
	landRawArgsFromCommandRequest,
} from "../../src/land/stack/flags.ts";
import {
	derivePathToTrunk,
	deriveDescendantSubtree,
	detectForkViolations,
	type GraphiteTopology,
} from "../../src/land/stack/graphite-topology.ts";
import { validateOpenPrBasics } from "../../src/land/api.ts";
import type { LandOutcome } from "../../src/land/api.ts";
import {
	formatFailure,
	formatPlan,
	formatSuccessNotification,
	usage,
} from "../../src/land/stack/presentation.ts";
import { detectInProgressOperation } from "../../src/land/stack/stack-facts.ts";
import type {
	LandStackExtensionAPI,
	LandStackCommandContext,
	LandedPr,
	FlowLandingPlan,
	NotifyLevel,
	PullRequestSnapshot,
} from "../../src/land/stack/types.ts";
import {
	detectWorktreeConflicts,
	isManagedSlotPath,
	parseWorktreeList,
	slotNameFromPath,
} from "../../src/land/stack/worktrees.ts";
import { TOPOLOGY_COMMAND, topologyArgs } from "./land-test-helpers.ts";

const ROOT = "/repo";

const TRUNK = "main";

const CURRENT = "feature-b";

const DESCENDANT = "feature-c";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const GIT_COMMON_DIR = `${ROOT}/.git`;

const DB_PATH = `${GIT_COMMON_DIR}/.graphite_metadata.db`;

const TOPOLOGY_ARGS = topologyArgs(DB_PATH);

type MessageRenderer = Parameters<NonNullable<LandStackExtensionAPI["registerMessageRenderer"]>>[1];

type SentMessage = Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[1];
};

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface Confirmation {
	title: string;
	message: string;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

interface WidgetUpdate {
	key: string;
	value: string[] | undefined;
	options: { placement?: "aboveEditor" | "belowEditor" } | undefined;
}

class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(
		message: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0],
		options?: SentMessage["options"],
	): void {
		this.messages.push({ ...message, options });
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${formatCommand(command, args)}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
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
		...(overrides.startupError === undefined ? {} : { startupError: overrides.startupError }),
	};
}

function expectSuccess<T>(result: LandStackResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

function expectFailure<T>(result: LandStackResult<T>) {
	expect(result.type).toBe("failure");
	if (result.type !== "failure") {
		throw new Error("Expected land-stack failure, got success.");
	}
	return result.failure;
}

function expectDomainFailure(result: LandOutcome) {
	expect(result.type).toBe("failure");
	if (result.type !== "failure") {
		throw new Error("Expected land-domain failure, got completed.");
	}
	return result.failure;
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function createContext(options: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {}): {
	ctx: LandStackCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	const confirmAnswers = [...(options.confirms ?? [true])];
	let waits = 0;

	const ctx: LandStackCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string): Promise<boolean> {
				confirmations.push({ title, message });
				return confirmAnswers.shift() ?? false;
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
			setWidget(
				key: string,
				value: string[] | undefined,
				options?: { placement?: "aboveEditor" | "belowEditor" },
			): void {
				widgets.push({ key, value, options });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, confirmations, statuses, widgets, waitForIdleCalls: () => waits };
}

function commandMessagesText(messages: SentMessage[]): string {
	return messages.map((message) => messageContentText(message.content)).join("\n");
}

function messageContentText(content: SentMessage["content"]): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

function prSnapshot(overrides: {
	number: number;
	branch: string;
	base: string;
	sha: string;
	title?: string;
	body?: string | null;
	state?: string;
	isDraft?: boolean;
	mergedAt?: string | null;
}): PullRequestSnapshot {
	return {
		number: overrides.number,
		title: overrides.title ?? `PR ${overrides.number}`,
		body: overrides.body === undefined ? `Body for PR ${overrides.number}` : overrides.body,
		state: overrides.state ?? "OPEN",
		isDraft: overrides.isDraft ?? false,
		headRefName: overrides.branch,
		baseRefName: overrides.base,
		headRefOid: overrides.sha,
		mergeStateStatus: "CLEAN",
		url: `https://github.example/pull/${overrides.number}`,
		mergedAt: overrides.mergedAt ?? null,
	};
}

function worktreeOutput(entries: Array<{ path: string; branch?: string }>): string {
	return entries
		.map((entry) => {
			const lines = [`worktree ${entry.path}`, "HEAD 0000000000000000000000000000000000000000"];
			if (entry.branch) {
				lines.push(`branch refs/heads/${entry.branch}`);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}

function topologyOf(
	entries: Record<string, { parent?: string; children?: string[]; trunk?: boolean }>,
): GraphiteTopology {
	return new Map(
		Object.entries(entries).map(([branch, entry]) => [
			branch,
			{
				branch,
				parent: entry.parent,
				children: entry.children ?? [],
				validationResult: entry.trunk ? "TRUNK" : undefined,
				isTrunkMarked: entry.trunk ?? false,
				childrenCorruption: undefined,
			},
		]),
	);
}

describe("land-stack pure helpers", () => {
	test("derives land argument completions from the flag descriptors", () => {
		expect(landArgumentCompletions("")).toEqual([
			{ value: "--yes", label: "--yes" },
			{ value: "--dry-run", label: "--dry-run" },
			{ value: "--preserve", label: "--preserve" },
			{ value: "--force", label: "--force" },
			{ value: "--verbose", label: "--verbose" },
			{ value: "--help", label: "--help" },
		]);
		expect(landArgumentCompletions("--pr")).toEqual([{ value: "--preserve", label: "--preserve" }]);
		expect(landArgumentCompletions("--missing")).toBeNull();
	});

	test("parses supported command arguments", () => {
		expect(expectSuccess(parseArgs("--yes --dry-run --preserve --force --verbose --help"))).toEqual(
			{
				shouldSkipConfirmation: true,
				isDryRun: true,
				shouldPreserveSlot: true,
				shouldForceCleanup: true,
				shouldShowHelp: true,
				shouldStreamVerboseOutput: true,
			},
		);
		expect(expectSuccess(parseArgs("-y -p -f -h"))).toEqual({
			shouldSkipConfirmation: true,
			isDryRun: false,
			shouldPreserveSlot: true,
			shouldForceCleanup: true,
			shouldShowHelp: true,
			shouldStreamVerboseOutput: false,
		});
		expect(expectSuccess(parseArgs(""))).toMatchObject({
			shouldPreserveSlot: false,
		});
		expect(expectFailure(parseArgs("--wat")).message).toContain(
			"Unknown /ns:flow:land argument: --wat",
		);
		expect(expectFailure(parseArgs("-n")).message).toContain("Unknown /ns:flow:land argument: -n");
		expect(expectFailure(parseArgs("-v")).message).toContain("Unknown /ns:flow:land argument: -v");
	});

	test("derives usage and Clinkr wrapper flag surfaces from the descriptors", () => {
		expect(usage()).toContain(
			"/ns:flow:land [--yes] [--dry-run] [--preserve] [--force] [--verbose] [--help]",
		);
		expect(usage()).toContain(
			"  --preserve, -p  Keep the current managed slot and landed local branch after successful landing.",
		);
		expect(usage()).toContain("  --help, -h      Show this help.");
		expect(landCommandOptionSpecs()).toEqual({
			yes: { short: "-y" },
			dryRun: { short: "-n" },
			preserve: { short: "-p" },
			force: { short: "-f" },
			verbose: { short: "-v" },
		});
		expect(
			landRawArgsFromCommandRequest({
				yes: true,
				dryRun: true,
				preserve: true,
				force: true,
				verbose: true,
			}),
		).toEqual(["--yes", "--dry-run", "--preserve", "--force", "--verbose"]);
	});

	test("derives the landing path from Graphite metadata", () => {
		const topology = topologyOf({
			main: { children: ["feature-a"], trunk: true },
			"feature-a": { parent: "main", children: ["feature-b"] },
			"feature-b": { parent: "feature-a", children: [] },
		});

		expect(
			expectSuccess(
				derivePathToTrunk({ topology, current: "feature-b", trunk: "main", dbPath: DB_PATH }),
			),
		).toEqual(["feature-a", "feature-b"]);
		expect(
			expectSuccess(
				derivePathToTrunk({ topology, current: "main", trunk: "main", dbPath: DB_PATH }),
			),
		).toEqual([]);
	});

	test("fails closed when the current branch is untracked or the parent chain is broken", () => {
		const topology = topologyOf({
			main: { trunk: true },
			orphan: { children: [] },
		});

		expect(
			expectFailure(
				derivePathToTrunk({ topology, current: "ghost", trunk: "main", dbPath: DB_PATH }),
			).message,
		).toContain(`Current branch ghost is not tracked in Graphite metadata (${DB_PATH})`);
		expect(
			expectFailure(
				derivePathToTrunk({ topology, current: "orphan", trunk: "main", dbPath: DB_PATH }),
			).message,
		).toContain("ends at orphan without reaching trunk main");

		const cyclic = topologyOf({
			"feature-a": { parent: "feature-b", children: [] },
			"feature-b": { parent: "feature-a", children: [] },
		});
		expect(
			expectFailure(
				derivePathToTrunk({
					topology: cyclic,
					current: "feature-a",
					trunk: "main",
					dbPath: DB_PATH,
				}),
			).message,
		).toContain("cycle");
	});

	test("derives the full descendant subtree in pre-order, not just the first-child chain", () => {
		const topology = topologyOf({
			"feature-b": { children: ["feature-c"] },
			"feature-c": { parent: "feature-b", children: ["feature-d", "feature-e"] },
			"feature-d": { parent: "feature-c", children: [] },
			"feature-e": { parent: "feature-c", children: [] },
		});

		expect(expectSuccess(deriveDescendantSubtree(topology, "feature-b"))).toEqual([
			"feature-c",
			"feature-d",
			"feature-e",
		]);
		expect(expectSuccess(deriveDescendantSubtree(topology, "feature-d"))).toEqual([]);
	});

	test("detects forks on the landing path but allows multiple current descendants", () => {
		const topology = topologyOf({
			main: { children: ["feature-a", "other"], trunk: true },
			"feature-a": { parent: "main", children: ["feature-b", "side"] },
			"feature-b": { parent: "feature-a", children: [] },
			side: { parent: "feature-a", children: ["side-2"] },
			"side-2": { parent: "side", children: [] },
		});

		// trunk is excluded from the landing path, so its many children do not violate
		expect(detectForkViolations(topology, ["feature-a", "feature-b"])).toEqual([
			{
				forkPoint: "feature-a",
				expectedChild: "feature-b",
				siblings: [{ branch: "side", subtree: ["side", "side-2"] }],
			},
		]);

		expect(
			detectForkViolations(topologyOf({ "feature-b": { children: ["feature-c", "feature-d"] } }), [
				"feature-b",
			]),
		).toEqual([]);

		expect(detectForkViolations(topology, [])).toEqual([]);
	});

	test("detects fork violations with cyclic sibling subtrees using a truncated walk", () => {
		const violations = detectForkViolations(
			topologyOf({
				"feature-a": { children: ["feature-b", "side"] },
				"feature-b": { parent: "feature-a", children: [] },
				side: { parent: "feature-a", children: ["side-2"] },
				"side-2": { parent: "side", children: ["side"] },
			}),
			["feature-a", "feature-b"],
		);

		expect(violations).toEqual([
			{
				forkPoint: "feature-a",
				expectedChild: "feature-b",
				siblings: [{ branch: "side", subtree: ["side", "side-2"] }],
			},
		]);
	});

	test("parses git worktree porcelain output", () => {
		expect(
			parseWorktreeList(
				[
					"worktree /repo",
					"HEAD 1111111111111111111111111111111111111111",
					"branch refs/heads/feature-a",
					"",
					"worktree /detached",
					"HEAD 2222222222222222222222222222222222222222",
					"detached",
				].join("\n"),
			),
		).toEqual([{ path: "/repo", branch: "feature-a" }, { path: "/detached" }]);
	});

	test("detects active rebase state with an injected path-existence check", async () => {
		const pi = new FakePi([
			step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "REVERT_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: ".git/rebase-merge\n" }),
		]);

		const operation = await detectInProgressOperation(pi, ROOT, {
			pathExists: (path) => path === `${ROOT}/.git/rebase-merge`,
		});

		pi.assertDone();
		expect(operation).toBe("rebase");
	});

	test("ignores stale rebase pseudo-refs when active rebase directories are absent", async () => {
		const pi = new FakePi([
			step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "-q", "--verify", "REVERT_HEAD"], { code: 1 }),
			step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: ".git/rebase-merge\n" }),
			step("git", ["rev-parse", "--git-path", "rebase-apply"], { stdout: ".git/rebase-apply\n" }),
		]);

		const operation = await detectInProgressOperation(pi, ROOT, {
			pathExists: () => false,
		});

		pi.assertDone();
		expect(operation).toBeUndefined();
	});

	test("detects worktree conflicts with injected path normalization", async () => {
		const slotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01";
		const pi = new FakePi([
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([
					{ path: "/symlink/repo", branch: CURRENT },
					{ path: slotPath, branch: "feature-a" },
				]),
			}),
		]);

		const conflicts = expectSuccess(
			await detectWorktreeConflicts(pi, ROOT, CURRENT, ["feature-a", CURRENT], {
				normalizePath: (path) =>
					path === ROOT || path === "/symlink/repo" ? "/real/repo" : `/real${path}`,
			}),
		);

		pi.assertDone();
		expect(conflicts).toEqual([
			{ branch: CURRENT, path: "/symlink/repo", kind: "current" },
			{ branch: "feature-a", path: slotPath, kind: "managed-slot" },
		]);
	});

	test("treats legacy .slots worktrees as manual worktree conflicts", async () => {
		const legacySlotPath = "/Users/me/.slots/repos/repo/worktrees/slot-01";
		const pi = new FakePi([
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: legacySlotPath, branch: "feature-a" },
				]),
			}),
		]);

		const conflicts = expectSuccess(
			await detectWorktreeConflicts(pi, ROOT, CURRENT, ["feature-a", CURRENT]),
		);

		pi.assertDone();
		expect(conflicts).toEqual([
			{ branch: CURRENT, path: ROOT, kind: "current" },
			{ branch: "feature-a", path: legacySlotPath, kind: "manual-worktree" },
		]);
	});

	test("detects managed slot paths and extracts slot names", () => {
		const legacySlotPath = "/Users/me/.slots/repos/sdl-tools/worktrees/slot-04";
		const xdgSlotPath = "/Users/me/.local/state/ns/slots/repos/sdl-tools/worktrees/slot-04";
		const windowsXdgSlotPath =
			"C:\\Users\\me\\AppData\\Local\\ns\\slots\\repos\\sdl-tools\\worktrees\\slot-04";
		expect(isManagedSlotPath(legacySlotPath)).toBe(false);
		expect(isManagedSlotPath(xdgSlotPath)).toBe(true);
		expect(isManagedSlotPath(windowsXdgSlotPath)).toBe(true);
		expect(slotNameFromPath(xdgSlotPath)).toBe("slot-04");
		expect(isManagedSlotPath("/tmp/slots/repos/repo/worktrees/slot-04")).toBe(false);
		expect(isManagedSlotPath("/tmp/sdl-tools/worktrees/slot-04")).toBe(false);
		expect(slotNameFromPath("/tmp/sdl-tools/worktrees/slot-04")).toBe("slot-04");
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gt", ["delete", "feature/foo", "-f"])).toBe("gt delete feature/foo -f");
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe(
			"gh pr view 'branch name' 'can'\\''t'",
		);
	});

	test("strips ANSI and truncates output tails", () => {
		expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
		expect(stripAnsi("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007")).toBe(
			"#101",
		);
		const lines = Array.from({ length: 45 }, (_, index) => `line ${index + 1}`).join("\n");
		const tail = outputTail(lines);
		expect(tail.startsWith("… 5 earlier line(s) omitted\nline 6")).toBe(true);
		expect(tail).toContain("line 45");
	});

	test("parses Git checked-out-elsewhere failures", () => {
		expect(
			parseGitCheckedOutElsewhere(
				execResult({
					code: 1,
					stderr: "fatal: 'master' is already checked out at '/Users/schrockn/code/sdl-tools'\n",
				}),
			),
		).toEqual({ branch: "master", path: "/Users/schrockn/code/sdl-tools" });
		expect(
			parseGitCheckedOutElsewhere(
				execResult({ code: 1, stderr: "ERROR: authentication failed\n" }),
			),
		).toBeUndefined();
	});

	test("detects benign Graphite delete failures", () => {
		expect(
			isGtDeleteMissingBranch(
				execResult({ code: 1, stderr: "ERROR: Could not find branch feature-a.\n" }),
				"feature-a",
			),
		).toBe(true);
		expect(
			isGtDeleteMissingBranch(
				execResult({ code: 1, stderr: "ERROR: authentication failed\n" }),
				"feature-a",
			),
		).toBe(false);
	});

	test("runs a new Graphite mutation through an operation spec", async () => {
		const pi = new FakePi([step("gt", ["untrack", "stale-branch"])]);
		const graphite = createLandGraphiteCommandChannel({ pi });
		const operation = { kind: "untrack-local-branch", branch: "stale-branch" } as const;

		const result = await graphite.run({ operation, cwd: ROOT, timeoutMs: 123 });

		pi.assertDone();
		expect(result.code).toBe(0);
		expect(formatGraphiteOperation(operation)).toBe("gt untrack stale-branch");
	});

	test("formats plans and failures", () => {
		const plan: FlowLandingPlan = {
			repoRoot: ROOT,
			metadataDbPath: DB_PATH,
			stack: {
				trunk: TRUNK,
				current: CURRENT,
				actualCurrentBranch: CURRENT,
				landingTargetBranch: CURRENT,
				landingBranches: ["feature-a", CURRENT],
				remainingLandingBranches: [],
				descendantBranches: [DESCENDANT],
				descendantRootBranches: [DESCENDANT],
				warnings: ["off-column branch ignored"],
			},
			branchPlans: [
				{
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }),
				},
				{
					branch: CURRENT,
					localSha: SHA_B,
					pr: prSnapshot({ number: 102, branch: CURRENT, base: "feature-a", sha: SHA_B }),
				},
			],
			prSubmitRequirements: [],
			submitRestackRequirements: [],
			managedSlotConflicts: [
				{
					branch: "feature-a",
					path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
					kind: "managed-slot",
				},
			],
			descendantMaintenance: { kind: "auto", branches: [DESCENDANT], targetBranches: [DESCENDANT] },
		};
		const formatted = formatPlan(plan);
		expect(formatted).toContain("Land Graphite stack path: main -> feature-a -> feature-b");
		expect(formatted).toContain("Will leave open and try to restack/update after target PRs land:");
		expect(formatted).toContain("slot-01 feature-a");
		expect(formatted).toContain(
			"gh pr merge <number> --squash --match-head-commit <headRefOid> --subject <PR title> --body <PR body>",
		);
		const planWithSubmit: FlowLandingPlan = {
			...plan,
			prSubmitRequirements: [
				{
					branch: "feature-a",
					prNumber: 101,
					localSha: SHA_B,
					prHeadSha: SHA_A,
					baseRefName: TRUNK,
					expectedBaseRefName: TRUNK,
					reasons: ["head aaaaaaa != local bbbbbbb"],
				},
			],
		};
		const formattedWithSubmit = formatPlan(planWithSubmit);
		expect(formattedWithSubmit.indexOf("freeing these landing-branch slots only")).toBeLessThan(
			formattedWithSubmit.indexOf("gt submit/update"),
		);

		const landed: LandedPr[] = [{ branch: "feature-a", number: 101, title: "PR 101" }];
		const failure = formatFailure(
			landStackFailure("Restack failed.", {
				failedBranch: CURRENT,
				suggestedAction: "Run gt restack.",
			}),
			landed,
		);
		expect(failure).toContain("Already landed:");
		expect(failure).toContain("Failed at: feature-b");
		expect(failure).toContain("Suggested next action: Run gt restack.");
	});

	test("command streaming returns failed command data when pi.exec throws", async () => {
		class ThrowingPi extends FakePi {
			override async exec(
				command: string,
				args: string[],
				options?: { cwd?: string; timeout?: number },
			): Promise<ExecResult> {
				this.execCalls.push({ command, args: [...args], options });
				throw new Error("spawn failed");
			}
		}

		const pi = new ThrowingPi();
		const context = createContext();
		const commandStream = new LandStackCommandStream(createLandUiCommandIo(pi, context.ctx));
		const streamed = withCommandStreaming(pi, commandStream);

		const result = await streamed.exec("git", ["status"], { cwd: ROOT });

		expect(result).toEqual(
			execResult({ code: 127, stderr: "spawn failed", startupError: "spawn failed" }),
		);
		expect(commandMessagesText(pi.messages)).toContain("✗ $ git status — exit 127");
		expect(commandMessagesText(pi.messages)).toContain("spawn failed");
	});

	test("emits structured external-call telemetry with static gh quota estimates", async () => {
		const manualClock = createManualClock(1_000);
		class DelayedPi extends FakePi {
			override async exec(
				command: string,
				args: string[],
				options?: { cwd?: string; timeout?: number },
			): Promise<ExecResult> {
				const result = await super.exec(command, args, options);
				manualClock.advanceMs(42);
				return result;
			}
		}

		const pi = new DelayedPi([step("gh", ["pr", "view", "101", "--json", "number,title"])]);
		const telemetry: FlowLandExternalCallTelemetryEvent[] = [];
		const context = createContext();
		const commandStream = new LandStackCommandStream(createLandUiCommandIo(pi, context.ctx), {
			clock: manualClock.clock,
			externalCallTelemetry: (event) => telemetry.push(event),
		});
		const streamed = withCommandStreaming(pi, commandStream);

		await streamed.exec("gh", ["pr", "view", "101", "--json", "number,title"], { cwd: ROOT });

		pi.assertDone();
		expect(telemetry).toEqual([
			{
				type: "flow_land.external_call",
				transport: "command",
				category: "github-cli",
				operation: "gh pr view",
				display: "gh pr view 101 --json number,title",
				elapsedMs: 42,
				count: 1,
				status: "success",
				exitCode: 0,
				killed: false,
				quota: {
					kind: "static",
					provider: "github",
					graphqlRequests: 1,
					restRequests: 0,
					rateLimitCost: 1,
					description: "gh pr view --json uses one GraphQL query",
				},
			},
		]);
	});

	test("emits Graphite telemetry and redacts gh merge bodies in telemetry display", async () => {
		const pi = new FakePi([
			step("gt", ["restack", "--upstack"]),
			step("gh", [
				"pr",
				"merge",
				"101",
				"--squash",
				"--match-head-commit",
				SHA_A,
				"--subject",
				"PR title",
				"--body",
				"sensitive PR body",
			]),
		]);
		const telemetry: FlowLandExternalCallTelemetryEvent[] = [];
		const context = createContext();
		const commandStream = new LandStackCommandStream(createLandUiCommandIo(pi, context.ctx), {
			externalCallTelemetry: (event) => telemetry.push(event),
		});
		const streamed = withCommandStreaming(pi, commandStream);

		await streamed.exec("gt", ["restack", "--upstack"], { cwd: ROOT });
		await streamed.exec(
			"gh",
			[
				"pr",
				"merge",
				"101",
				"--squash",
				"--match-head-commit",
				SHA_A,
				"--subject",
				"PR title",
				"--body",
				"sensitive PR body",
			],
			{ cwd: ROOT },
		);

		pi.assertDone();
		expect(telemetry[0]).toMatchObject({
			category: "graphite",
			operation: "gt restack",
			status: "success",
		});
		expect(telemetry[1]).toMatchObject({
			category: "github-cli",
			operation: "gh pr merge",
			display:
				"gh pr merge 101 --squash --match-head-commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --subject 'PR title' --body '<PR body>'",
			quota: {
				kind: "static",
				provider: "github",
				graphqlRequests: 2,
				restRequests: 0,
				rateLimitCost: 2,
				description: "gh pr merge uses one PR finder query plus one mergePullRequest mutation",
			},
		});
		expect(telemetry[1]?.display).not.toContain("sensitive PR body");
	});

	test("labels successful flow exec topology reads in the command stream", async () => {
		const pi = new FakePi([step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS)]);
		const context = createContext();
		const commandStream = new LandStackCommandStream(createLandUiCommandIo(pi, context.ctx));
		const streamed = withCommandStreaming(pi, commandStream);

		await streamed.exec(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { cwd: ROOT });

		pi.assertDone();
		expect(commandMessagesText(pi.messages)).toContain(
			"✓ $ ns flow exec read-graphite-branch-metadata --db-path /repo/.git/.graphite_metadata.db — read Graphite stack topology",
		);
	});

	test("does not label unrelated ns commands as Graphite topology reads", async () => {
		const pi = new FakePi([step("ns", ["flow", "changes"])]);
		const context = createContext();
		const commandStream = new LandStackCommandStream(createLandUiCommandIo(pi, context.ctx));
		const streamed = withCommandStreaming(pi, commandStream);

		await streamed.exec("ns", ["flow", "changes"], { cwd: ROOT });

		pi.assertDone();
		expect(commandMessagesText(pi.messages)).toContain("✓ $ ns flow changes");
		expect(commandMessagesText(pi.messages)).not.toContain("read Graphite stack topology");
	});

	test("does not duplicate rendered UI command stream messages through progress IO", () => {
		const pi = new FakePi();
		const context = createContext({ hasUI: true });
		const phases: string[] = [];
		const commandStream = new LandStackCommandStream(createLandUiCommandIo(pi, context.ctx));

		commandStream.note("Preparing to land 1 PR through feature-a...");

		expect(commandMessagesText(pi.messages)).toContain(
			"→ Preparing to land 1 PR through feature-a...",
		);
		expect(phases).toEqual([]);
		expect(context.notifications).toEqual([]);
	});

	test("mirrors UI command stream messages through progress IO when no renderer is available", () => {
		const context = createContext({ hasUI: true });
		const phases: string[] = [];
		const commandStream = new LandStackCommandStream({
			phase: (message) => phases.push(message),
			notify: () => {},
			message: (message) => phases.push(message),
			clearPhase: () => {},
		});

		commandStream.note("Preparing to land 1 PR through feature-a...");

		expect(phases).toEqual(["→ Preparing to land 1 PR through feature-a..."]);
		expect(context.notifications).toEqual([]);
	});

	test("mirrors command finishes and notes to non-UI notifications", async () => {
		const pi = new FakePi([
			step("git", ["status"]),
			step("git", ["fail"], { code: 2, stdout: "stdout line", stderr: "stderr line" }),
		]);
		const context = createContext({ hasUI: false });
		const commandStream = new LandStackCommandStream({
			phase: (message) => context.notifications.push({ message, level: "info" }),
			notify: (message, level) => context.notifications.push({ message, level }),
			message: (message, options) => {
				if (options?.isRichOnly === true) return;
				context.notifications.push({ message, level: options?.level });
			},
			clearPhase: () => {},
		});
		const streamed = withCommandStreaming(pi, commandStream);

		commandStream.note("Preparing to land 1 PR through feature-a...");
		await streamed.exec("git", ["status"], { cwd: ROOT });
		await streamed.exec("git", ["fail"], { cwd: ROOT });

		pi.assertDone();
		expect(pi.messages).toEqual([]);
		expect(context.notifications.map((notification) => notification.level)).toEqual([
			"info",
			"info",
			"error",
		]);
		expect(context.notifications[0]?.message).toBe("→ Preparing to land 1 PR through feature-a...");
		expect(context.notifications[1]?.message).toMatch(
			/^✓ \$ git status — finished in (?:\d+s|\d+m \d+s)$/,
		);
		expect(context.notifications[2]?.message).toContain("✗ $ git fail — exit 2");
		expect(context.notifications[2]?.message).toContain("stdout line");
		expect(context.notifications[2]?.message).toContain("stderr line");
	});

	test("does not mirror final success or failure blocks to non-UI notifications", () => {
		const pi = new FakePi();
		const context = createContext({ hasUI: false });
		const commandStream = new LandStackCommandStream({
			phase: (message) => context.notifications.push({ message, level: "info" }),
			notify: (message, level) => context.notifications.push({ message, level }),
			message: (message, options) => {
				if (options?.isRichOnly === true) return;
				context.notifications.push({ message, level: options?.level });
			},
			clearPhase: () => {},
		});

		commandStream.finishSuccess("Landed 1 PR: #101 feature-a.");
		commandStream.finishFailure("land stopped.");

		expect(pi.messages).toEqual([]);
		expect(context.notifications).toEqual([]);
	});

	test("formats success notifications with action-first warnings", () => {
		const details = { prLinks: [{ number: 101, url: "https://github.example/pull/101" }] };
		const successNotification = formatSuccessNotification(
			"Landed 1 PR: #101 feature-a.\nRemote branches were not deleted.",
			{ details },
		);
		expect(successNotification).toContain(
			"\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a",
		);
		expect(stripAnsi(successNotification)).toBe("Landed 1 PR: #101 feature-a.");

		const linkedWarningAction = formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
			details,
			warnings: [
				{
					message: "Post-landing cleanup failed.",
					notificationAction: "Resolve PR #101 manually.",
				},
			],
		});
		expect(linkedWarningAction).toContain(
			"\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07",
		);
		expect(stripAnsi(linkedWarningAction)).toBe("Resolve PR #101 manually.");

		expect(
			formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
				warnings: [
					{
						message: "Post-landing cleanup failed.",
						suggestedAction: "Delete local branch feature-a manually.",
					},
				],
			}),
		).toBe("Delete local branch feature-a manually.");
		expect(
			formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
				warnings: [{ message: "Inspect the stack manually." }],
			}),
		).toBe("Inspect the stack manually.");
		expect(
			stripAnsi(
				formatSuccessNotification("Landed 1 PR: #101 feature-a.", {
					details,
					warnings: [
						{
							level: "info",
							message: "Deferred optional maintenance.",
							suggestedAction: "Restack later.",
						},
					],
				}),
			),
		).toBe("Landed 1 PR: #101 feature-a.");
	});

	test("validates PR live re-check invariants", () => {
		expect(shortSha(SHA_A)).toBe("aaaaaaa");

		expect(
			expectDomainFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_A,
						isDraft: true,
					}),
				}),
			).message,
		).toContain("draft");

		expect(
			expectDomainFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_A,
						state: "CLOSED",
					}),
				}),
			).message,
		).toContain("CLOSED");
		expect(
			expectDomainFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({ number: 101, branch: "wrong-head", base: TRUNK, sha: SHA_A }),
				}),
			).message,
		).toContain("head branch is wrong-head");
		expect(
			expectDomainFailure(
				validateOpenPrBasics({
					branch: "feature-a",
					localSha: SHA_A,
					pr: prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B }),
				}),
			).message,
		).toContain("head SHA does not match");
	});
});
