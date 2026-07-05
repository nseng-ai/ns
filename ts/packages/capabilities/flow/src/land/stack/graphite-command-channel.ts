import {
	execApiToCommandRunner,
	formatCommand,
	piExecApiToCommandExecApi,
	runNormalizedExecResult,
	type ExecResult,
} from "@ns/core/command";
import { stripTerminalEscapes } from "@ns/core/terminal-escapes";
import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@ns/capability-kit/graphite/branch";
import type { CommandStreamFinish, LandStackExtensionAPI, FlowLandingPlan } from "./types.ts";

const READ_GRAPHITE_BRANCH_METADATA_ARGS_PREFIX = [
	"flow",
	"exec",
	"read-graphite-branch-metadata",
] as const;

export interface CheckedOutElsewhere {
	branch: string;
	path: string;
}

export interface ReadGraphiteBranchMetadataCommand {
	command: "ns";
	args: string[];
	display: string;
}

export type GetDownstackConflictHandling = "fail" | "defer";
export type DeleteLocalBranchConflictHandling = "fail" | "retain";

export type LandGraphiteOperation =
	| { kind: "trunk" }
	| { kind: "submit-update"; branch: string; force?: boolean }
	| { kind: "restack-upstack"; branch: string }
	| {
			kind: "get-downstack-no-checkout";
			branch: string;
			checkedOutConflictHandling?: GetDownstackConflictHandling;
	  }
	| {
			kind: "delete-local-branch";
			branch: string;
			checkedOutConflictHandling?: DeleteLocalBranchConflictHandling;
	  }
	| { kind: "untrack-local-branch"; branch: string };

type FinalLocalBranchDeletionOperation = Extract<
	LandGraphiteOperation,
	{ kind: "delete-local-branch" }
>;

type GetDownstackNoCheckoutOperation = Extract<
	LandGraphiteOperation,
	{ kind: "get-downstack-no-checkout" }
>;

type StandardGraphiteOperation = Exclude<
	LandGraphiteOperation,
	FinalLocalBranchDeletionOperation | GetDownstackNoCheckoutOperation
>;

type LandGraphiteOperationRunResult =
	| ExecResult
	| OptionalDescendantGraphiteCommandResult
	| FinalLocalGraphiteBranchDeletion;

export interface GraphiteCommandOptions<
	TOperation extends LandGraphiteOperation = LandGraphiteOperation,
> {
	operation: TOperation;
	cwd: string;
	timeoutMs: number;
}

export interface GraphiteCommandStream {
	start(commandDisplay: string): void;
	finish(commandDisplay: string, finish: CommandStreamFinish): void;
}

const NOOP_GRAPHITE_COMMAND_STREAM: GraphiteCommandStream = {
	start: () => {},
	finish: () => {},
};

interface GraphiteOperationSpec<TOperation extends LandGraphiteOperation> {
	kind: TOperation["kind"];
	buildArgs(operation: TOperation): string[];
}

interface GraphiteCommandStreamRequest {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: ResolvedGraphiteCommandOptions;
}

interface WithGraphiteCommandStreamOptions<T> extends GraphiteCommandStreamRequest {
	finishAndValue(raw: ExecResult): { finish?: CommandStreamFinish; value: T };
}

interface ResolvedGraphiteCommandOptions {
	args: string[];
	cwd: string;
	timeoutMs: number;
}

interface DeleteFinalLocalGraphiteBranchStreamedOptions extends GraphiteCommandStreamRequest {
	branch: string;
	shouldRetainCheckedOutConflict: boolean;
}

export interface OptionalDescendantGraphiteCommandResult {
	result: ExecResult;
	checkoutConflict?: CheckedOutElsewhere;
}

export type FinalLocalGraphiteBranchDeletion =
	| { kind: "deleted" }
	| { kind: "retained"; branch: string; path: string }
	| { kind: "failed"; result: ExecResult };

export interface LandGraphiteCommandChannel {
	run(
		options: GraphiteCommandOptions<FinalLocalBranchDeletionOperation>,
	): Promise<FinalLocalGraphiteBranchDeletion>;
	run(
		options: GraphiteCommandOptions<GetDownstackNoCheckoutOperation>,
	): Promise<OptionalDescendantGraphiteCommandResult>;
	run(options: GraphiteCommandOptions<StandardGraphiteOperation>): Promise<ExecResult>;
}

type CreateLandGraphiteCommandChannelOptions =
	| { pi: LandStackExtensionAPI }
	| { pi: LandStackExtensionAPI; commandStream: GraphiteCommandStream };

