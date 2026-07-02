import {
	execApiToCommandRunner,
	formatCommand,
	piExecApiToCommandExecApi,
	runNormalizedExecResult,
	type ExecResult,
} from "@sdl/core/command";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@sdl/capability-kit/graphite/branch";
import { isReadGraphiteBranchMetadataArgs } from "./graphite-metadata-command.ts";
import type { CommandStreamFinish, LandStackExtensionAPI, LandingPlan } from "./types.ts";

export interface CheckedOutElsewhere {
	branch: string;
	path: string;
}

export interface GraphiteCommandOptions {
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export interface GraphiteCommandStream {
	start(commandDisplay: string): void;
	finish(commandDisplay: string, finish: CommandStreamFinish): void;
}

interface WithGraphiteCommandStreamOptions<T> {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: GraphiteCommandOptions;
	finishAndValue(raw: ExecResult): { finish?: CommandStreamFinish; value: T };
}

interface DeleteFinalLocalGraphiteBranchStreamedOptions {
	pi: LandStackExtensionAPI;
	commandStream: GraphiteCommandStream;
	commandOptions: GraphiteCommandOptions;
	branch: string;
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
	run(options: GraphiteCommandOptions): Promise<ExecResult>;
	runRaw(options: GraphiteCommandOptions): Promise<ExecResult>;
	runOptionalDescendant(
		options: GraphiteCommandOptions,
	): Promise<OptionalDescendantGraphiteCommandResult>;
	deleteFinalLocalBranch(options: {
		repoRoot: string;
		branch: string;
		timeoutMs: number;
	}): Promise<FinalLocalGraphiteBranchDeletion>;
}

export function createLandGraphiteCommandChannel(options: {
	pi: LandStackExtensionAPI;
	commandStream?: GraphiteCommandStream;
}): LandGraphiteCommandChannel {
	const { pi, commandStream } = options;
	return {
		async run(commandOptions) {
			if (commandStream) {
				return (await runStreamedGraphiteCommand(pi, commandStream, commandOptions)).result;
			}
			const result = await runRawGraphiteCommand(pi, commandOptions);
			return normalizeGraphiteCommandFinish(commandOptions.args, result).result;
		},
		async runRaw(commandOptions) {
			return await runRawGraphiteCommand(pi, commandOptions);
		},
		async runOptionalDescendant(commandOptions) {
			if (commandStream) {
				return await runOptionalDescendantStreamedGraphiteCommand(
					pi,
					commandStream,
					commandOptions,
				);
			}
			const result = await runRawGraphiteCommand(pi, commandOptions);
			const finish = normalizeGraphiteCommandFinish(commandOptions.args, result);
			return optionalGraphiteCommandResult(
				finish.result,
				parseOptionalCheckoutConflict(finish.result),
			);
		},
		async deleteFinalLocalBranch(deleteOptions) {
			const args = graphiteDeleteLocalBranchArgs(deleteOptions.branch);
			const commandOptions: GraphiteCommandOptions = {
				args,
				cwd: deleteOptions.repoRoot,
				timeoutMs: deleteOptions.timeoutMs,
			};
			if (commandStream) {
				return await deleteFinalLocalGraphiteBranchStreamed({
					pi,
					commandStream,
					commandOptions,
					branch: deleteOptions.branch,
				});
			}

			const raw = await runRawGraphiteCommand(pi, commandOptions);
			const checkoutConflict = parseOptionalCheckoutConflict(raw);
			if (checkoutConflict) {
				return { kind: "retained", branch: deleteOptions.branch, path: checkoutConflict.path };
			}
			const finish = normalizeGraphiteCommandFinish(args, raw);
			if (finish.result.code === 0) return { kind: "deleted" };
			return { kind: "failed", result: finish.result };
		},
	};
}

export function graphiteTrunkArgs(): string[] {
	return ["trunk", "--no-interactive"];
}

export function graphiteSubmitUpdateArgs(
	branch: string,
	options: { force?: boolean } = {},
): string[] {
	return [
		"submit",
		"--branch",
		branch,
		"--no-stack",
		"--update-only",
		"--no-edit",
		"--no-ai",
		"--no-interactive",
		...(options.force ? ["--force"] : []),
	];
}

export function graphiteRestackForSubmitArgs(branch: string): string[] {
	return graphiteRestackUpstackArgs(branch);
}

export function graphiteRestackUpstackArgs(branch: string): string[] {
	return ["restack", "--branch", branch, "--upstack", "--no-interactive"];
}

export function graphiteGetDownstackNoCheckoutArgs(branch: string): string[] {
	return [
		"get",
		branch,
		"--downstack",
		"--no-restack",
		"--no-checkout",
		"--force",
		"--no-interactive",
	];
}

export function graphiteDeleteLocalBranchArgs(branch: string): string[] {
	return ["delete", branch, "-f", "-q"];
}

export function restackTargetForSubmit(plan: LandingPlan): string | undefined {
	return plan.submitRestackRequirements[0]?.branch;
}

export function formatGraphiteCommand(args: readonly string[]): string {
	return formatCommand(GRAPHITE_COMMAND_NAME, [...args]);
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

async function runRawGraphiteCommand(
	pi: LandStackExtensionAPI,
	options: GraphiteCommandOptions,
): Promise<ExecResult> {
	return runNormalizedExecResult(
		async () =>
			await runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), options),
	);
}

async function withGraphiteCommandStream<T>(
	input: WithGraphiteCommandStreamOptions<T>,
): Promise<T> {
	const commandDisplay = formatGraphiteCommand(input.commandOptions.args);
	input.commandStream.start(commandDisplay);
	const raw = await runRawGraphiteCommand(input.pi, input.commandOptions);
	const { finish, value } = input.finishAndValue(raw);
	if (finish !== undefined) {
		input.commandStream.finish(commandDisplay, finish);
	}
	return value;
}

async function runStreamedGraphiteCommand(
	pi: LandStackExtensionAPI,
	commandStream: GraphiteCommandStream,
	options: GraphiteCommandOptions,
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

async function runOptionalDescendantStreamedGraphiteCommand(
	pi: LandStackExtensionAPI,
	commandStream: GraphiteCommandStream,
	options: GraphiteCommandOptions,
): Promise<OptionalDescendantGraphiteCommandResult> {
	return await withGraphiteCommandStream({
		pi,
		commandStream,
		commandOptions: options,
		finishAndValue: (raw) => {
			const rawCheckoutConflict = parseOptionalCheckoutConflict(raw);
			if (rawCheckoutConflict) {
				return { value: optionalGraphiteCommandResult(raw, rawCheckoutConflict) };
			}

			const finish = normalizeGraphiteCommandFinish(options.args, raw);
			return {
				finish,
				value: optionalGraphiteCommandResult(
					finish.result,
					parseOptionalCheckoutConflict(finish.result),
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
			const checkoutConflict = parseOptionalCheckoutConflict(raw);
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
