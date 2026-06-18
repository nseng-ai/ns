import { runCommand, stripTerminalEscapes, type CommandRunner, type ExecResult } from "../exec.ts";
import type { GitGateway } from "../git/index.ts";

import type { GithubPrGateway } from "./github-pr-gateway.ts";
import { extractPrLinks, type SubmitPrLink } from "./gt-output.ts";
import {
	formatPostSubmitFailureOutput,
	formatPreflightFailureOutput,
	formatPrewriteFailureOutput,
	formatTrunkOutOfDatePreflightOutput,
	formatReadinessRecheckFailureOutput,
	formatRestackConfirmationPrompt,
	formatRestackConflictOutput,
	formatRestackDeclinedOutput,
	formatRestackFailureOutput,
	formatRestackRequiredOutput,
	formatSubmitFailureOutput,
	formatSubmitSuccessFallbackText,
	formatSubmitSuccessText,
} from "./submit-format.ts";
import {
	prepareSubmitPrMetadata,
	type SubmitMetadataGateway,
} from "./submit-pr-metadata-prewrite.ts";
import {
	formatPrDescriptionFailureText,
	generateSubmitPrDescriptions,
} from "./submit-pr-descriptions.ts";
import { prNumberFromLink } from "./submit-pr-link.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

const SUBMIT_ARGS = [
	"submit",
	"-nps",
	"--no-ai",
	"--no-interactive",
	"--no-view",
	"--no-web",
] as const;
const SUBMIT_DRY_RUN_ARGS = [
	"submit",
	"-nps",
	"--no-ai",
	"--no-interactive",
	"--no-view",
	"--no-web",
	"--dry-run",
] as const;
const RESTACK_ARGS = ["restack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["branch", "info", "--no-interactive"] as const;
const SUBMIT_COMMAND_DISPLAY = "gt submit -nps --no-ai --no-interactive";
const SUBMIT_DRY_RUN_COMMAND_DISPLAY = "gt submit -nps --no-ai --no-interactive --dry-run";
const RESTACK_COMMAND_DISPLAY = "gt restack --no-interactive";
const CURRENT_PR_COMMAND_DISPLAY = "gt branch info --no-interactive";
const GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const SUBMIT_TIMEOUT_MS = 600_000;
const RESTACK_TIMEOUT_MS = 600_000;
const CURRENT_PR_TIMEOUT_MS = 60_000;
const GIT_CHECK_TIMEOUT_MS = 30_000;

export interface SubmitCommandOutput {
	stdout: string;
	stderr: string;
	exitCode: number;
	startupError?: string;
	killed?: boolean;
}

export type SubmitOutputStream = "stdout" | "stderr";
export type SubmitOutputListener = (stream: SubmitOutputStream, text: string) => void;

export interface SubmitRestackConfirmationPrompt {
	title: string;
	message: string;
}

export type SubmitRestackConfirmation = (
	prompt: SubmitRestackConfirmationPrompt,
) => Promise<boolean> | boolean;

export interface SubmitCommandParams {
	cwd: string;
	onOutput?: SubmitOutputListener;
}

interface RunGtOptions {
	args: readonly string[];
	cwd: string;
	timeoutMs: number;
	onOutput?: SubmitOutputListener;
}

export type SubmitSemanticFailureCause = {
	kind: "empty_branch_skipped";
	branchName?: string | undefined;
};

export type CurrentPrVerificationFailureCause = "startup_error" | "timeout" | "command_failed";
export type SubmitPreflightFailureCause = "trunk_out_of_date";
export type SubmitFailurePresentation = "deterministic" | "unknown";

export interface SubmitFailureTranscriptCommand {
	commandDisplay?: string | undefined;
	stdout: string;
	stderr: string;
	exitCode: number;
	startupError?: string | undefined;
	killed?: boolean | undefined;
}

export interface SubmitFailureTranscript {
	phase: string;
	summary?: string | undefined;
	commands: readonly SubmitFailureTranscriptCommand[];
}

export type SubmitPreflightResult =
	| {
			kind: "ready";
			output: SubmitCommandOutput;
	  }
	| {
			kind: "restack_required";
			output: SubmitCommandOutput;
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause?: SubmitPreflightFailureCause | undefined;
	  };

export type SubmitRestackResult =
	| {
			kind: "success";
			output: SubmitCommandOutput;
	  }
	| {
			kind: "conflict";
			output: SubmitCommandOutput;
			conflictedFiles: string[];
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
	  };

export type SubmitRunResult =
	| {
			kind: "success";
			output: SubmitCommandOutput;
			prLinks: SubmitPrLink[];
			semanticFailureCause?: SubmitSemanticFailureCause;
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
	  };

export type CurrentPrVerificationResult =
	| {
			kind: "present";
			output: SubmitCommandOutput;
			prLinks: SubmitPrLink[];
	  }
	| {
			kind: "no_current_pr";
			output: SubmitCommandOutput;
			cause: "no_current_pr";
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause: CurrentPrVerificationFailureCause;
	  };

export interface SubmitGateway {
	checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult>;
	restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult>;
	submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult>;
	verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult>;
}

export interface SubmitCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	failurePresentation?: SubmitFailurePresentation | undefined;
	rawFailureTranscript?: SubmitFailureTranscript | undefined;
}