export function createLandGraphiteCommandChannel(
	options: CreateLandGraphiteCommandChannelOptions,
): LandGraphiteCommandChannel {
	const { pi } = options;
	const commandStream =
		"commandStream" in options ? options.commandStream : NOOP_GRAPHITE_COMMAND_STREAM;
	return { run: createLandGraphiteChannelRun(pi, commandStream) };
}

export function trunkOperation(): Extract<LandGraphiteOperation, { kind: "trunk" }> {
	return { kind: "trunk" };
}

export function submitUpdateOperation(input: {
	readonly branch: string;
	readonly force?: boolean;
}): Extract<LandGraphiteOperation, { kind: "submit-update" }> {
	return {
		kind: "submit-update",
		branch: input.branch,
		...(input.force === undefined ? {} : { force: input.force }),
	};
}

export function restackUpstackOperation(
	branch: string,
): Extract<LandGraphiteOperation, { kind: "restack-upstack" }> {
	return { kind: "restack-upstack", branch };
}

export function getDownstackNoCheckoutOperation(input: {
	readonly branch: string;
	readonly checkedOutConflictHandling?: GetDownstackConflictHandling;
}): Extract<LandGraphiteOperation, { kind: "get-downstack-no-checkout" }> {
	return {
		kind: "get-downstack-no-checkout",
		branch: input.branch,
		...(input.checkedOutConflictHandling === undefined
			? {}
			: { checkedOutConflictHandling: input.checkedOutConflictHandling }),
	};
}

export function deleteLocalBranchOperation(input: {
	readonly branch: string;
	readonly checkedOutConflictHandling?: DeleteLocalBranchConflictHandling;
}): Extract<LandGraphiteOperation, { kind: "delete-local-branch" }> {
	return {
		kind: "delete-local-branch",
		branch: input.branch,
		...(input.checkedOutConflictHandling === undefined
			? {}
			: { checkedOutConflictHandling: input.checkedOutConflictHandling }),
	};
}

export function untrackLocalBranchOperation(
	branch: string,
): Extract<LandGraphiteOperation, { kind: "untrack-local-branch" }> {
	return { kind: "untrack-local-branch", branch };
}

export function restackTargetForSubmit(plan: FlowLandingPlan): string | undefined {
	return plan.submitRestackRequirements[0]?.branch;
}

export function formatSubmitUpdateCommandLines(plan: FlowLandingPlan): string[] {
	const submitOperation = submitUpdateOperation({ branch: plan.stack.landingTargetBranch });
	const restackTarget = restackTargetForSubmit(plan);
	return restackTarget
		? [
				formatGraphiteOperation(restackUpstackOperation(restackTarget)),
				formatGraphiteOperation(submitOperation),
			]
		: [formatGraphiteOperation(submitOperation)];
}

export function formatGraphiteOperation(operation: LandGraphiteOperation): string {
	return formatCommand(GRAPHITE_COMMAND_NAME, buildGraphiteOperationArgs(operation));
}

export function readGraphiteBranchMetadataCommand(
	dbPath: string,
): ReadGraphiteBranchMetadataCommand {
	const args = [...READ_GRAPHITE_BRANCH_METADATA_ARGS_PREFIX, "--db-path", dbPath];
	return { command: "ns", args, display: formatCommand("ns", args) };
}

export function normalizeLandCommandFinish(
	command: string,
	args: string[],
	result: ExecResult,
): CommandStreamFinish {
	if (command === GRAPHITE_COMMAND_NAME) {
		return normalizeGraphiteCommandFinish(args, result);
	}
	// /ns:flow:land reads Graphite topology through a controlled ns flow exec command;
	// avoid labeling unrelated ns invocations just because the binary matches.
	if (command === "ns" && result.code === 0 && isReadGraphiteBranchMetadataArgs(args)) {
		return { result, note: "read Graphite stack topology" };
	}
	return { result };
}

export function normalizeGraphiteCommandFinish(
	args: string[],
	result: ExecResult,
): CommandStreamFinish {
	const deleteBranch = args[0] === "delete" ? args[1] : undefined;
	if (
		deleteBranch &&
		result.code !== 0 &&
		!result.killed &&
		isGtDeleteMissingBranch(result, deleteBranch)
	) {
		return { result: { ...result, code: 0 }, note: `branch ${deleteBranch} already absent` };
	}
	return { result };
}

export function isGtDeleteMissingBranch(result: ExecResult, branch: string): boolean {
	const output = stripAnsi(`${result.stderr}\n${result.stdout}`).toLowerCase();
	return output.includes(`could not find branch ${branch.toLowerCase()}`);
}

