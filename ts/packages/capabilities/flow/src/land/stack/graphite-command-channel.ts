import {
	execApiToCommandRunner,
	formatCommand,
	piExecApiToCommandExecApi,
	runNormalizedExecResult,
	type ExecResult,
} from "@sdl/core/command";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@sdl/capability-kit/graphite/branch";
import type { CommandStreamFinish, LandStackExtensionAPI, LandingPlan } from "./types.ts";

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
	command: "sdl";
	args: string[];
	display: string;
}

export type LandGraphiteOperation =
	| { kind: "trunk" }
	| { kind: "submit-update"; branch: string; force?: boolean }
	| { kind: "restack-upstack"; branch: string }
	| { kind: "get-downstack-no-checkout"; branch: string; checkoutConflict?: "fail" | "defer" }
	| { kind: "delete-local-branch"; branch: string; checkedOutConflict?: "fail" | "retain" }
	| { kind: "untrack-local-branch"; branch: string };

type FinalLocalBranchDeletionOperation = Extract<
	LandGraphiteOperation,
	{ kind: "delete-local-branch" }
>;

type GetDownstackNoCheckoutOperation = Extract<
	LandGraphiteOperation,
	{ kind: "get-downstack-no-checkout" }
>;

type LandGraphiteOperationResult<TOperation extends LandGraphiteOperation> =
	TOperation extends FinalLocalBranchDeletionOperation
		? FinalLocalGraphiteBranchDeletion
		: TOperation extends GetDownstackNoCheckoutOperation
			? OptionalDescendantGraphiteCommandResult
			: ExecResult;

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

interface GraphiteOperationSpec<TOperation extends LandGraphiteOperation> {
	kind: TOperation["kind"];
	buildArgs(operation: TOperation): string[];
}

interface WithGraphiteCommandStreamOptions<T> {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: ResolvedGraphiteCommandOptions;
	finishAndValue(raw: ExecResult): { finish?: CommandStreamFinish; value: T };
}

interface ResolvedGraphiteCommandOptions {
	args: string[];
	cwd: string;
	timeoutMs: number;
}

interface DeleteFinalLocalGraphiteBranchStreamedOptions {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: ResolvedGraphiteCommandOptions;
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
	run<TOperation extends LandGraphiteOperation>(
		options: GraphiteCommandOptions<TOperation>,
	): Promise<LandGraphiteOperationResult<TOperation>>;
}

export function createLandGraphiteCommandChannel(options: {
	pi: LandStackExtensionAPI;
	commandStream?: GraphiteCommandStream;
}): LandGraphiteCommandChannel {
	const { pi, commandStream } = options;
	return {
		async run(commandOptions) {
			return (await runLandGraphiteOperation({
				pi,
				commandStream,
				commandOptions,
			})) as LandGraphiteOperationResult<typeof commandOptions.operation>;
		},
	};
}

export function restackTargetForSubmit(plan: LandingPlan): string | undefined {
	return plan.submitRestackRequirements[0]?.branch;
}

export function formatGraphiteOperation(operation: LandGraphiteOperation): string {
	return formatCommand(GRAPHITE_COMMAND_NAME, buildGraphiteOperationArgs(operation));
}

export function readGraphiteBranchMetadataCommand(
	dbPath: string,
): ReadGraphiteBranchMetadataCommand {
	const args = [...READ_GRAPHITE_BRANCH_METADATA_ARGS_PREFIX, "--db-path", dbPath];
	return { command: "sdl", args, display: formatCommand("sdl", args) };
}

