import { describe, expect, test } from "vitest";
import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@ns/capability-kit/git";
import { formatCommand, type ExecResult } from "@ns/core/command";
import { ScriptedQueue } from "@ns/core/test-kit";
import { stripAnsi } from "../../src/land/stack/graphite-command-channel.ts";
import { BACKUP_REF_NAMESPACE } from "../../src/land/stack/constants.ts";
import { type LandStackResult } from "../../src/land/stack/errors.ts";
import { formatLandProgressTitle } from "../../src/ns/commands/land.ts";
import type { LandLiveProgressEvent } from "../../src/land/stack/command-stream.ts";
import { LAND_PHASES } from "../../src/phase-stream/phase-stream-specs.ts";
import {
	executeStackLanding,
	parseArgs,
	registerLandStackRenderer,
} from "../../src/land/land-stack.ts";
import type {
	LandStackExtensionAPI,
	LandStackCommandContext,
	NotifyLevel,
	PullRequestSnapshot,
} from "../../src/land/stack/types.ts";
import {
	BACKUP_ROTATION_ARGS,
	BACKUP_ROTATION_STEP,
	backupRefSteps,
} from "./land-stack-backup-ref-fixtures.ts";
import {
	createChildrenRecheckStep,
	createMergeFeatureASteps,
	expectedSquashMergeArgs,
	guardShaStep,
	postRestackSubmitCheckSteps,
	prSnapshot,
	prStdout,
	submitUpdateStep,
} from "./land-stack-script-fixtures.ts";
import {
	formatLiveBranchTips,
	metadataDbJson,
	TOPOLOGY_COMMAND,
	topologyArgs,
} from "./land-test-helpers.ts";

const PR_FIELDS =
	"number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";

const ROOT = "/repo";

const TRUNK = "main";

describe("flow land live progress", () => {
	test("formats merged target PR counter without implying cleanup has finished", () => {
		expect(formatLandProgressTitle({ landedPrs: 8, totalPrs: 11 })).toBe(
			"ns flow land — 8/11 target PRs merged",
		);
		expect(formatLandProgressTitle({ landedPrs: 1 })).toBe("ns flow land — 1 target PR merged");
		expect(formatLandProgressTitle({ landedPrs: 2 })).toBe("ns flow land — 2 target PRs merged");
	});

	test("uses settled merge wording scoped to target PRs", () => {
		expect(LAND_PHASES.find((spec) => spec.key === "merge")?.item.detail).toBe("target PRs merged");
	});
});

const CURRENT = "feature-b";

const DESCENDANT = "feature-c";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const SHA_D = "dddddddddddddddddddddddddddddddddddddddd";

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

const DB_FORKED_CURRENT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT, "feature-d"] },
	{ branch: DESCENDANT, parent: "feature-b", children: [] },
	{ branch: "feature-d", parent: "feature-b", children: [] },
]);

const DB_SINGLE_BRANCH = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: [] },
]);

const BRANCH_SHAS: Record<string, string> = {
	"feature-a": SHA_A,
	"feature-b": SHA_B,
	[DESCENDANT]: SHA_C,
	"feature-d": SHA_D,
};

function numberedBranch(index: number): string {
	return `feature-${index}`;
}

function numberedSha(index: number): string {
	return index.toString(16).padStart(2, "0").repeat(20);
}

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
	contextOptions: {
		cwd?: string;
		hasUI?: boolean;
		confirms?: boolean[];
		executeOptions?: Parameters<typeof executeStackLanding>[3];
	} = {},
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
	await executeStackLanding(pi, context.ctx, parsedArgs, contextOptions.executeOptions);
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
			stdout: formatLiveBranchTips(liveBranches),
		}),
		step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
	];
}

function domainRepoIntro(
	options: {
		current?: string;
		trunk?: string;
		dbRows?: string;
		liveBranches?: string[];
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
			stdout: formatLiveBranchTips(liveBranches),
		}),
		step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
	];
}

function submitRestackRecheckStep(
	options: { branch?: string; parent?: string; stdout?: string } = {},
): ScriptedExec {
	const branch = options.branch ?? "feature-a";
	const parent = options.parent ?? TRUNK;
	return step("git", ["rev-list", "-1", `refs/heads/${parent}`, "--not", `refs/heads/${branch}`], {
		stdout: options.stdout ?? "",
	});
}

function cleanRepoChecks(): ScriptedExec[] {
	return [
		step("git", ["status", "--porcelain=v1"]),
		step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { code: 1 }),
		step("git", ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"], { code: 1 }),
		step("git", ["rev-parse", "-q", "--verify", "REVERT_HEAD"], { code: 1 }),
		step("git", ["rev-parse", "--git-path", "rebase-merge"], { stdout: ".git/rebase-merge\n" }),
		step("git", ["rev-parse", "--git-path", "rebase-apply"], { stdout: ".git/rebase-apply\n" }),
	];
}

function localBranchChecks(branches: string[]): ScriptedExec[] {
	return branches.map((branch) => step("git", ["show-ref", "--verify", `refs/heads/${branch}`]));
}

function numberedDb(
	start: number,
	end: number,
	options: { trunk?: string; current?: number } = {},
): string {
	const trunk = options.trunk ?? TRUNK;
	const current = options.current ?? end;
	return metadataDbJson([
		{ branch: trunk, children: start <= end ? [numberedBranch(start)] : [], trunk: true },
		...Array.from({ length: end - start + 1 }, (_, offset) => {
			const index = start + offset;
			return {
				branch: numberedBranch(index),
				parent: index === start ? trunk : numberedBranch(index - 1),
				children: index === current ? [] : [numberedBranch(index + 1)],
			};
		}),
	]);
}