export function parseGitCheckedOutElsewhere(result: ExecResult): CheckedOutElsewhere | undefined {
	const output = stripAnsi(`${result.stderr}\n${result.stdout}`);
	const match = output.match(
		/fatal:\s*['"]([^'"]+)['"] is already checked out at ['"]([^'"]+)['"]/i,
	);
	if (!match) return undefined;
	const branch = match[1];
	const path = match[2];
	if (!branch || !path) return undefined;
	return { branch, path };
}

export function stripAnsi(text: string): string {
	return stripTerminalEscapes(text);
}

type GraphiteOperationSpecs = {
	[K in LandGraphiteOperation["kind"]]: GraphiteOperationSpec<
		Extract<LandGraphiteOperation, { kind: K }>
	>;
};

const GRAPHITE_OPERATION_SPECS = {
	trunk: {
		kind: "trunk",
		buildArgs: (_operation) => ["trunk", "--no-interactive"],
	},
	"submit-update": {
		kind: "submit-update",
		buildArgs: (operation) => [
			"submit",
			"--branch",
			operation.branch,
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
			...(operation.force ? ["--force"] : []),
		],
	},
	"restack-upstack": {
		kind: "restack-upstack",
		buildArgs: (operation) => [
			"restack",
			"--branch",
			operation.branch,
			"--upstack",
			"--no-interactive",
		],
	},
	"get-downstack-no-checkout": {
		kind: "get-downstack-no-checkout",
		buildArgs: (operation) => [
			"get",
			operation.branch,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		],
	},
	"delete-local-branch": {
		kind: "delete-local-branch",
		buildArgs: (operation) => ["delete", operation.branch, "-f", "-q"],
	},
	"untrack-local-branch": {
		kind: "untrack-local-branch",
		buildArgs: (operation) => ["untrack", operation.branch],
	},
} satisfies GraphiteOperationSpecs;

function graphiteOperationSpecFor<TOperation extends LandGraphiteOperation>(
	operation: TOperation,
): GraphiteOperationSpec<TOperation> {
	return GRAPHITE_OPERATION_SPECS[operation.kind] as GraphiteOperationSpec<TOperation>;
}

function buildGraphiteOperationArgs(operation: LandGraphiteOperation): string[] {
	return graphiteOperationSpecFor(operation).buildArgs(operation);
}

function createLandGraphiteChannelRun(
	pi: LandStackExtensionAPI,
	commandStream: GraphiteCommandStream,
): LandGraphiteCommandChannel["run"] {
	async function run(
		commandOptions: GraphiteCommandOptions<FinalLocalBranchDeletionOperation>,
	): Promise<FinalLocalGraphiteBranchDeletion>;
	async function run(
		commandOptions: GraphiteCommandOptions<GetDownstackNoCheckoutOperation>,
	): Promise<OptionalDescendantGraphiteCommandResult>;
	async function run(
		commandOptions: GraphiteCommandOptions<StandardGraphiteOperation>,
	): Promise<ExecResult>;
	async function run(
		commandOptions: GraphiteCommandOptions,
	): Promise<LandGraphiteOperationRunResult> {
		return await runLandGraphiteOperation({ pi, commandStream, commandOptions });
	}
	return run;
}

async function runLandGraphiteOperation(input: {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: GraphiteCommandOptions;
}): Promise<LandGraphiteOperationRunResult> {
	const commandOptions = resolveGraphiteCommandOptions(input.commandOptions);
	const operation = input.commandOptions.operation;
	if (operation.kind === "get-downstack-no-checkout") {
		return await runGetDownstackNoCheckoutStreamedGraphiteCommand({
			pi: input.pi,
			commandStream: input.commandStream,
			commandOptions,
			shouldDeferCheckoutConflict: operation.checkedOutConflictHandling === "defer",
		});
	}
	if (operation.kind === "delete-local-branch") {
		return await deleteFinalLocalGraphiteBranchStreamed({
			pi: input.pi,
			commandStream: input.commandStream,
			commandOptions,
			branch: operation.branch,
			shouldRetainCheckedOutConflict: operation.checkedOutConflictHandling === "retain",
		});
	}
	return await runStandardGraphiteOperation({
		pi: input.pi,
		commandStream: input.commandStream,
		commandOptions,
	});
}

function resolveGraphiteCommandOptions<TOperation extends LandGraphiteOperation>(
	options: GraphiteCommandOptions<TOperation>,
): ResolvedGraphiteCommandOptions {
	return {
		args: buildGraphiteOperationArgs(options.operation),
		cwd: options.cwd,
		timeoutMs: options.timeoutMs,
	};
}