export interface SubmitPrDescriptionOptions {
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	git: GitGateway;
	env: Record<string, string | undefined>;
}

export interface RunSubmitCommandOptions {
	cwd: string;
	gateway: SubmitGateway;
	metadataGateway: SubmitMetadataGateway;
	restack: boolean;
	shouldForwardCommandOutput?: boolean;
	onOutput?: SubmitOutputListener;
	confirmRestack?: SubmitRestackConfirmation;
	prDescription: SubmitPrDescriptionOptions;
}

export class RealSubmitGateway implements SubmitGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult> {
		const output = await this.runGt({
			args: SUBMIT_DRY_RUN_ARGS,
			cwd: params.cwd,
			timeoutMs: CURRENT_PR_TIMEOUT_MS,
			...(params.onOutput === undefined ? {} : { onOutput: params.onOutput }),
		});
		if (isSuccessfulOutput(output)) {
			return { kind: "ready", output };
		}
		if (!output.startupError && !output.killed && detectRestackNeeded(joinOutput(output))) {
			return { kind: "restack_required", output };
		}
		if (!output.startupError && !output.killed && detectTrunkOutOfDate(joinOutput(output))) {
			return { kind: "failed", output, cause: "trunk_out_of_date" };
		}
		return { kind: "failed", output };
	}

	async restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult> {
		const output = await this.runGt({
			args: RESTACK_ARGS,
			cwd: params.cwd,
			timeoutMs: RESTACK_TIMEOUT_MS,
			...(params.onOutput === undefined ? {} : { onOutput: params.onOutput }),
		});
		if (isSuccessfulOutput(output)) {
			return { kind: "success", output };
		}

		const conflictedFiles = await this.getConflictedFiles(params.cwd);
		if (detectRestackMergeConflict(joinOutput(output), conflictedFiles)) {
			return { kind: "conflict", output, conflictedFiles };
		}

		return { kind: "failed", output };
	}

	async submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult> {
		const output = await this.runGt({
			args: SUBMIT_ARGS,
			cwd: params.cwd,
			timeoutMs: SUBMIT_TIMEOUT_MS,
			...(params.onOutput === undefined ? {} : { onOutput: params.onOutput }),
		});
		if (!isSuccessfulOutput(output)) {
			return { kind: "failed", output };
		}

		const semanticFailureCause = detectSubmitSemanticFailureCause(joinOutput(output));
		const result: SubmitRunResult = {
			kind: "success",
			output,
			prLinks: extractPrLinks(joinOutput(output)),
		};
		if (semanticFailureCause !== undefined) {
			result.semanticFailureCause = semanticFailureCause;
		}
		return result;
	}

	async verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult> {
		const output = await this.runGt({
			args: CURRENT_PR_ARGS,
			cwd: params.cwd,
			timeoutMs: CURRENT_PR_TIMEOUT_MS,
			...(params.onOutput === undefined ? {} : { onOutput: params.onOutput }),
		});
		if (output.startupError !== undefined) {
			return { kind: "failed", output, cause: "startup_error" };
		}
		if (output.killed === true) {
			return { kind: "failed", output, cause: "timeout" };
		}
		if (output.exitCode !== 0) {
			if (/No PR found/i.test(stripTerminalEscapes(joinOutput(output)))) {
				return { kind: "no_current_pr", output, cause: "no_current_pr" };
			}
			return { kind: "failed", output, cause: "command_failed" };
		}

		const prLinks = extractPrLinks(joinOutput(output));
		if (prLinks.length === 0) {
			return { kind: "no_current_pr", output, cause: "no_current_pr" };
		}

		return { kind: "present", output, prLinks };
	}

	private async getConflictedFiles(cwd: string): Promise<string[]> {
		const unmerged = await this.runGit([...GIT_UNMERGED_ARGS], cwd, GIT_CHECK_TIMEOUT_MS);
		const status = await this.runGit([...GIT_STATUS_PORCELAIN_ARGS], cwd, GIT_CHECK_TIMEOUT_MS);

		return uniqueNonEmpty([
			...parseConflictedFiles(unmerged.stdout),
			...parsePorcelainConflictedFiles(status.stdout),
		]);
	}

	private async runGt(options: RunGtOptions): Promise<SubmitCommandOutput> {
		const { args, cwd, timeoutMs, onOutput } = options;
		return toSubmitCommandOutput(
			await this.runner("gt", args, {
				cwd,
				timeout: timeoutMs,
				...(onOutput === undefined
					? {}
					: {
							onStdout: (text: string) => onOutput("stdout", text),
							onStderr: (text: string) => onOutput("stderr", text),
						}),
			}),
		);
	}

	private async runGit(
		args: string[],
		cwd: string,
		timeoutMs: number,
	): Promise<SubmitCommandOutput> {
		return toSubmitCommandOutput(await this.runner("git", args, { cwd, timeout: timeoutMs }));
	}
}