function numberedPreflight(options: {
	start?: number;
	end: number;
	current: number;
	prShaOverrides?: Record<number, string>;
}): ScriptedExec[] {
	const start = options.start ?? 1;
	const currentBranch = numberedBranch(options.current);
	const planBranches = Array.from({ length: options.end - start + 1 }, (_, offset) =>
		numberedBranch(start + offset),
	);
	return [
		...repoIntro({
			current: currentBranch,
			dbRows: numberedDb(start, options.end, { current: options.current }),
		}),
		...cleanRepoChecks(),
		...localBranchChecks(planBranches),
		...planBranches.flatMap((branch) => {
			const index = Number(branch.replace("feature-", ""));
			const localSha = numberedSha(index);
			const prSha = options.prShaOverrides?.[index] ?? localSha;
			return [
				step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], {
					stdout: `${localSha}\n`,
				}),
				step("gh", ["pr", "view", branch, "--json", PR_FIELDS], {
					stdout: prStdout(
						prSnapshot({
							number: 200 + index,
							branch,
							base: index === start ? TRUNK : numberedBranch(index - 1),
							sha: prSha,
							title: `PR ${200 + index}`,
						}),
					),
				}),
			];
		}),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: worktreeOutput([{ path: ROOT, branch: currentBranch }]),
		}),
	];
}

function backupRefStepsForNumberedBranches(start: number, end: number): ScriptedExec[] {
	const shas: Record<string, string> = {};
	for (let index = start; index <= end; index += 1) {
		shas[numberedBranch(index)] = numberedSha(index);
	}
	return backupRefSteps(
		Array.from({ length: end - start + 1 }, (_, offset) => numberedBranch(start + offset)),
		{ shas },
	);
}

function elevenPrLandingScript(): ScriptedExec[] {
	return [
		...numberedPreflight({ end: 11, current: 11 }),
		...backupRefStepsForNumberedBranches(1, 11),
		...Array.from({ length: 11 }, (_, offset) => offset + 1).flatMap((index) =>
			mergeNumberedBranch(index, index === 11 ? { finalCheckedOut: true } : { next: index + 1 }),
		),
	].flat();
}

function mergeNumberedBranch(
	index: number,
	options: { next?: number; finalCheckedOut?: boolean; mergeCode?: number } = {},
): ScriptedExec[] {
	const branch = numberedBranch(index);
	const sha = numberedSha(index);
	const prNumber = 200 + index;
	const steps: ScriptedExec[] = [
		step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], { stdout: `${sha}\n` }),
		step("gh", ["pr", "view", branch, "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: prNumber, branch, base: TRUNK, sha, title: `PR ${prNumber}` }),
			),
		}),
		step("gh", expectedSquashMergeArgs({ number: prNumber, sha, title: `PR ${prNumber}` }), {
			code: options.mergeCode ?? 0,
			stderr: options.mergeCode ? "merge blocked" : "",
		}),
		step("gh", ["pr", "view", String(prNumber), "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: prNumber,
					branch,
					base: TRUNK,
					sha,
					state: "MERGED",
					mergedAt: "2026-05-22T00:00:00Z",
					title: `PR ${prNumber}`,
				}),
			),
		}),
	];
	if (options.mergeCode) {
		return steps.slice(0, 3);
	}
	if (options.next !== undefined) {
		const nextBranch = numberedBranch(options.next);
		steps.push(
			guardShaStep(nextBranch, numberedSha(options.next)),
			step("gt", [
				"get",
				nextBranch,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			childrenRecheckStep(branch, [nextBranch]),
			step("gt", ["delete", branch, "-f", "-q"]),
			step("gt", ["restack", "--branch", nextBranch, "--upstack", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: nextBranch,
				sha: numberedSha(options.next),
				prNumber: 200 + options.next,
				base: branch,
			}),
		);
		if (options.next < 11) {
			steps.push(guardShaStep(numberedBranch(options.next + 1), numberedSha(options.next + 1)));
		}
		steps.push(submitUpdateStep(nextBranch));
		return steps;
	}
	steps.push(
		childrenRecheckStep(branch, []),
		step(
			"gt",
			["delete", branch, "-f", "-q"],
			options.finalCheckedOut
				? { code: 1, stderr: `fatal: '${branch}' is already checked out at '/repo'\n` }
				: undefined,
		),
	);
	return steps;
}

function initialBranchPlans(options: { featureBBase?: string } = {}): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
		}),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], {
			stdout: `${SHA_B}\n`,
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
		...localBranchChecks(["feature-a", "feature-b"]),
		...initialBranchPlans(
			options.featureBBase === undefined ? {} : { featureBBase: options.featureBBase },
		),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		...(hasDescendants
			? [step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees })]
			: []),
	];
}

function mergeFeatureBThroughVerification(): ScriptedExec[] {
	return [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], {
			stdout: `${SHA_B}\n`,
		}),
		step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
			stdout: prStdout(prSnapshot({ number: 102, branch: "feature-b", base: TRUNK, sha: SHA_B })),
		}),
		step("gh", expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
		step("gh", ["pr", "view", "102", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 102,
					branch: "feature-b",
					base: TRUNK,
					sha: SHA_B,
					state: "MERGED",
					mergedAt: "2026-05-22T00:00:00Z",
				}),
			),
		}),
	];
}