async function executeGraphiteCommand(
	pi: LandStackExtensionAPI,
	options: ResolvedGraphiteCommandOptions,
): Promise<ExecResult> {
	return runNormalizedExecResult(
		async () =>
			await runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), options),
	);
}

async function runStandardGraphiteOperation(input: {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: ResolvedGraphiteCommandOptions;
}): Promise<ExecResult> {
	return (await runStreamedGraphiteCommand(input.pi, input.commandStream, input.commandOptions))
		.result;
}

async function withGraphiteCommandStream<T>(
	input: WithGraphiteCommandStreamOptions<T>,
): Promise<T> {
	const commandDisplay = formatCommand(GRAPHITE_COMMAND_NAME, input.commandOptions.args);
	input.commandStream.start(commandDisplay);
	const raw = await executeGraphiteCommand(input.pi, input.commandOptions);
	const { finish, value } = input.finishAndValue(raw);
	if (finish !== undefined) {
		input.commandStream.finish(commandDisplay, finish);
	}
	return value;
}

async function runStreamedGraphiteCommand(
	pi: LandStackExtensionAPI,
	commandStream: GraphiteCommandStream,
	options: ResolvedGraphiteCommandOptions,
): Promise<CommandStreamFinish> {
	return await withGraphiteCommandStream({
		pi,
		commandStream,
		commandOptions: options,
		finishAndValue: (raw) => {
			const finish = normalizeGraphiteCommandFinish(options.args, raw);
			return { finish, value: finish };
		},
	});
}

async function runGetDownstackNoCheckoutStreamedGraphiteCommand(input: {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: ResolvedGraphiteCommandOptions;
	shouldDeferCheckoutConflict: boolean;
}): Promise<OptionalDescendantGraphiteCommandResult> {
	return await withGraphiteCommandStream({
		pi: input.pi,
		commandStream: input.commandStream,
		commandOptions: input.commandOptions,
		finishAndValue: (raw) => {
			const rawCheckoutConflict = input.shouldDeferCheckoutConflict
				? parseOptionalCheckoutConflict(raw)
				: undefined;
			if (rawCheckoutConflict) {
				return { value: optionalGraphiteCommandResult(raw, rawCheckoutConflict) };
			}

			const finish = normalizeGraphiteCommandFinish(input.commandOptions.args, raw);
			return {
				finish,
				value: optionalGraphiteCommandResult(finish.result, undefined),
			};
		},
	});
}

async function deleteFinalLocalGraphiteBranchStreamed(
	input: DeleteFinalLocalGraphiteBranchStreamedOptions,
): Promise<FinalLocalGraphiteBranchDeletion> {
	return await withGraphiteCommandStream<FinalLocalGraphiteBranchDeletion>({
		pi: input.pi,
		commandStream: input.commandStream,
		commandOptions: input.commandOptions,
		finishAndValue: (raw) => {
			const checkoutConflict = input.shouldRetainCheckedOutConflict
				? parseOptionalCheckoutConflict(raw)
				: undefined;
			const finish = checkoutConflict
				? finalDeleteSkippedFinish(raw, input.branch)
				: normalizeGraphiteCommandFinish(input.commandOptions.args, raw);

			if (checkoutConflict) {
				return {
					finish,
					value: { kind: "retained", branch: input.branch, path: checkoutConflict.path },
				};
			}
			if (finish.result.code === 0) return { finish, value: { kind: "deleted" } };
			return { finish, value: { kind: "failed", result: finish.result } };
		},
	});
}

function isReadGraphiteBranchMetadataArgs(args: readonly string[]): boolean {
	return READ_GRAPHITE_BRANCH_METADATA_ARGS_PREFIX.every((part, index) => args[index] === part);
}

function parseOptionalCheckoutConflict(result: ExecResult): CheckedOutElsewhere | undefined {
	return result.code !== 0 && !result.killed ? parseGitCheckedOutElsewhere(result) : undefined;
}

function optionalGraphiteCommandResult(
	result: ExecResult,
	checkoutConflict: CheckedOutElsewhere | undefined,
): OptionalDescendantGraphiteCommandResult {
	return checkoutConflict ? { result, checkoutConflict } : { result };
}

function finalDeleteSkippedFinish(result: ExecResult, branch: string): CommandStreamFinish {
	return {
		result: { ...result, code: 0 },
		note: `branch ${branch} still checked out; clean up manually with gt sync or direct branch deletion`,
	};
}
