import { runCommand, stripTerminalEscapes, type CommandRunner, type ExecResult } from "../exec.ts";
import type { GitGateway } from "../git/index.ts";

import type { GithubPrGateway } from "./github-pr-gateway.ts";
import { extractPrLinks, type SubmitPrLink } from "./gt-output.ts";
import {
	formatPostSubmitFailureOutput,
	formatPreflightFailureOutput,
	formatPrewriteFailureOutput,
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
import { prepareSubmitPrMetadata, type SubmitMetadataGateway } from "./submit-pr-metadata-prewrite.ts";
import { formatPrDescriptionFailureText, generateSubmitPrDescriptions } from "./submit-pr-descriptions.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

const SUBMIT_ARGS = ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web"] as const;
const SUBMIT_DRY_RUN_ARGS = ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web", "--dry-run"] as const;
const RESTACK_ARGS = ["restack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["branch", "info", "--no-interactive"] as const;
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

export type SubmitRestackConfirmation = (prompt: SubmitRestackConfirmationPrompt) => Promise<boolean> | boolean;

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


export type SubmitSemanticFailureCause = "empty_branch_skipped";

export type CurrentPrVerificationFailureCause = "startup_error" | "timeout" | "command_failed";

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

		return uniqueNonEmpty([...parseConflictedFiles(unmerged.stdout), ...parsePorcelainConflictedFiles(status.stdout)]);
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

	private async runGit(args: string[], cwd: string, timeoutMs: number): Promise<SubmitCommandOutput> {
		return toSubmitCommandOutput(await this.runner("git", args, { cwd, timeout: timeoutMs }));
	}
}

export async function runSubmitCommand(options: RunSubmitCommandOptions): Promise<SubmitCommandResult> {
	const commandParams = submitCommandParams(options);
	const readiness = await options.gateway.checkSubmitReadiness(commandParams);
	if (readiness.kind === "failed") {
		return failure(normalizedFailureExitCode(readiness.output), formatPreflightFailureOutput(readiness.output));
	}
	if (readiness.kind === "restack_required") {
		const restackDecision = await shouldRunRestack(options, readiness.output);
		if (restackDecision === "unavailable") {
			return failure(1, formatRestackRequiredOutput(readiness.output));
		}
		if (restackDecision === "declined") {
			return failure(1, formatRestackDeclinedOutput(readiness.output));
		}

		const restackFailure = await runRestackBeforeSubmit(options.gateway, commandParams);
		if (restackFailure !== undefined) {
			return restackFailure;
		}

		const rechecked = await options.gateway.checkSubmitReadiness(commandParams);
		if (rechecked.kind !== "ready") {
			return failure(normalizedFailureExitCode(rechecked.output), formatReadinessRecheckFailureOutput(rechecked.output));
		}
	}

	const prewrite = await prepareSubmitPrMetadata({
		cwd: options.cwd,
		env: options.prDescription.env,
		gateway: options.metadataGateway,
		git: options.prDescription.git,
		textGeneration: options.prDescription.textGeneration,
	});
	if (prewrite.kind === "failed") {
		return failure(prewrite.exitCode ?? 1, formatPrewriteFailureOutput(prewrite.error, prewrite.amendedBranches));
	}

	const submitted = await options.gateway.submitCurrentStack(commandParams);
	if (submitted.kind === "failed") {
		return failure(normalizedFailureExitCode(submitted.output), formatSubmitFailureOutput(submitted.output, prewrite.prepared));
	}

	const currentPr = await options.gateway.verifyCurrentPr(commandParams);
	if (submitted.semanticFailureCause !== undefined || currentPr.kind !== "present") {
		return failure(
			1,
			formatPostSubmitFailureOutput({
				submitted,
				currentPr,
			}),
		);
	}

	const prLinks = mergePrLinks(submitted.prLinks, currentPr.prLinks);
	const descriptionResult = await generateSubmitPrDescriptions({
		cwd: options.cwd,
		prDescription: options.prDescription,
		prLinks,
		prewrittenMetadata: prewrite.prepared,
	});
	if (!descriptionResult.ok) {
		return failure(1, formatPrDescriptionFailureText(prLinks, descriptionResult.failures));
	}

	const successText = prLinks.length > 0
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

async function runRestackBeforeSubmit(gateway: SubmitGateway, commandParams: SubmitCommandParams): Promise<SubmitCommandResult | undefined> {
	const restack = await gateway.restackCurrentStack(commandParams);
	if (restack.kind === "conflict") {
		return failure(1, formatRestackConflictOutput(restack.output, restack.conflictedFiles));
	}
	if (restack.kind === "failed") {
		return failure(normalizedFailureExitCode(restack.output), formatRestackFailureOutput(restack.output));
	}
	return undefined;
}

function submitCommandParams(options: Pick<RunSubmitCommandOptions, "cwd" | "onOutput">): SubmitCommandParams {
	return {
		cwd: options.cwd,
		...(options.onOutput === undefined ? {} : { onOutput: options.onOutput }),
	};
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

function failure(exitCode: number, stderr: string): SubmitCommandResult {
	return {
		exitCode,
		stdout: "",
		stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`,
	};
}

function joinOutput(output: Pick<SubmitCommandOutput, "stdout" | "stderr">): string {
	return `${output.stdout}\n${output.stderr}`;
}

function mergePrLinks(first: readonly SubmitPrLink[], second: readonly SubmitPrLink[]): SubmitPrLink[] {
	const links: SubmitPrLink[] = [];
	const seenUrls = new Set<string>();
	for (const link of [...first, ...second]) {
		if (seenUrls.has(link.url)) continue;
		seenUrls.add(link.url);
		links.push({ ...link });
	}
	return links;
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
		/will not be submitted/i.test(strippedOutput) || /GitHub does not allow empty PRs/i.test(strippedOutput);

	if (emptyBranchWarning && skippedSubmissionWarning) {
		return "empty_branch_skipped";
	}

	return undefined;
}
