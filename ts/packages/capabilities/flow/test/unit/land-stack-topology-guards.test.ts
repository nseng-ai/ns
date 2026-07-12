import { describe, expect, test } from "vitest";
import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import { shortSha } from "../../src/commit-display/index.ts";
import { BACKUP_REF_NAMESPACE, PR_FIELDS } from "../../src/land/stack/constants.ts";
import { type LandResult } from "../../src/land/results.ts";
import {
	executeStackLanding,
	parseArgs,
	registerLandStackRenderer,
} from "../../src/land/land-stack.ts";
import type {
	LandStackExtensionAPI,
	LandStackCommandContext,
	NotifyLevel,
} from "../../src/land/stack/types.ts";
import { backupRefSteps } from "./land-stack-backup-ref-fixtures.ts";
import {
	createChildrenRecheckStep,
	createMergeFeatureASteps,
	expectedSquashMergeArgs,
	guardShaStep,
	prSnapshot,
	prStdout,
} from "./land-stack-script-fixtures.ts";
import {
	formatLiveBranchTips,
	metadataDbJson,
	TOPOLOGY_COMMAND,
	topologyArgs,
} from "./land-test-helpers.ts";

const ROOT = "/repo";

const TRUNK = "main";

const CURRENT = "feature-b";

const DESCENDANT = "feature-c";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const GIT_COMMON_DIR = `${ROOT}/.git`;

const DB_PATH = `${GIT_COMMON_DIR}/.graphite_metadata.db`;

const TOPOLOGY_ARGS = topologyArgs(DB_PATH);

const mergeFeatureA = createMergeFeatureASteps(TOPOLOGY_ARGS);
const childrenRecheckStep = createChildrenRecheckStep(TOPOLOGY_ARGS);

const DB_WITH_DESCENDANT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT] },
	{ branch: DESCENDANT, parent: "feature-b", children: [] },
]);

const DB_TO_CURRENT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [] },
]);

const DB_SINGLE_BRANCH = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: [] },
]);

type MessageRenderer = Parameters<NonNullable<LandStackExtensionAPI["registerMessageRenderer"]>>[1];

type SentMessage = Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[1];
};