function mergeFeatureBWithDescendant(): ScriptedExec[] {
	return [
		...mergeFeatureBThroughVerification(),
		guardShaStep(DESCENDANT, SHA_C),
		step("gt", [
			"get",
			DESCENDANT,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		]),
		childrenRecheckStep("feature-b", [DESCENDANT]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		...postRestackSubmitCheckSteps({
			branch: DESCENDANT,
			sha: SHA_C,
			prNumber: 103,
			base: "feature-b",
		}),
		submitUpdateStep(DESCENDANT),
	];
}

function mergeFeatureBWithForkedDescendants(): ScriptedExec[] {
	return [
		...mergeFeatureBThroughVerification(),
		guardShaStep(DESCENDANT, SHA_C),
		step("gt", [
			"get",
			DESCENDANT,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		]),
		guardShaStep("feature-d", SHA_D),
		step("gt", [
			"get",
			"feature-d",
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		]),
		childrenRecheckStep("feature-b", [DESCENDANT, "feature-d"]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		...postRestackSubmitCheckSteps({
			branch: DESCENDANT,
			sha: SHA_C,
			prNumber: 103,
			base: "feature-b",
		}),
		submitUpdateStep(DESCENDANT),
		step("gt", ["restack", "--branch", "feature-d", "--upstack", "--no-interactive"]),
		...postRestackSubmitCheckSteps({
			branch: "feature-d",
			sha: SHA_D,
			prNumber: 104,
			base: "feature-b",
		}),
		submitUpdateStep("feature-d"),
	];
}

function mergeFeatureBWithDescendantRestackFailure(): ScriptedExec[] {
	return [
		...mergeFeatureBThroughVerification(),
		guardShaStep(DESCENDANT, SHA_C),
		step("gt", [
			"get",
			DESCENDANT,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		]),
		childrenRecheckStep("feature-b", [DESCENDANT]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"], {
			code: 1,
			stderr: "restack failed",
		}),
	];
}

function singleBranchPreflight(worktrees: string): ScriptedExec[] {
	return singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A, worktrees });
}

function singleBranchPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string;
	dbRows?: string;
}): ScriptedExec[] {
	return singleBranchPreflightWithRepoIntro(repoIntro, options);
}

function singleBranchDomainPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string;
	dbRows?: string;
}): ScriptedExec[] {
	return singleBranchPreflightWithRepoIntro(domainRepoIntro, options);
}

function singleBranchPreflightWithRepoIntro(
	loadRepoIntro: typeof repoIntro,
	options: {
		localSha: string;
		prSha: string;
		worktrees?: string;
		dbRows?: string;
	},
): ScriptedExec[] {
	return [
		...loadRepoIntro({ current: "feature-a", dbRows: options.dbRows ?? DB_SINGLE_BRANCH }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a"]),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${options.localSha}\n`,
		}),
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

function mergeSingleFeatureA(): ScriptedExec[] {
	return mergeFeatureAThroughDelete({ refreshTarget: null });
}

function badInitialPrPreflight(pr: PullRequestSnapshot): ScriptedExec[] {
	return [
		...repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH }),
		...cleanRepoChecks(),
		...localBranchChecks(["feature-a"]),
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], { stdout: prStdout(pr) }),
	];
}