export function normalizeLandCommandFinish(
	command: string,
	args: string[],
	result: ExecResult,
): CommandStreamFinish {
	if (command === GRAPHITE_COMMAND_NAME) {
		return normalizeGraphiteCommandFinish(args, result);
	}
	// /sdl:flow:land reads Graphite topology through a controlled SDL flow exec command;
	// avoid labeling unrelated sdl invocations just because the binary matches.
	if (command === "sdl" && result.code === 0 && isReadGraphiteBranchMetadataArgs(args)) {
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

export function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

type GraphiteOperationSpecs = {
	[K in LandGraphiteOperation["kind"]]: GraphiteOperationSpec<
		Extract<LandGraphiteOperation, { kind: K }>
	>;
};

const GRAPHITE_OPERATION_SPECS = {
	trunk: {
		kind: "trunk",
		buildArgs: () => ["trunk", "--no-interactive"],
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

function buildGraphiteOperationArgs<TOperation extends LandGraphiteOperation>(
	operation: TOperation,
): string[] {
	const spec = GRAPHITE_OPERATION_SPECS[operation.kind] as GraphiteOperationSpec<TOperation>;
	return spec.buildArgs(operation);
}

async function runLandGraphiteOperation<TOperation extends LandGraphiteOperation>(input: {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream | undefined;
	commandOptions: GraphiteCommandOptions<TOperation>;
}): Promise<LandGraphiteOperationResult<TOperation>> {
	const commandOptions = resolveGraphiteCommandOptions(input.commandOptions);
	const operation = input.commandOptions.operation;
	if (operation.kind === "get-downstack-no-checkout") {
		return (await runGetDownstackNoCheckoutOperation({
			pi: input.pi,
			commandStream: input.commandStream,
			commandOptions,
			shouldDeferCheckoutConflict: operation.checkoutConflict === "defer",
		})) as LandGraphiteOperationResult<TOperation>;
	}
	if (operation.kind === "delete-local-branch") {
		return (await runDeleteLocalBranchOperation({
			pi: input.pi,
			commandStream: input.commandStream,
			commandOptions,
			branch: operation.branch,
			shouldRetainCheckedOutConflict: operation.checkedOutConflict === "retain",
		})) as LandGraphiteOperationResult<TOperation>;
	}
	return (await runStandardGraphiteOperation({
		pi: input.pi,
		commandStream: input.commandStream,
		commandOptions,
	})) as LandGraphiteOperationResult<TOperation>;
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
	commandStream: GraphiteCommandStream | undefined;
	commandOptions: ResolvedGraphiteCommandOptions;
}): Promise<ExecResult> {
	if (input.commandStream) {
		return (await runStreamedGraphiteCommand(input.pi, input.commandStream, input.commandOptions))
			.result;
	}
	const result = await executeGraphiteCommand(input.pi, input.commandOptions);
	return normalizeGraphiteCommandFinish(input.commandOptions.args, result).result;
}

async function runGetDownstackNoCheckoutOperation(input: {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream | undefined;
	commandOptions: ResolvedGraphiteCommandOptions;
	shouldDeferCheckoutConflict: boolean;
}): Promise<OptionalDescendantGraphiteCommandResult> {
	const { commandStream } = input;
	if (commandStream) {
		return await runGetDownstackNoCheckoutStreamedGraphiteCommand({
			...input,
			commandStream,
		});
	}
	const result = await executeGraphiteCommand(input.pi, input.commandOptions);
	const finish = normalizeGraphiteCommandFinish(input.commandOptions.args, result);
	return optionalGraphiteCommandResult(
		finish.result,
		input.shouldDeferCheckoutConflict ? parseOptionalCheckoutConflict(finish.result) : undefined,
	);
}

async function runDeleteLocalBranchOperation(input: {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream | undefined;
	commandOptions: ResolvedGraphiteCommandOptions;
	branch: string;
	shouldRetainCheckedOutConflict: boolean;
}): Promise<FinalLocalGraphiteBranchDeletion> {
	const { commandStream } = input;
	if (commandStream) {
		return await deleteFinalLocalGraphiteBranchStreamed({
			pi: input.pi,
			commandStream,
			commandOptions: input.commandOptions,
			branch: input.branch,
			shouldRetainCheckedOutConflict: input.shouldRetainCheckedOutConflict,
		});
	}

	const raw = await executeGraphiteCommand(input.pi, input.commandOptions);
	const checkoutConflict = input.shouldRetainCheckedOutConflict
		? parseOptionalCheckoutConflict(raw)
		: undefined;
	if (checkoutConflict) {
		return { kind: "retained", branch: input.branch, path: checkoutConflict.path };
	}
	const finish = normalizeGraphiteCommandFinish(input.commandOptions.args, raw);
	if (finish.result.code === 0) return { kind: "deleted" };
	return { kind: "failed", result: finish.result };
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
				value: optionalGraphiteCommandResult(
					finish.result,
					input.shouldDeferCheckoutConflict
						? parseOptionalCheckoutConflict(finish.result)
						: undefined,
				),
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
