import {
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@nseng-ai/extension-kit/graphite/branch";
import {
	buildGraphiteOperationArgs,
	parseGitCheckedOutElsewhere,
	stripAnsi,
	type CheckedOutElsewhere,
	type LandGraphiteOperation,
} from "../graphite-operations.ts";
import type { CommandInvocation, CommandStreamFinish, LandStackExtensionAPI } from "./types.ts";

// Kept for the established stack command-stream surface; operation vocabulary lives in land core.
export { stripAnsi } from "../graphite-operations.ts";

const READ_GRAPHITE_BRANCH_METADATA_ARGS_PREFIX = [
	"flow",
	"exec",
	"read-graphite-branch-metadata",
] as const;

export interface ReadGraphiteBranchMetadataCommand {
	command: "ns";
	args: string[];
	display: string;
}

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
	start(invocation: CommandInvocation): void;
	finish(invocation: CommandInvocation, finish: CommandStreamFinish): void;
}

const NOOP_GRAPHITE_COMMAND_STREAM: GraphiteCommandStream = {
	start: () => {},
	finish: () => {},
};

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
	if (command === "ns" && commandSucceeded(result) && isReadGraphiteBranchMetadataArgs(args)) {
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
		result.type === "exited" &&
		result.signal === null &&
		result.code !== 0 &&
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
	return await runGraphiteCommand(execApiToCommandRunner(pi), options);
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
	const invocation: CommandInvocation = {
		command: GRAPHITE_COMMAND_NAME,
		args: input.commandOptions.args,
		display: formatCommand(GRAPHITE_COMMAND_NAME, input.commandOptions.args),
	};
	input.commandStream.start(invocation);
	const raw = await executeGraphiteCommand(input.pi, input.commandOptions);
	const { finish, value } = input.finishAndValue(raw);
	if (finish !== undefined) {
		input.commandStream.finish(invocation, finish);
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
			if (commandSucceeded(finish.result)) return { finish, value: { kind: "deleted" } };
			return { finish, value: { kind: "failed", result: finish.result } };
		},
	});
}

export function isReadGraphiteBranchMetadataArgs(args: readonly string[]): boolean {
	return READ_GRAPHITE_BRANCH_METADATA_ARGS_PREFIX.every((part, index) => args[index] === part);
}

function parseOptionalCheckoutConflict(result: ExecResult): CheckedOutElsewhere | undefined {
	return result.type === "exited" && result.signal === null && result.code !== 0
		? parseGitCheckedOutElsewhere(result)
		: undefined;
}

function optionalGraphiteCommandResult(
	result: ExecResult,
	checkoutConflict: CheckedOutElsewhere | undefined,
): OptionalDescendantGraphiteCommandResult {
	return checkoutConflict ? { result, checkoutConflict } : { result };
}

function finalDeleteSkippedFinish(result: ExecResult, branch: string): CommandStreamFinish {
	const successfulResult: ExecResult = {
		type: "exited",
		stdout: result.stdout,
		stderr: result.stderr,
		code: 0,
		signal: null,
	};
	return {
		result: successfulResult,
		note: `branch ${branch} still checked out; clean up manually with gt sync or direct branch deletion`,
	};
}