export async function runSubmitCommand(
	options: RunSubmitCommandOptions,
): Promise<SubmitCommandResult> {
	const commandParams = submitCommandParams(options);
	emitSubmitProgress(options, "checking Graphite submit readiness");
	const readiness = await options.gateway.checkSubmitReadiness(commandParams);
	if (readiness.kind === "failed") {
		if (readiness.cause === "trunk_out_of_date") {
			return failure(
				normalizedFailureExitCode(readiness.output),
				formatTrunkOutOfDatePreflightOutput(readiness.output),
				{
					failurePresentation: "deterministic",
					rawFailureTranscript: commandFailureTranscript(
						"preflight",
						SUBMIT_DRY_RUN_COMMAND_DISPLAY,
						readiness.output,
					),
				},
			);
		}
		return failure(
			normalizedFailureExitCode(readiness.output),
			formatPreflightFailureOutput(readiness.output),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					"preflight",
					SUBMIT_DRY_RUN_COMMAND_DISPLAY,
					readiness.output,
				),
			},
		);
	}
	if (readiness.kind === "restack_required") {
		emitSubmitProgress(options, "Graphite requires a restack before submit");
		const restackDecision = await shouldRunRestack(options, readiness.output);
		if (restackDecision === "unavailable") {
			return failure(1, formatRestackRequiredOutput(readiness.output), {
				failurePresentation: "deterministic",
			});
		}
		if (restackDecision === "declined") {
			return failure(1, formatRestackDeclinedOutput(readiness.output), {
				failurePresentation: "deterministic",
			});
		}

		const restackFailure = await runRestackBeforeSubmit(options, commandParams);
		if (restackFailure !== undefined) {
			return restackFailure;
		}

		const rechecked = await options.gateway.checkSubmitReadiness(commandParams);
		if (rechecked.kind !== "ready") {
			return failure(
				normalizedFailureExitCode(rechecked.output),
				formatReadinessRecheckFailureOutput(rechecked.output),
				{
					failurePresentation: "deterministic",
					rawFailureTranscript: commandFailureTranscript(
						"readiness recheck",
						SUBMIT_DRY_RUN_COMMAND_DISPLAY,
						rechecked.output,
					),
				},
			);
		}
	}

	emitSubmitProgress(options, "preparing PR metadata before submit");
	const prewrite = await prepareSubmitPrMetadata({
		cwd: options.cwd,
		env: options.prDescription.env,
		gateway: options.metadataGateway,
		git: options.prDescription.git,
		textGeneration: options.prDescription.textGeneration,
		onProgress: (message) => emitSubmitProgress(options, message),
	});
	if (prewrite.kind === "failed") {
		const stderr = formatPrewriteFailureOutput(prewrite.error, prewrite.amendedBranches);
		return failure(prewrite.exitCode ?? 1, stderr, {
			failurePresentation: "unknown",
			rawFailureTranscript: textFailureTranscript("pre-submit metadata", stderr),
		});
	}

	emitSubmitProgress(options, "running gt submit");
	const submitted = await options.gateway.submitCurrentStack(commandParams);
	if (submitted.kind === "failed") {
		return failure(
			normalizedFailureExitCode(submitted.output),
			formatSubmitFailureOutput(submitted.output, prewrite.prepared),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					"submit",
					SUBMIT_COMMAND_DISPLAY,
					submitted.output,
				),
			},
		);
	}

	emitSubmitProgress(options, "verifying submitted PRs");
	const currentPr = await options.gateway.verifyCurrentPr(commandParams);
	if (
		submitted.semanticFailureCause !== undefined ||
		shouldFailPostSubmitVerification(submitted, currentPr)
	) {
		const stderr = formatPostSubmitFailureOutput({
			submitted,
			currentPr,
		});
		return failure(1, stderr, {
			failurePresentation: isDeterministicPostSubmitFailure(submitted, currentPr)
				? "deterministic"
				: "unknown",
			rawFailureTranscript: postSubmitFailureTranscript(stderr, submitted, currentPr),
		});
	}

	const prLinks =
		currentPr.kind === "present"
			? mergePrLinks(submitted.prLinks, currentPr.prLinks)
			: mergePrLinks(submitted.prLinks, []);
	emitSubmitProgress(options, "generating or validating PR descriptions");
	const descriptionResult = await generateSubmitPrDescriptions({
		cwd: options.cwd,
		prDescription: options.prDescription,
		prLinks,
		prewrittenMetadata: prewrite.prepared,
		onProgress: (message) => emitSubmitProgress(options, message),
	});
	if (!descriptionResult.ok) {
		const stderr = formatPrDescriptionFailureText(prLinks, descriptionResult.failures);
		return failure(1, stderr, {
			failurePresentation: "deterministic",
			rawFailureTranscript: textFailureTranscript("PR description", stderr),
		});
	}

	const successText =
		prLinks.length > 0
			? formatSubmitSuccessText(prLinks, {
					generated: descriptionResult.generated,
					skipped: descriptionResult.skipped,
					prewritten: descriptionResult.prewritten,
					prewriteFallbacks: descriptionResult.prewriteFallbacks,
				})
			: formatSubmitSuccessFallbackText(submitted.output.stdout, submitted.output.stderr);
	return success(successText);
}