interface ExecCall {
	command: string;
	args: string[];
	options?: { cwd?: string; timeout?: number };
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: ExitedResultFields | undefined;
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
	options?: { placement?: "aboveEditor" | "belowEditor" };
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
		this.messages.push({ ...message, ...(options === undefined ? {} : { options }) });
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
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

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

function execResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

function expectSuccess<T>(result: LandResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

function step(command: string, args: string[], result?: ExitedResultFields): ScriptedExec {
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
				widgets.push({ key, value, ...(options === undefined ? {} : { options }) });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, confirmations, statuses, widgets, waitForIdleCalls: () => waits };
}

async function runLandStack(
	args: string,
	script: ScriptedExec[],
	contextOptions: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	confirmations: Confirmation[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
	messages: SentMessage[];
}> {
	const pi = new FakePi(script);
	registerLandStackRenderer(pi);
	const context = createContext(contextOptions);
	const parsedArgs = expectSuccess(parseArgs(args));
	await executeStackLanding(pi, context.ctx, parsedArgs);
	return { pi, messages: pi.messages, ...context };
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

function metadataBranchNames(dbRows: string): string[] {
	const parsed = JSON.parse(dbRows) as Array<{ branch_name?: unknown }>;
	return parsed
		.map((row) => row.branch_name)
		.filter((name): name is string => typeof name === "string");
}

function repoIntro(
	options: {
		current?: string;
		trunk?: string;
		dbRows?: string;
		liveBranches?: string[];
		branchShaOverrides?: Record<string, string>;
	} = {},
): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const liveBranches = options.liveBranches ?? metadataBranchNames(dbRows);
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: `${ROOT}\n` }),
		step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${options.current ?? CURRENT}\n` }),
		step("gt", ["trunk", "--no-interactive"], { stdout: `${options.trunk ?? TRUNK}\n` }),
		step("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
			stdout: `${GIT_COMMON_DIR}\n`,
		}),
		step("git", [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS], {
			stdout: formatLiveBranchTips(liveBranches, {
				...(options.branchShaOverrides === undefined
					? {}
					: { shaOverrides: options.branchShaOverrides }),
				shaForBranch: testShaForBranch,
			}),
		}),
		step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
	];
}

function testShaForBranch(branch: string): string {
	switch (branch) {
		case "feature-a":
			return SHA_A;
		case "feature-b":
			return SHA_B;
		case DESCENDANT:
			return SHA_C;
		default:
			return "0".repeat(40);
	}
}

function cleanRepoChecks(): ScriptedExec[] {
	return [step("git", ["status", "--porcelain=v1"])];
}

function initialBranchPlans(options: { featureBBase?: string } = {}): ScriptedExec[] {
	return [
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
		}),
		step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 102,
					branch: "feature-b",
					base: options.featureBBase ?? "feature-a",
					sha: SHA_B,
				}),
			),
		}),
	];
}

function featureStackPreflight(
	options: {
		dbRows?: string;
		worktrees?: string;
		featureBBase?: string;
	} = {},
): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const hasDescendants = dbRows.includes(DESCENDANT);
	const worktrees = options.worktrees ?? worktreeOutput([{ path: ROOT, branch: CURRENT }]);
	return [
		...repoIntro({ dbRows }),
		...cleanRepoChecks(),
		...initialBranchPlans(
			options.featureBBase === undefined ? {} : { featureBBase: options.featureBBase },
		),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		...(hasDescendants
			? [step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees })]
			: []),
	];
}

function singleBranchPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string;
	dbRows?: string;
}): ScriptedExec[] {
	return [
		...repoIntro({
			current: "feature-a",
			dbRows: options.dbRows ?? DB_SINGLE_BRANCH,
			branchShaOverrides: { "feature-a": options.localSha },
		}),
		...cleanRepoChecks(),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: options.prSha }),
			),
		}),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: options.worktrees ?? worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
		}),
	];
}

function mergeFeatureAThroughDelete(
	options: { refreshTarget?: string | null; title?: string; body?: string | null } = {},
): ScriptedExec[] {
	const steps = [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					...(options.title === undefined ? {} : { title: options.title }),
					...(options.body === undefined ? {} : { body: options.body }),
				}),
			),
		}),
		step(
			"gh",
			expectedSquashMergeArgs({
				number: 101,
				sha: SHA_A,
				...(options.title === undefined ? {} : { title: options.title }),
				...(options.body === undefined ? {} : { body: options.body }),
			}),
		),
		step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					state: "MERGED",
					mergedAt: "2026-05-22T00:00:00Z",
				}),
			),
		}),
	];
	const refreshTarget = options.refreshTarget === undefined ? "feature-b" : options.refreshTarget;
	if (refreshTarget) {
		steps.push(
			guardShaStep(refreshTarget, SHA_B),
			step("gt", [
				"get",
				refreshTarget,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
		);
	}
	steps.push(
		childrenRecheckStep("feature-a", refreshTarget ? ["feature-b"] : []),
		step("gt", ["delete", "feature-a", "-f", "-q"]),
	);
	return steps;
}

describe("fork-safe topology and destructive-phase guards", () => {
	const DB_FORKED_ANCESTOR = metadataDbJson([
		{ branch: TRUNK, children: ["feature-a"], trunk: true },
		{ branch: "feature-a", parent: TRUNK, children: ["feature-b", "side"] },
		{ branch: "feature-b", parent: "feature-a", children: [] },
		{ branch: "side", parent: "feature-a", children: ["side-2"] },
		{ branch: "side-2", parent: "side", children: [] },
	]);
	const DB_FORKED_CURRENT = metadataDbJson([
		{ branch: TRUNK, children: ["feature-a"], trunk: true },
		{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
		{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT, "feature-d"] },
		{ branch: DESCENDANT, parent: "feature-b", children: [] },
		{ branch: "feature-d", parent: "feature-b", children: [] },
	]);

	test("refuses to land through a fork at an ancestor landing branch", async () => {
		const { pi, notifications, messages } = await runLandStack(
			"--yes",
			repoIntro({ dbRows: DB_FORKED_ANCESTOR }),
		);

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to land: the stack forks at feature-a.");
		expect(notifications[0]?.message).toContain("Landing path expects feature-a -> feature-b");
		expect(notifications[0]?.message).toContain("side (subtree: side -> side-2)");
		expect(commandMessagesText(messages)).toContain(
			"Land or move the sibling stack first (e.g. gt move --onto main), then rerun /ns:flow:land.",
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] !== "trunk")).toBe(
			false,
		);
	});

	test("--dry-run on a forked stack also refuses", async () => {
		const { pi, notifications } = await runLandStack(
			"--dry-run",
			repoIntro({ dbRows: DB_FORKED_ANCESTOR }),
		);

		pi.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to land: the stack forks at feature-a.");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("allows the current branch to have multiple descendant roots", async () => {
		const { pi, notifications } = await runLandStack(
			"--dry-run",
			featureStackPreflight({ dbRows: DB_FORKED_CURRENT }),
		);

		pi.assertDone();
		expect(notifications[0]?.level).toBe("info");
		expect(notifications[0]?.message).toContain(
			"Will leave open and try to restack/update after target PRs land:",
		);
		expect(notifications[0]?.message).toContain("feature-c");
		expect(notifications[0]?.message).toContain("feature-d");
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});

	test("refuses when the current branch is not tracked in Graphite metadata", async () => {
		const untrackedDb = metadataDbJson([
			{ branch: TRUNK, children: ["feature-a"], trunk: true },
			{ branch: "feature-a", parent: TRUNK, children: [] },
		]);
		const { pi, notifications } = await runLandStack("--yes", repoIntro({ dbRows: untrackedDb }));

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			`Current branch ${CURRENT} is not tracked in Graphite metadata (${DB_PATH}); run gt track or gt get before landing.`,
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("fails closed when the Graphite metadata DB is missing or unreadable", async () => {
		const script = [
			...repoIntro().slice(0, 5),
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
				code: 1,
				stderr: "Error: unable to open database file\n",
			}),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			`Graphite metadata DB at ${DB_PATH} is missing or unreadable; refusing to land.`,
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("fails closed when sqlite3 cannot run", async () => {
		const script = [
			...repoIntro().slice(0, 5),
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { code: 1, stderr: "spawn sqlite3 ENOENT" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("sqlite3 could not read the Graphite metadata DB");
		expect(notifications[0]?.message).toContain("Ensure sqlite3 is installed and on PATH");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("stops hard when a required gt get target moved since landing started", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_C),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`local branch feature-b moved from ${shortSha(SHA_B)} to ${shortSha(SHA_C)} since landing started; refusing gt get --force to avoid clobbering local commits`,
		);
		expect(streamText).toContain(BACKUP_REF_NAMESPACE);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("stops hard when a mid-stack branch grows unexpected children before delete", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_B),
			step("gt", [
				"get",
				"feature-b",
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			childrenRecheckStep("feature-a", ["feature-b", "rogue-branch"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			"feature-a now has unexpected Graphite children (rogue-branch); refusing gt delete",
		);
		expect(streamText).toContain(BACKUP_REF_NAMESPACE);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack")).toBe(
			false,
		);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("skips the final delete with a warning when unexpected children appear", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -2),
			childrenRecheckStep("feature-a", ["rogue-branch"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("feature-a now has unexpected Graphite children (rogue-branch)");
		expect(streamText).toContain("local branch feature-a cleanup was skipped");
		expect(streamText).toContain(BACKUP_REF_NAMESPACE);
		expect(streamText).toContain("Landed 1 PR: #101 feature-a.");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "restack")).toBe(
			false,
		);
	});
});