async function captureConsole<T>(run: () => Promise<T>): Promise<T> {
	const originalLog = console.log;
	const originalError = console.error;
	console.log = () => undefined;
	console.error = () => undefined;
	try {
		return await run();
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
}

describe("land-stack command scenarios", () => {
	test("--dry-run builds and presents the plan without mutating", async () => {
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			featureStackPreflight({ dbRows: DB_TO_CURRENT }),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("info");
		expect(notifications[0]?.message).toContain("Dry run only; no PRs or local refs were changed.");
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});

	test("large stacks use the same single stack-path confirmation at ten and eleven PRs", async () => {
		for (const size of [10, 11]) {
			const { pi, confirmations } = await runLandStack(
				"",
				numberedPreflight({ end: size, current: size }),
				{ confirms: [false] },
			);

			pi.assertDone();
			expect(confirmations).toHaveLength(1);
			expect(confirmations[0]?.title).toBe("Land this stack path?");
			expect(confirmations[0]?.message).toContain(`Land Graphite stack path: main -> feature-1`);
			expect(confirmations[0]?.message).toContain(`Landing target branch: feature-${size}`);
			expect(confirmations[0]?.message).not.toContain("chunks");
		}
	});

	test("large-stack dry-run shows one full stack path plan without mutation", async () => {
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			numberedPreflight({ end: 11, current: 11 }),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		const message = notifications[0]?.message ?? "";
		expect(message).toContain("Land Graphite stack path: main -> feature-1");
		expect(message).toContain("Landing target branch: feature-11");
		expect(message).toContain("Will merge, in order:");
		expect(message).toContain("  11. #211 feature-11");
		expect(message).not.toContain("Chunks:");
		expect(message).not.toContain("Chunk size");
		expect(message).not.toContain("Land 11 PRs in 2 chunks");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
		expect(
			pi.execCalls.some((call) => call.command === "git" && call.args[0] === "update-ref"),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" &&
					["get", "delete", "restack", "submit"].includes(call.args[0] ?? ""),
			),
		).toBe(false);
	});

	test("large-stack --yes lands eleven PRs through one merge loop without chunk progress", async () => {
		const liveProgressEvents: LandLiveProgressEvent[] = [];
		const { pi, notifications, confirmations, messages } = await runLandStack(
			"--yes",
			elevenPrLandingScript(),
			{ executeOptions: { liveProgress: (event) => liveProgressEvents.push(event) } },
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(
			pi.execCalls.filter(
				(call) => call.command === "git" && sameArgs(call.args, BACKUP_ROTATION_ARGS),
			),
		).toHaveLength(1);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "git" && call.args[0] === "switch" && call.args.includes("--detach"),
			),
		).toBe(false);
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("→ Preparing to land 11 PRs through feature-11...");
		expect(streamText).not.toContain("Preparing chunk");
		expect(liveProgressEvents).toContainEqual({
			prNumber: 201,
			branch: "feature-1",
		});
		expect(liveProgressEvents).toHaveLength(11);
		expect(streamText).toContain("Landed 11 PRs: #201 feature-1");
		expect(streamText).not.toContain("across 2 chunks");
		expect(streamText).toContain(
			"Local branch feature-11 was kept (still checked out at /repo); delete it manually or run gt sync.",
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("interactive large-stack landing asks one stack-path confirmation", async () => {
		const { pi, notifications, confirmations, messages } = await runLandStack(
			"",
			elevenPrLandingScript(),
			{ confirms: [true] },
		);

		pi.assertDone();
		expect(confirmations.map((confirmation) => confirmation.title)).toEqual([
			"Land this stack path?",
		]);
		expect(confirmations[0]?.message).toContain("Land Graphite stack path: main -> feature-1");
		expect(confirmations[0]?.message).toContain("Landing target branch: feature-11");
		expect(confirmations[0]?.message).not.toContain("Chunks");
		expect(commandMessagesText(messages)).toContain("Landed 11 PRs: #201 feature-1");
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("large-stack failure hard-stops and reports normal partial progress", async () => {
		const script = [
			...numberedPreflight({ end: 11, current: 11 }),
			...backupRefStepsForNumberedBranches(1, 11),
			...Array.from({ length: 9 }, (_, offset) => offset + 1).flatMap((index) =>
				mergeNumberedBranch(index, { next: index + 1 }),
			),
			mergeNumberedBranch(10, { mergeCode: 1 }),
		].flat();
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("→ Preparing to land 11 PRs through feature-11...");
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("  - #201 feature-1");
		expect(streamText).toContain("  - #209 feature-9");
		expect(streamText).not.toContain("by chunk:");
		expect(streamText).toContain("Failed at: #210 feature-10");
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gh" &&
					sameArgs(
						call.args,
						expectedSquashMergeArgs({ number: 211, sha: numberedSha(11), title: "PR 211" }),
					),
			),
		).toBe(false);
	});

	test("--dry-run treats descendant sdl slot checkouts as skipped maintenance", async () => {
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(notifications[0]?.message).toContain(
			"Will leave open without automatic restack/update because these descendants are checked out elsewhere:",
		);
		expect(notifications[0]?.message).toContain("slot-07 feature-c");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});

	test("non-interactive mode without --yes refuses before mutation", async () => {
		const { pi } = await captureConsole(() =>
			runLandStack("", featureStackPreflight({ dbRows: DB_TO_CURRENT }), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});

	test("dirty repo refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
			step("git", ["status", "--porcelain=v1"], { stdout: " M file.ts\n" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Working tree is dirty");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("in-progress merge refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
			step("git", ["status", "--porcelain=v1"]),
			step("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { stdout: SHA_A, code: 0 }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("A merge is in progress");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("missing local branch refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
			...cleanRepoChecks(),
			step("git", ["show-ref", "--verify", "refs/heads/feature-a"], { code: 1, stderr: "missing" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Local branch feature-a does not exist");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});

	test("manual worktree conflict refuses before mutation", async () => {
		const script = featureStackPreflight({
			dbRows: DB_TO_CURRENT,
			worktrees: worktreeOutput([
				{ path: ROOT, branch: CURRENT },
				{ path: "/tmp/manual", branch: "feature-a" },
			]),
		});
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("non-slot worktree");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});

	test("happy path merges bottom-to-current and restacks but does not merge descendants", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBWithDescendant(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "git" && call.args[0] === "update-ref")
				.map((call) => call.args[1]),
		).toEqual([
			`${BACKUP_REF_NAMESPACE}/feature-a`,
			`${BACKUP_REF_NAMESPACE}/feature-b`,
			`${BACKUP_REF_NAMESPACE}/${DESCENDANT}`,
		]);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "restack")
				.map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT]);
		const submitCalls = pi.execCalls.filter(
			(call) => call.command === "gt" && call.args[0] === "submit",
		);
		expect(submitCalls.map((call) => call.args)).toEqual([
			[
				"submit",
				"--branch",
				"feature-b",
				"--no-stack",
				"--update-only",
				"--no-edit",
				"--no-ai",
				"--no-interactive",
				"--force",
			],
			[
				"submit",
				"--branch",
				DESCENDANT,
				"--no-stack",
				"--update-only",
				"--no-edit",
				"--no-ai",
				"--no-interactive",
				"--force",
			],
		]);
		const merge101Index = pi.execCalls.findIndex(
			(call) =>
				call.command === "gh" &&
				sameArgs(call.args, expectedSquashMergeArgs({ number: 101, sha: SHA_A })),
		);
		const restackFeatureBIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "gt" &&
				sameArgs(call.args, ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
		);
		const submitFeatureBIndex = pi.execCalls.findIndex((call) => call === submitCalls[0]);
		const merge102Index = pi.execCalls.findIndex(
			(call) =>
				call.command === "gh" &&
				sameArgs(call.args, expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
		);
		expect(merge101Index).toBeLessThan(restackFeatureBIndex);
		expect(restackFeatureBIndex).toBeLessThan(submitFeatureBIndex);
		expect(submitFeatureBIndex).toBeLessThan(merge102Index);
		const descendantRestackCallIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "gt" &&
				sameArgs(call.args, ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		);
		expect(descendantRestackCallIndex).toBeGreaterThanOrEqual(0);
		expect(
			pi.execCalls
				.slice(descendantRestackCallIndex + 1)
				.some(
					(call) =>
						call.command === "git" &&
						sameArgs(call.args, ["rev-parse", "--verify", `refs/heads/${DESCENDANT}^{commit}`]),
				),
		).toBe(true);
		expect(
			pi.execCalls
				.slice(descendantRestackCallIndex + 1)
				.some((call) => call.command === "gt" && call.args[0] === "get"),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 2 PRs: #101 feature-a, #102 feature-b.",
		);
		expect(commandMessagesText(messages)).toContain("Left open/restacked: feature-c.");
	});

	test("happy path restacks and updates multiple descendant roots above the current branch", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_FORKED_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT, "feature-d"], {
				shas: BRANCH_SHAS,
			}),
			...mergeFeatureA({ postRestackRefreshBranches: [DESCENDANT, "feature-d"] }),
			...mergeFeatureBWithForkedDescendants(),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "get")
				.map((call) => call.args[1]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "restack")
				.map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "submit")
				.map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(notifications.at(-1)?.level).toBe("success");
		expect(commandMessagesText(messages)).toContain("Left open/restacked: feature-c, feature-d.");
	});

	test("optional descendant refresh failure still attempts later roots and skips unsafe deletion", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_FORKED_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT, "feature-d"], {
				shas: BRANCH_SHAS,
			}),
			...mergeFeatureA({ postRestackRefreshBranches: [DESCENDANT, "feature-d"] }),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step(
				"gt",
				[
					"get",
					DESCENDANT,
					"--downstack",
					"--no-restack",
					"--no-checkout",
					"--force",
					"--no-interactive",
				],
				{ code: 1, stderr: "refresh failed" },
			),
			guardShaStep("feature-d", SHA_D),
			step("gt", [
				"get",
				"feature-d",
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "get")
				.map((call) => call.args[1]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b",
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" &&
					call.args[0] === "restack" &&
					[DESCENDANT, "feature-d"].includes(call.args[2] ?? ""),
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			"Left open; restack/update needs follow-up: feature-c, feature-d.",
		);
		expect(streamText).toContain(
			"Graphite refresh for descendant branch feature-c failed; local branch feature-b cleanup and descendant restack/update were skipped.",
		);
		expect(streamText).not.toContain("Left open/restacked: feature-c, feature-d.");
	});

	test("rotates backup refs before pruning current stale refs and writing new snapshots", async () => {
		const staleCurrentRef = `${BACKUP_REF_NAMESPACE}/old-branch`;
		const script = [
			...singleBranchPreflight(""),
			...backupRefSteps(["feature-a"], { staleCurrentRefs: [staleCurrentRef] }),
			...mergeSingleFeatureA(),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		const rotationIndex = pi.execCalls.findIndex(
			(call) => call.command === "git" && sameArgs(call.args, BACKUP_ROTATION_ARGS),
		);
		const staleListIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "git" &&
				sameArgs(call.args, ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE]),
		);
		const staleDeleteIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "git" && sameArgs(call.args, ["update-ref", "-d", staleCurrentRef]),
		);
		const snapshotIndex = pi.execCalls.findIndex(
			(call, index) =>
				index > staleDeleteIndex &&
				call.command === "git" &&
				sameArgs(call.args, ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"]),
		);
		expect(rotationIndex).toBeGreaterThanOrEqual(0);
		expect(staleListIndex).toBeGreaterThan(rotationIndex);
		expect(staleDeleteIndex).toBeGreaterThan(staleListIndex);
		expect(snapshotIndex).toBeGreaterThan(staleDeleteIndex);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("backup ref rotation failure stops before landing any PRs", async () => {
		const script = [
			...singleBranchPreflight(""),
			step("git", BACKUP_ROTATION_ARGS, { code: 1, stderr: "cannot rotate refs" }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("no PRs were landed");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
	});

	test("backup ref stale-listing failure stops before landing any PRs", async () => {
		const script = [
			...singleBranchPreflight(""),
			BACKUP_ROTATION_STEP,
			step("git", ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE], {
				code: 1,
				stderr: "cannot list refs",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("no PRs were landed");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
	});

	test("descendant managed slot does not block landing and skips descendant maintenance", async () => {
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefreshBranches: [] }),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "get" && call.args[1] === DESCENDANT,
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b",
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Free slot-07 for feature-c; then restack/update feature-c.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update skipped: feature-c.");
		expect(streamText).toContain(
			"Final local Graphite cleanup for feature-b and descendant restack/update were skipped",
		);
		expect(streamText).toContain("slot-07 feature-c");
	});

	test("descendant manual worktree does not block landing and skips descendant maintenance", async () => {
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: "/tmp/manual-descendant", branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefreshBranches: [] }),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Detach /tmp/manual-descendant for feature-c; then restack/update feature-c.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update skipped: feature-c.");
		expect(streamText).toContain("/tmp/manual-descendant");
	});

	test("landing-scope managed slot cleanup is targeted and leaves descendant slots alone", async () => {
		const landingSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01";
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const initialWorktrees = worktreeOutput([
			{ path: ROOT, branch: CURRENT },
			{ path: landingSlotPath, branch: "feature-a" },
			{ path: descendantSlotPath, branch: DESCENDANT },
		]);
		const script = [
			...featureStackPreflight({ worktrees: initialWorktrees }),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefreshBranches: [] }),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Free landing slots?");
		expect(confirmations[0]?.message).toContain("slot-01 feature-a");
		expect(confirmations[0]?.message).not.toContain("slot-07 feature-c");
		expect(
			pi.execCalls.some(
				(call) => call.command === "ns" && sameArgs(call.args, ["slot", "free", "--wt", "slot-01"]),
			),
		).toBe(true);
		expect(
			pi.execCalls.some(
				(call) => call.command === "slot" && sameArgs(call.args, ["gt", "free-stack"]),
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Free slot-07 for feature-c; then restack/update feature-c.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
	});

	test("non-interactive descendant-only slot conflict proceeds with --yes", async () => {
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA({ postRestackRefreshBranches: [] }),
			...mergeFeatureBThroughVerification(),
		];
		const { pi } = await captureConsole(() => runLandStack("--yes", script, { hasUI: false }));

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
	});

	test("optional descendant gt get checkout conflict completes successfully with deferred note", async () => {
		const getArgs = [
			"get",
			DESCENDANT,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		];
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step("gt", getArgs, {
				code: 1,
				stderr: "fatal: 'main' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 2 PRs: #101 feature-a, #102 feature-b.",
		);
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update deferred: feature-c.");
		expect(streamText).toContain(
			"→ Deferred optional descendant maintenance for feature-c because main is checked out at /repo-main.",
		);
		expect(streamText).toContain("Notes:");
		expect(streamText).toContain(
			"Optional descendant restack/update was deferred because Graphite could not refresh descendant branch feature-c: main is checked out at /repo-main.",
		);
		expect(streamText).not.toContain(`✗ $ ${formatCommand("gt", getArgs)} — exit 1`);
		expect(streamText).not.toContain("Completed with 1 warning:");
		expect(streamText).not.toContain("fatal: 'main' is already checked out");
		expect(streamText).not.toContain("land stopped");
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b",
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
	});

	test("required next-landing gt get checkout conflict stops before merging the next target PR", async () => {
		const getArgs = [
			"get",
			"feature-b",
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		];
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_B),
			step("gt", getArgs, {
				code: 1,
				stderr: "fatal: 'main' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(notifications.at(-1)?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Graphite could not refresh next landing branch feature-b: main is checked out at /repo-main.",
		);
		expect(streamText).toContain("Suggested next action: Switch/detach /repo-main from main");
		expect(streamText).toContain(formatCommand("gt", getArgs));
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});

	test("skips post-restack submit when fresh PR metadata is already current", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: TRUNK,
			}),
			...mergeFeatureBThroughVerification(),
			childrenRecheckStep("feature-b", []),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "submit" && call.args[2] === "feature-b",
			),
		).toBe(false);
		expect(commandMessagesText(messages)).toContain(
			"→ Skipped gt submit for feature-b; PR metadata already current.",
		);
	});

	test("post-restack PR read failure halts required next-landing maintenance", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			guardShaStep("feature-b", SHA_B),
			step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
				code: 1,
				stderr: "PR lookup failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("could not verify PR metadata for feature-b after restack");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit")).toBe(
			false,
		);
	});

	test("post-restack PR read failure warns for optional descendant maintenance", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step("gt", [
				"get",
				DESCENDANT,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			childrenRecheckStep("feature-b", [DESCENDANT]),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
			step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
			guardShaStep(DESCENDANT, SHA_C),
			step("gh", ["pr", "view", DESCENDANT, "--json", PR_FIELDS], {
				code: 1,
				stderr: "PR lookup failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			"PR metadata for feature-c could not be verified after optional descendant restack",
		);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
	});

	test("optional descendant maintenance failure completes with a warning", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBWithDescendantRestackFailure(),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Resolve restack failures for feature-c, then update that PR manually.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain(
			"Restack failed after merging #102; descendant branch feature-c was left for manual restack/update.",
		);
		expect(streamText).not.toContain("land stopped");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
	});

	test("explains cleanup rebase conflicts after PRs have merged", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete().slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: [
					"CONFLICT (content): Merge conflict in skills/ns-typescript/SKILL.md",
					"error: could not apply 01034275d... Migrate optional-undefined preserves to typed explicit contracts",
					"hint: Resolve all conflicts manually, mark them as resolved with git add/rm, then run git rebase --continue.",
				].join("\n"),
			}),
		];
		const { pi, messages, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("land stopped.");
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Graphite cleanup for local branch feature-a stopped during branch deletion with an in-progress Git operation or conflicts.",
		);
		expect(streamText).toContain("The repository may now be mid-rebase");
		expect(streamText).toContain(
			"Run git status. Resolve the conflicts and continue the Git operation",
		);
		expect(streamText).toContain("git rebase --abort");
	});

	test("streams command execution as normal scrollback messages", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications, widgets } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(widgets).toEqual([]);
		expect(messages.length).toBeGreaterThan(0);
		expect(
			messages.every((message) => message.customType === "land-command-stream" && message.display),
		).toBe(true);
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("land-stack command stream");
		expect(streamText).toContain("→ Preparing to land 1 PR through feature-a...");
		expect(streamText).toContain("✓ $ git rev-parse --show-toplevel");
		expect(streamText).toContain("→ Merging PR #101 feature-a...");
		expect(streamText).toContain(
			`✓ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'PR 101' --body '<PR body>'`,
		);
		expect(streamText).toContain("→ Merged and verified PR #101 feature-a.");
		expect(streamText).toContain("→ Cleaning up local branch feature-a...");
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).toContain(
			"Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.",
		);
	});

	test("uses merge-loop PR title and body as squash subject/body without displaying the body", async () => {
		const body = "Line 1\n\nLine 2";
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeFeatureAThroughDelete({ refreshTarget: null, title: "Custom squash subject", body }),
		];
		const { pi, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		const mergeCall = pi.execCalls.find(
			(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
		);
		expect(mergeCall?.args).toEqual(
			expectedSquashMergeArgs({ number: 101, sha: SHA_A, title: "Custom squash subject", body }),
		);
		expect(mergeCall?.args.at(-1)).toBe(body);

		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`✓ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'Custom squash subject' --body '<PR body>'`,
		);
		expect(streamText).not.toContain("Line 1");
		expect(streamText).not.toContain("Line 2");
	});

	test("passes an empty squash body when the merge-loop PR body is null", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeFeatureAThroughDelete({ refreshTarget: null, body: null }),
		];
		const { pi } = await runLandStack("--yes", script);

		pi.assertDone();
		const mergeCall = pi.execCalls.find(
			(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
		);
		expect(mergeCall?.args).toEqual(
			expectedSquashMergeArgs({ number: 101, sha: SHA_A, body: null }),
		);
		expect(mergeCall?.args.at(-1)).toBe("");
	});

	test("renders final landed PR numbers as terminal hyperlinks", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(notifications.at(-1)?.message).toContain(
			"\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a",
		);
		const finalMessage = messages.at(-1);
		expect(messageContentText(finalMessage?.content ?? "")).toContain(
			"✓ Landed 1 PR: #101 feature-a.",
		);
		expect(finalMessage?.details).toEqual({
			prLinks: [{ number: 101, url: "https://github.example/pull/101" }],
		});
		const renderer = pi.messageRenderers.get("land-command-stream");
		expect(renderer).toBeDefined();
		const rendered = renderer?.(
			finalMessage!,
			{ expanded: false },
			{ fg: (_color: string, text: string) => text },
		)
			.render(200)
			.join("\n");
		expect(rendered).toContain(
			"\x1B]8;;https://github.example/pull/101\x07#101\x1B]8;;\x07 feature-a",
		);
	});

	test("command stream renderer ignores unsafe PR link URLs in details", () => {
		const pi = new FakePi();
		registerLandStackRenderer(pi);
		const renderer = pi.messageRenderers.get("land-command-stream");
		expect(renderer).toBeDefined();

		const rendered = renderer?.(
			{
				customType: "land-command-stream",
				content: "✓ Landed 1 PR: #101 feature-a.",
				display: true,
				details: { prLinks: [{ number: 101, url: "javascript:alert(1)" }] },
			},
			{ expanded: false },
			{ fg: (_color: string, text: string) => text },
		)
			.render(200)
			.join("\n");

		expect(rendered).toBe("✓ Landed 1 PR: #101 feature-a.");
		expect(rendered).not.toContain("\x1B]8;;");
	});

	test("treats missing local branch during Graphite delete as successful cleanup", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "ERROR: Could not find branch feature-a.\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 1 PR: #101 feature-a.",
		);
		expect(commandMessagesText(messages)).toContain(
			"✓ $ gt delete feature-a -f -q — branch feature-a already absent",
		);
	});

	test("retains final local Graphite branch when it is checked out in this worktree", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "fatal: 'feature-a' is already checked out at '/repo'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("git switch --detach");
		expect(streamText).toContain(
			"✓ $ gt delete feature-a -f -q — branch feature-a still checked out; clean up manually with gt sync or direct branch deletion",
		);
		expect(streamText).toContain(
			"Local branch feature-a was kept (still checked out at /repo); delete it manually or run gt sync.",
		);
		expect(streamText).not.toContain("Completed with 1 warning:");
	});

	test("treats final local Graphite delete checkout conflict in another worktree as successful landing", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "fatal: 'feature-a' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 1 PR: #101 feature-a.",
		);
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("✗ $ gt delete feature-a -f -q — exit 1");
		expect(streamText).not.toContain("fatal: 'feature-a' is already checked out");
		expect(streamText).toContain(
			"✓ $ gt delete feature-a -f -q — branch feature-a still checked out; clean up manually with gt sync or direct branch deletion",
		);
		expect(streamText).toContain(
			"Local branch feature-a was kept (still checked out at /repo-main); delete it manually or run gt sync.",
		);
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).not.toContain("Completed with 1 warning:");
		expect(streamText).not.toContain(
			"All target PRs were merged, but deleting the local Graphite branch feature-a failed.",
		);
		expect(streamText).not.toContain("land stopped");
		expect(streamText).not.toContain("Failed at:");
	});

	test("treats unexpected final local Graphite delete failure as a post-landing warning", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "ERROR: authentication failed\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Delete or repair local Graphite branch feature-a manually, then inspect the stack.",
		);
		expect(notificationText).not.toContain("Landed 1 PR");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("✗ $ gt delete feature-a -f -q — exit 1");
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain(
			"All target PRs were merged, but deleting the local Graphite branch feature-a failed.",
		);
		expect(streamText).not.toContain("land stopped");
		expect(streamText).not.toContain("Failed at:");
	});

	test("targets the next open branch for Graphite refresh after merging a downstack PR", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_A}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_A })),
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
			childrenRecheckStep("feature-a", ["feature-b"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: "feature-a",
			}),
			submitUpdateStep("feature-b"),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 102, branch: "feature-b", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
			step("gh", ["pr", "view", "102", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 102,
						branch: "feature-b",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-b", []),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "get")
				.map((call) => call.args[1]),
		).toEqual(["feature-b"]);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("offers to submit stale PR heads during preflight before merging", async () => {
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Run gt submit/update?");
		expect(confirmations[0]?.message).toContain("#101 feature-a");
		expect(confirmations[0]?.message).toContain("head aaaaaaa != local bbbbbbb");
		expect(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("does not ask again for stale PR submit/update when pre-merge work is already approved", async () => {
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("", script, {
			confirms: [true],
			executeOptions: { preMergeConfirmation: "already-approved" },
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Land this stack path?");
		expect(confirmations.map((confirmation) => confirmation.title)).not.toContain(
			"Run gt submit/update?",
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("reloads stack facts for the submit/update recheck after domain preflight", async () => {
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			step("git", ["rev-list", "-1", "refs/heads/main", "--not", "refs/heads/feature-a"]),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const pi = new FakePi(script);
		const context = createContext({ confirms: [true] });

		await executeStackLanding(pi, context.ctx, expectSuccess(parseArgs("--yes")));

		pi.assertDone();
		const submitIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && sameArgs(call.args, submitArgs),
		);
		const stackReadIndices = pi.execCalls.flatMap((call, index) =>
			call.command === TOPOLOGY_COMMAND && sameArgs(call.args, TOPOLOGY_ARGS) ? [index] : [],
		);
		const recheckStackIndex = stackReadIndices.find((index) => index > submitIndex) ?? -1;
		const mergeIndex = pi.execCalls.findIndex(
			(call) => call.command === "gh" && call.args[1] === "merge",
		);
		expect(submitIndex).toBeGreaterThanOrEqual(0);
		expect(recheckStackIndex).toBeGreaterThan(submitIndex);
		expect(recheckStackIndex).toBeLessThan(mergeIndex);
		expect(stackReadIndices.filter((index) => index < mergeIndex)).toHaveLength(2);
		expect(context.notifications.at(-1)?.level).toBe("success");
	});

	test("offers to restack before submit/update when git reachability shows restack is needed", async () => {
		const restackArgs = ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"];
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
			step("gt", restackArgs),
			submitRestackRecheckStep(),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_C, prSha: SHA_C }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_C } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_C}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_C })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_C })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_C,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Run gt restack + submit/update?");
		expect(confirmations[0]?.message).toContain("needs restack before submit/update");
		expect(confirmations[0]?.message).toContain("- feature-a on main");
		expect(confirmations[0]?.message).toContain("#101 feature-a");
		expect(confirmations[0]?.message).toContain(`$ ${formatCommand("gt", restackArgs)}`);
		expect(confirmations[0]?.message).toContain(`$ ${formatCommand("gt", submitArgs)}`);
		expect(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, restackArgs)),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		);
		expect(
			pi.execCalls.findIndex((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(commandMessagesText(messages)).toContain(`✓ $ ${formatCommand("gt", restackArgs)}`);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("frees landing slots before restack and submit/update when both are required", async () => {
		const slotWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A, worktrees: slotWorktrees }),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			step("gt", ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"]),
			submitRestackRecheckStep(),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({ localSha: SHA_B, prSha: SHA_B }),
			...backupRefSteps(["feature-a"], { shas: { "feature-a": SHA_B } }),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_B })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", []),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true, true],
		});

		pi.assertDone();
		expect(confirmations.map((confirmation) => confirmation.title)).toEqual([
			"Free landing slots?",
			"Run gt restack + submit/update?",
		]);
		const slotIndex = pi.execCalls.findIndex(
			(call) => call.command === "ns" && call.args[0] === "slot",
		);
		const restackIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && call.args[0] === "restack",
		);
		const submitIndex = pi.execCalls.findIndex(
			(call) => call.command === "gt" && sameArgs(call.args, submitArgs),
		);
		const mergeIndex = pi.execCalls.findIndex(
			(call) => call.command === "gh" && call.args[1] === "merge",
		);
		expect(slotIndex).toBeLessThan(restackIndex);
		expect(restackIndex).toBeLessThan(submitIndex);
		expect(submitIndex).toBeLessThan(mergeIndex);
		expect(notifications.at(-1)?.level).toBe("success");
	});

	test("stops when gt restack silently leaves branches unrestacked", async () => {
		const restackArgs = ["restack", "--branch", "feature-a", "--upstack", "--no-interactive"];
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A }),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
			step("gt", restackArgs),
			submitRestackRecheckStep({ stdout: `${SHA_C}\n` }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain("still not restacked");
		expect(commandMessagesText(messages)).toContain(
			"gt restack exits 0 while skipping branches checked out in other worktrees",
		);
		expect(
			pi.execCalls.some((call) => call.command === "gt" && sameArgs(call.args, submitArgs)),
		).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});

	test("stops when managed slot conflicts reappear after submit/update", async () => {
		const slotWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const submitArgs = [
			"submit",
			"--branch",
			"feature-a",
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
		];
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_B, prSha: SHA_A, worktrees: slotWorktrees }),
			submitRestackRecheckStep(),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			step("gt", submitArgs),
			...singleBranchDomainPreflightWithRefs({
				localSha: SHA_B,
				prSha: SHA_B,
				worktrees: slotWorktrees,
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script, {
			confirms: [true, true],
		});

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(commandMessagesText(messages)).toContain(
			"Landing branches are checked out in managed slots after submit/update",
		);
		expect(commandMessagesText(messages)).toContain("slot-01 feature-a");
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});

	test("merge failure stops immediately with no local cleanup", async () => {
		const body = "Line 1\n\nLine 2";
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ mergeCode: 1, body }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			"Merge rejected; stopping stack landing immediately.",
		);
		expect(notifications[0]?.message).not.toContain("Line 1");
		expect(notifications[0]?.message).not.toContain("Line 2");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`✗ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'PR 101' --body '<PR body>' — exit 1`,
		);
		expect(streamText).not.toContain("Line 1");
		expect(streamText).not.toContain("Line 2");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});

	test("verification failure after gh pr merge skips local Graphite cleanup", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ verifyState: "OPEN", includeCleanup: false }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			"PR did not verify as MERGED; local Graphite cleanup skipped",
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});

	test("managed slot conflict asks for confirmation and frees targeted slots before merging", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const script = [
			...singleBranchPreflight(managedWorktrees),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Free landing slots?");
		expect(confirmations[0]?.message).toContain("slot-01 feature-a");
		expect(confirmations[0]?.message).toContain("Command: ns slot free --wt slot-01");
		expect(
			pi.execCalls.findIndex((call) => call.command === "ns" && call.args[0] === "slot"),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(
			pi.execCalls.some(
				(call) => call.command === "slot" && sameArgs(call.args, ["gt", "free-stack"]),
			),
		).toBe(false);
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 1 PR: #101 feature-a.",
		);
	});

	test("managed slot conflict in non-interactive mode refuses and does not free slots", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const { pi } = await captureConsole(() =>
			runLandStack("--yes", singleBranchPreflight(managedWorktrees), { hasUI: false }),
		);

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});

	test("restack failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"], {
				code: 1,
				stderr: "restack failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Restack failed after merging #101; stopping before merging feature-b.",
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit")).toBe(
			false,
		);
	});

	test("submit/update failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: "feature-a",
			}),
			step(
				"gt",
				[
					"submit",
					"--branch",
					"feature-b",
					"--no-stack",
					"--update-only",
					"--no-edit",
					"--no-ai",
					"--no-interactive",
					"--force",
				],
				{
					code: 1,
					stderr: "submit failed",
				},
			),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Submit/update failed after merging #101; stopping before merging feature-b.",
		);
	});

	test("PR preflight failures refuse before worktree checks or mutation", async () => {
		const script = badInitialPrPreflight(
			prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, isDraft: true }),
		);
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("is a draft");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "worktree")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
});