type RestackDecision = "run" | "declined" | "unavailable";

async function shouldRunRestack(
	options: Pick<RunSubmitCommandOptions, "restack" | "confirmRestack">,
	output: SubmitCommandOutput,
): Promise<RestackDecision> {
	if (options.restack) return "run";
	if (options.confirmRestack === undefined) return "unavailable";

	const confirmed = await options.confirmRestack(formatRestackConfirmationPrompt(output));
	return confirmed ? "run" : "declined";
}

async function runRestackBeforeSubmit(
	options: Pick<RunSubmitCommandOptions, "gateway" | "onOutput">,
	commandParams: SubmitCommandParams,
): Promise<SubmitCommandResult | undefined> {
	emitSubmitProgress(options, "running gt restack");
	const restack = await options.gateway.restackCurrentStack(commandParams);
	if (restack.kind === "conflict") {
		return failure(1, formatRestackConflictOutput(restack.output, restack.conflictedFiles), {
			failurePresentation: "deterministic",
			rawFailureTranscript: commandFailureTranscript(
				"restack",
				RESTACK_COMMAND_DISPLAY,
				restack.output,
			),
		});
	}
	if (restack.kind === "failed") {
		return failure(
			normalizedFailureExitCode(restack.output),
			formatRestackFailureOutput(restack.output),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					"restack",
					RESTACK_COMMAND_DISPLAY,
					restack.output,
				),
			},
		);
	}
	return undefined;
}

