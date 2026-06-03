import { runCommand, type CommandResult as RunnerCommandResult, type CommandRunner } from "./command-runner.ts";

const SUBMIT_ARGS = ["submit", "-nps", "--ai"] as const;
const SUBMIT_DRY_RUN_ARGS = ["submit", "-nps", "--ai", "--dry-run"] as const;
const RESTACK_ARGS = ["restack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["pr"] as const;
const GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const SUBMIT_TIMEOUT_MS = 600_000;
const RESTACK_TIMEOUT_MS = 600_000;
const CURRENT_PR_TIMEOUT_MS = 60_000;
const GIT_CHECK_TIMEOUT_MS = 30_000;
const SUCCESS_OUTPUT_TAIL_MAX_LINES = 20;
const SUCCESS_OUTPUT_TAIL_MAX_CHARS = 2_000;

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

export interface SubmitPrLink {
	label: string;
	url: string;
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

export interface RunSubmitCommandOptions {
	cwd: string;
	gateway: SubmitGateway;
	restack: boolean;
	onOutput?: SubmitOutputListener;
	confirmRestack?: SubmitRestackConfirmation;
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
			if (/No PR found/i.test(stripAnsi(joinOutput(output)))) {
				return { kind: "no_current_pr", output, cause: "no_current_pr" };
			}
			return { kind: "failed", output, cause: "command_failed" };
		}

		return { kind: "present", output, prLinks: extractPrLinks(joinOutput(output)) };
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
				timeoutMs,
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
		return toSubmitCommandOutput(await this.runner("git", args, { cwd, timeoutMs }));
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
	}

	const submitted = await options.gateway.submitCurrentStack(commandParams);
	if (submitted.kind === "failed") {
		return failure(normalizedFailureExitCode(submitted.output), formatSubmitFailureOutput(submitted.output));
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
	const successText = prLinks.length > 0 ? formatSubmitSuccessText(prLinks) : formatSubmitSuccessFallbackText(submitted.output.stdout, submitted.output.stderr);
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

function toSubmitCommandOutput(result: RunnerCommandResult): SubmitCommandOutput {
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode,
		...(result.startupError !== undefined ? { startupError: result.startupError } : {}),
		...(result.killed === true ? { killed: true } : {}),
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

function formatSubmitSuccessText(prLinks: SubmitPrLink[]): string {
	return ["gt submit succeeded", "", "PRs:", ...prLinks.map(formatPrLinkTextRow)].join("\n");
}

function formatPrLinkTextRow(link: SubmitPrLink): string {
	if (link.label === link.url) return `• ${link.url}`;
	return `• ${link.label} ${link.url}`;
}

function formatSubmitSuccessFallbackText(stdout: string, stderr: string): string {
	const lines = ["gt submit succeeded, but no PR URLs were detected in output."];
	const outputTail = formatSubmitOutputTail(stdout, stderr);
	if (outputTail) {
		lines.push("", "Recent output:", outputTail);
	}
	return lines.join("\n");
}

function formatSubmitOutputTail(stdout: string, stderr: string): string {
	const output = stripAnsi(`${stdout}\n${stderr}`).replace(/\r/g, "\n").trimEnd();
	if (!output) return "";

	const lines = output.split("\n");
	const tailLines = lines.slice(-SUCCESS_OUTPUT_TAIL_MAX_LINES);
	let tail = tailLines.join("\n");
	if (tail.length > SUCCESS_OUTPUT_TAIL_MAX_CHARS) {
		tail = `…${tail.slice(-SUCCESS_OUTPUT_TAIL_MAX_CHARS)}`;
	}
	if (lines.length > tailLines.length) {
		return `… ${lines.length - tailLines.length} earlier line(s) omitted\n${tail}`;
	}
	return tail;
}

function formatPreflightFailureOutput(output: SubmitCommandOutput): string {
	const reason = output.startupError
		? `gt submit --dry-run could not start: ${output.startupError}. Submission was not attempted.`
		: output.killed
			? `gt submit --dry-run timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `gt submit -nps --ai --dry-run failed with exit code ${output.exitCode}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ gt submit -nps --ai --dry-run",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackRequiredOutput(output: SubmitCommandOutput): string {
	return [
		"Graphite requires a restack before submission.",
		"Run `gt restack`, resolve any conflicts, then run `asdl-dev submit` again, or rerun with `--restack` to let asdl-dev run `gt restack --no-interactive`.",
		"Submission was not attempted.",
		"",
		"$ gt submit -nps --ai --dry-run",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackConfirmationPrompt(output: SubmitCommandOutput): SubmitRestackConfirmationPrompt {
	return {
		title: "Run gt restack before submit?",
		message: [
			"Graphite dry-run says restack is required before submission.",
			"Run `gt restack --no-interactive` now, then continue with submit?",
			"",
			"If confirmed, asdl-dev will run:",
			"$ gt restack --no-interactive",
			"$ gt submit -nps --ai",
			"",
			"If restack hits conflicts or fails, submission will stop before `gt submit`.",
			"",
			"$ gt submit -nps --ai --dry-run",
			"",
			formatOutputSection("stdout", output.stdout),
			formatOutputSection("stderr", output.stderr),
		]
			.filter(Boolean)
			.join("\n"),
	};
}

function formatRestackDeclinedOutput(output: SubmitCommandOutput): string {
	return [
		"Restack was not run. Submission was not attempted.",
		"Run `gt restack`, resolve any conflicts, then run `asdl-dev submit` again, or rerun with `--restack` to skip the prompt.",
		"",
		"$ gt submit -nps --ai --dry-run",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackConflictOutput(output: SubmitCommandOutput, conflictedFiles: string[]): string {
	const fileLines = conflictedFiles.length > 0 ? ["Conflicted files:", ...conflictedFiles.map((file) => `- ${file}`), ""] : [];

	return [
		"`gt restack` hit merge conflicts. Submission was not attempted.",
		"",
		...fileLines,
		"Resolve the conflicts, continue or abort the rebase as appropriate, then run `asdl-dev submit` again.",
		"",
		"$ gt restack --no-interactive",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackFailureOutput(output: SubmitCommandOutput): string {
	const reason = output.startupError
		? `gt restack could not start: ${output.startupError}. Submission was not attempted.`
		: output.killed
			? `gt restack timed out after ${RESTACK_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `gt restack --no-interactive failed with exit code ${output.exitCode}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ gt restack --no-interactive",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatSubmitFailureOutput(output: SubmitCommandOutput): string {
	const reason = output.startupError ?? (output.killed ? "gt submit timed out and was killed." : `gt submit -nps --ai failed with exit code ${output.exitCode}.`);
	return [
		reason,
		"",
		"$ gt submit -nps --ai",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatPostSubmitFailureOutput({
	submitted,
	currentPr,
}: {
	submitted: Extract<SubmitRunResult, { kind: "success" }>;
	currentPr: CurrentPrVerificationResult;
}): string {
	return [
		formatPostSubmitFailureReason(submitted.semanticFailureCause, currentPr),
		"",
		"$ gt submit -nps --ai",
		"",
		formatOutputSection("stdout", submitted.output.stdout),
		formatOutputSection("stderr", submitted.output.stderr),
		formatBufferedCommandSection("$ gt pr", currentPr.output, CURRENT_PR_TIMEOUT_MS),
		...(currentPr.kind === "no_current_pr" ? ["", ...formatNoCurrentPrRecoveryGuidance()] : []),
	]
		.filter(Boolean)
		.join("\n");
}

function formatPostSubmitFailureReason(
	semanticFailureCause: SubmitSemanticFailureCause | undefined,
	currentPr: CurrentPrVerificationResult,
): string {
	return [
		semanticFailureCause === undefined ? undefined : formatSubmitSemanticFailureCause(semanticFailureCause),
		formatCurrentPrVerificationFailureReason(currentPr),
	]
		.filter((line): line is string => Boolean(line))
		.join("\n");
}

function formatSubmitSemanticFailureCause(cause: SubmitSemanticFailureCause): string {
	switch (cause) {
		case "empty_branch_skipped":
			return "gt submit exited 0, but Graphite skipped submitting part of the stack because a branch is empty.";
	}
	return assertNever(cause);
}

function formatCurrentPrVerificationFailureReason(currentPr: CurrentPrVerificationResult): string | undefined {
	if (currentPr.kind === "present") return undefined;
	if (currentPr.kind === "no_current_pr") {
		return "gt submit exited 0, but the current branch still has no PR.";
	}
	const cause = currentPr.cause;
	switch (cause) {
		case "startup_error":
			return `gt submit exited 0, but current PR verification could not start: ${currentPr.output.startupError ?? "unknown startup error"}`;
		case "timeout":
			return `gt submit exited 0, but current PR verification timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s.`;
		case "command_failed":
			return `gt submit exited 0, but current PR verification failed with exit code ${currentPr.output.exitCode}.`;
	}
	return assertNever(cause);
}

function assertNever(value: never): never {
	throw new Error(`Unhandled value: ${String(value)}`);
}

function formatNoCurrentPrRecoveryGuidance(): string[] {
	return [
		"`asdl-dev submit` checkpoints outstanding worktree changes before submitting.",
		"If the branch still has no PR, inspect the Graphite output above and rerun `asdl-dev submit` after resolving the reported issue.",
	];
}

function formatBufferedCommandSection(commandDisplay: string, output: SubmitCommandOutput, timeoutMs: number): string {
	const status = output.startupError
		? `startup error: ${output.startupError}`
		: output.killed
			? `timed out after ${timeoutMs / 1000}s`
			: `exit code ${output.exitCode}`;
	return [
		`${commandDisplay} (${status})`,
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	].join("\n");
}

function formatOutputSection(name: "stdout" | "stderr", output: string): string {
	const body = output.length > 0 ? output.replace(/\r/g, "\n") : "(empty)\n";
	return `----- ${name} -----\n${body}${body.endsWith("\n") ? "" : "\n"}`;
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

function extractPrLinks(output: string): SubmitPrLink[] {
	const strippedOutput = stripAnsi(output);
	const links: SubmitPrLink[] = [];
	const seenUrls = new Set<string>();

	for (const match of strippedOutput.matchAll(/https?:\/\/[^\s<>"'\u0060]+/g)) {
		const rawUrl = match[0];
		const url = trimTerminalPunctuation(rawUrl);
		if (seenUrls.has(url)) continue;

		const link = toPrLink(url);
		if (!link) continue;

		seenUrls.add(url);
		links.push(link);
	}

	return links;
}

function toPrLink(url: string): SubmitPrLink | undefined {
	const prNumber = prNumberFromUrl(url);
	if (prNumber) return { label: `#${prNumber}`, url };
	if (isPotentialPrUrl(url)) return { label: url, url };
	return undefined;
}

function prNumberFromUrl(url: string): string | undefined {
	const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^\/\s?#]+\/[^\/\s?#]+\/(\d+)(?:[\/?#].*)?$/);
	if (graphiteMatch?.[1]) return graphiteMatch[1];

	const githubMatch = url.match(/^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\/(\d+)(?:[\/?#].*)?$/);
	return githubMatch?.[1];
}

function isPotentialPrUrl(url: string): boolean {
	return (
		/^https:\/\/app\.graphite\.com\/github\/pr\//.test(url) || /^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\//.test(url)
	);
}

function stripAnsi(text: string): string {
	return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "");
}

function trimTerminalPunctuation(url: string): string {
	let trimmed = url;
	while (/[),.;:!?}\]]$/.test(trimmed)) {
		trimmed = trimmed.slice(0, -1);
	}
	return trimmed;
}

function detectRestackNeeded(output: string): boolean {
	const strippedOutput = stripAnsi(output).replace(/\r/g, "\n");
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
	const strippedOutput = stripAnsi(output);
	return (
		conflictedFiles.length > 0 ||
		/CONFLICT \(/i.test(strippedOutput) ||
		/merge conflict/i.test(strippedOutput) ||
		/fix conflicts/i.test(strippedOutput) ||
		/resolve conflicts/i.test(strippedOutput)
	);
}

function parseConflictedFiles(output: string): string[] {
	return uniqueNonEmpty(stripAnsi(output).replace(/\r/g, "\n").split("\n"));
}

function parsePorcelainConflictedFiles(output: string): string[] {
	const conflictStatuses = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
	const files: string[] = [];

	for (const line of stripAnsi(output).replace(/\r/g, "\n").split("\n")) {
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
	const strippedOutput = stripAnsi(output).replace(/\r/g, "\n");
	const emptyBranchWarning = /This branch does not introduce any changes:/i.test(strippedOutput);
	const skippedSubmissionWarning =
		/will not be submitted/i.test(strippedOutput) || /GitHub does not allow empty PRs/i.test(strippedOutput);

	if (emptyBranchWarning && skippedSubmissionWarning) {
		return "empty_branch_skipped";
	}

	return undefined;
}