function submitCommandParams(
	options: Pick<RunSubmitCommandOptions, "cwd" | "shouldForwardCommandOutput" | "onOutput">,
): SubmitCommandParams {
	return {
		cwd: options.cwd,
		...(options.shouldForwardCommandOutput === false || options.onOutput === undefined
			? {}
			: { onOutput: options.onOutput }),
	};
}

function emitSubmitProgress(
	options: Pick<RunSubmitCommandOptions, "onOutput">,
	message: string,
): void {
	options.onOutput?.("stderr", formatSubmitProgressLine(message));
}

function formatSubmitProgressLine(message: string): string {
	const normalized = message.replace(/\.\.\.$/, "…");
	const line = formatSubmitProgressMessage(normalized);
	return `${line}\n`;
}

function formatSubmitProgressMessage(message: string): string {
	switch (message) {
		case "checking Graphite submit readiness":
			return "• Preflight: checking Graphite submit readiness…";
		case "Graphite requires a restack before submit":
			return "• Preflight: Graphite requires a restack before submit";
		case "running gt restack":
			return "• Preflight: running gt restack…";
		case "preparing PR metadata before submit":
			return "• Metadata: preparing PR metadata before submit…";
		case "running gt submit":
			return "• Submit: running gt submit…";
		case "verifying submitted PRs":
			return "• Verification: checking submitted PR…";
		case "generating or validating PR descriptions":
			return "• Descriptions: generating or validating PR descriptions…";
		default:
			return `  … ${message}`;
	}
}

function shouldFailPostSubmitVerification(
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
): boolean {
	if (currentPr.kind === "present") return false;
	if (currentPr.kind === "no_current_pr" && submitted.prLinks.length > 0) return false;
	return true;
}

function isDeterministicPostSubmitFailure(
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
): boolean {
	return submitted.semanticFailureCause === undefined && currentPr.kind === "no_current_pr";
}

function toSubmitCommandOutput(result: ExecResult): SubmitCommandOutput {
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.code,
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
		...(result.killed ? { killed: true } : {}),
	};
}

function isSuccessfulOutput(output: SubmitCommandOutput): boolean {
	return output.exitCode === 0 && !output.killed && output.startupError === undefined;
}

function normalizedFailureExitCode(output: SubmitCommandOutput): number {
	if (output.startupError !== undefined) return 2;
	if (output.killed === true) return 124;
	return output.exitCode === 0 ? 1 : output.exitCode;
}

function success(stdout: string): SubmitCommandResult {
	return {
		exitCode: 0,
		stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`,
		stderr: "",
	};
}

interface SubmitFailureResultOptions {
	failurePresentation: SubmitFailurePresentation;
	rawFailureTranscript?: SubmitFailureTranscript | undefined;
}

function failure(
	exitCode: number,
	stderr: string,
	options?: SubmitFailureResultOptions,
): SubmitCommandResult {
	return {
		exitCode,
		stdout: "",
		stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`,
		...(options?.failurePresentation === undefined
			? {}
			: { failurePresentation: options.failurePresentation }),
		...(options?.rawFailureTranscript === undefined
			? {}
			: { rawFailureTranscript: options.rawFailureTranscript }),
	};
}

function commandFailureTranscript(
	phase: string,
	commandDisplay: string,
	output: SubmitCommandOutput,
): SubmitFailureTranscript {
	return {
		phase,
		commands: [
			{
				commandDisplay,
				stdout: output.stdout,
				stderr: output.stderr,
				exitCode: normalizedFailureExitCode(output),
				...(output.startupError === undefined ? {} : { startupError: output.startupError }),
				...(output.killed === true ? { killed: true } : {}),
			},
		],
	};
}

function textFailureTranscript(phase: string, summary: string): SubmitFailureTranscript {
	return { phase, summary, commands: [] };
}

function postSubmitFailureTranscript(
	summary: string,
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
): SubmitFailureTranscript {
	return {
		phase: "post-submit verification",
		summary,
		commands: [
			{
				commandDisplay: SUBMIT_COMMAND_DISPLAY,
				stdout: submitted.output.stdout,
				stderr: submitted.output.stderr,
				exitCode: submitted.output.exitCode,
				...(submitted.output.startupError === undefined
					? {}
					: { startupError: submitted.output.startupError }),
				...(submitted.output.killed === true ? { killed: true } : {}),
			},
			{
				commandDisplay: CURRENT_PR_COMMAND_DISPLAY,
				stdout: currentPr.output.stdout,
				stderr: currentPr.output.stderr,
				exitCode: currentPr.output.exitCode,
				...(currentPr.output.startupError === undefined
					? {}
					: { startupError: currentPr.output.startupError }),
				...(currentPr.output.killed === true ? { killed: true } : {}),
			},
		],
	};
}

function joinOutput(output: Pick<SubmitCommandOutput, "stdout" | "stderr">): string {
	return `${output.stdout}\n${output.stderr}`;
}

function mergePrLinks(
	first: readonly SubmitPrLink[],
	second: readonly SubmitPrLink[],
): SubmitPrLink[] {
	const links: SubmitPrLink[] = [];
	const seenKeys = new Set<string>();
	for (const link of [...first, ...second]) {
		const key = prLinkIdentityKey(link);
		if (seenKeys.has(key)) continue;
		seenKeys.add(key);
		links.push({ ...link });
	}
	return links;
}

function prLinkIdentityKey(link: SubmitPrLink): string {
	const number = prNumberFromLink(link);
	return number === undefined ? link.url : `pr:${number}`;
}

function detectRestackNeeded(output: string): boolean {
	const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n");
	const mentionsRestack = /\brestack(?:ed|ing)?\b/i.test(strippedOutput);
	const requiresRestackBeforeSubmit =
		/before submit(?:ting|sion)?/i.test(strippedOutput) ||
		/need(?:s|ed)? to be restacked/i.test(strippedOutput) ||
		/must be restacked/i.test(strippedOutput) ||
		/requires? (?:a )?restack/i.test(strippedOutput) ||
		/restack (?:is )?required/i.test(strippedOutput);

	return mentionsRestack && requiresRestackBeforeSubmit;
}

function detectTrunkOutOfDate(output: string): boolean {
	return /trunk branch is out of date and could not be updated/i.test(stripTerminalEscapes(output));
}

function detectRestackMergeConflict(output: string, conflictedFiles: string[]): boolean {
	const strippedOutput = stripTerminalEscapes(output);
	return (
		conflictedFiles.length > 0 ||
		/CONFLICT \(/i.test(strippedOutput) ||
		/merge conflict/i.test(strippedOutput) ||
		/fix conflicts/i.test(strippedOutput) ||
		/resolve conflicts/i.test(strippedOutput)
	);
}

function parseConflictedFiles(output: string): string[] {
	return uniqueNonEmpty(stripTerminalEscapes(output).replace(/\r/g, "\n").split("\n"));
}

function parsePorcelainConflictedFiles(output: string): string[] {
	const conflictStatuses = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
	const files: string[] = [];

	for (const line of stripTerminalEscapes(output).replace(/\r/g, "\n").split("\n")) {
		if (line.length < 4) continue;

		const status = line.slice(0, 2);
		if (!conflictStatuses.has(status)) continue;

		files.push(line.slice(3));
	}

	return uniqueNonEmpty(files);
}

function uniqueNonEmpty(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;

		seen.add(trimmed);
		unique.push(trimmed);
	}

	return unique;
}

function detectSubmitSemanticFailureCause(output: string): SubmitSemanticFailureCause | undefined {
	const strippedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n");
	const emptyBranchWarning = /This branch does not introduce any changes:/i.test(strippedOutput);
	const skippedSubmissionWarning =
		/will not be submitted/i.test(strippedOutput) ||
		/GitHub does not allow empty PRs/i.test(strippedOutput);

	if (emptyBranchWarning && skippedSubmissionWarning) {
		return {
			kind: "empty_branch_skipped",
			branchName: parseSubmitValidationBranchName(strippedOutput),
		};
	}

	return undefined;
}

function parseSubmitValidationBranchName(output: string): string | undefined {
	const validationBlock = output.match(
		/Validating that this Graphite stack is ready to submit\.\.\.(?<block>[\s\S]*?)(?:\n\s*📝|\n\s*WARNING:|$)/u,
	)?.groups?.block;
	if (validationBlock === undefined) return undefined;

	for (const line of validationBlock.split("\n")) {
		const match = line.match(/^\s*▸\s*(?<branch>\S+)\s*$/u);
		const branch = match?.groups?.branch;
		if (branch !== undefined) return branch;
	}
	return undefined;
}
