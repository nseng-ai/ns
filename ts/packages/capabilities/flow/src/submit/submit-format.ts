import {
	formatCommandFailure,
	formatOutputSection,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

import type { SubmitPrLink } from "./gt-output.ts";
import type { SubmitPrDescriptionSummary } from "./submit-pr-description-summary.ts";
import {
	formatCurrentPrVerificationFailureCause,
	formatSubmitSemanticFailureCause,
	type SubmitCurrentPrVerificationFailure,
} from "./submit-failure-catalog.ts";
import { formatPrLinkText } from "./submit-pr-link.ts";
import type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitRestackConfirmationPrompt,
	SubmitRunResult,
	SubmitSemanticFailureCause,
} from "./submit.ts";

const CURRENT_PR_TIMEOUT_MS = 60_000;
const RESTACK_TIMEOUT_MS = 600_000;
const SUCCESS_OUTPUT_TAIL_MAX_LINES = 20;
const SUCCESS_OUTPUT_TAIL_MAX_CHARS = 2_000;
const SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS = { maxChars: 4_000, maxLines: 80 };

export function formatItemCount(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

export function formatBatchPosition(options: {
	noun: string;
	index: number;
	total: number;
}): string {
	return `${options.noun} ${options.index + 1}/${options.total}`;
}

export function formatSubmitSuccessText(
	prLinks: SubmitPrLink[],
	descriptions: SubmitPrDescriptionSummary,
): string {
	const lines = [`Submitted ${formatItemCount(prLinks.length, "PR", "PRs")}:`];
	for (const link of prLinks) {
		lines.push(`✓ ${formatPrLinkText(link)}`);
		for (const status of formatSubmitSuccessStatuses(link, descriptions)) {
			lines.push(`  - ${status}`);
		}
	}
	return lines.join("\n");
}

export function formatSubmitSuccessFallbackText(stdout: string, stderr: string): string {
	const lines = [
		"Submit succeeded, but no PR URLs were detected in output.",
		"PR descriptions were not generated. Checkout a branch and run `ns flow regenerate-pr` if needed.",
	];
	const outputTail = formatSubmitOutputTail(stdout, stderr);
	if (outputTail) {
		lines.push("", "Recent output:", outputTail);
	}
	return lines.join("\n");
}

function formatSubmitSuccessStatuses(
	link: SubmitPrLink,
	descriptions: SubmitPrDescriptionSummary,
): string[] {
	const statuses: string[] = [];
	if (hasMatchingLink(descriptions.applied, link)) {
		statuses.push("complete title and body replaced");
	}
	const preview = findMatchingLink(descriptions.previews, link, (candidate) => candidate.link);
	if (preview !== undefined) {
		statuses.push(`new title: ${preview.title}`);
		if (preview.descriptionFirstLine !== undefined) {
			statuses.push(`new description: ${preview.descriptionFirstLine}`);
		}
	}
	return statuses;
}

function hasMatchingLink(links: readonly SubmitPrLink[], target: SubmitPrLink): boolean {
	return findMatchingLink(links, target, (link) => link) !== undefined;
}

function findMatchingLink<T>(
	items: readonly T[],
	target: SubmitPrLink,
	linkForItem: (item: T) => SubmitPrLink,
): T | undefined {
	return items.find((item) => linkForItem(item).url === target.url);
}

function formatSubmitOutputTail(stdout: string, stderr: string): string {
	const output = stripTerminalEscapes(`${stdout}\n${stderr}`).replace(/\r/g, "\n").trimEnd();
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

export function formatPreflightFailureOutput(
	output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return formatCommandFailureText({
		commandDisplay: submitDryRunCommandDisplay,
		output,
		reason: {
			spawnFailed: (error) =>
				`${submitDryRunCommandDisplay} could not start: ${error}. Submission was not attempted.`,
			timedOut: `${submitDryRunCommandDisplay} timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s. Submission was not attempted.`,
			exit: (exitCode) =>
				`${submitDryRunCommandDisplay} failed with exit code ${exitCode}. Submission was not attempted.`,
		},
	});
}

export function formatRestackRequiredOutput(): string {
	return [
		"Graphite needs a restack before submitting, but automatic restack was disabled or unavailable. Nothing was submitted.",
		"",
		"Fix: run `gt restack --downstack`, resolve any conflicts, then rerun `ns flow submit`.",
	].join("\n");
}

export function formatRestackConfirmationPrompt(
	output: SubmitCommandOutput,
	commands: { submitCommandDisplay: string; submitDryRunCommandDisplay: string },
): SubmitRestackConfirmationPrompt {
	return {
		title: "Run gt restack before submit?",
		message: [
			"Graphite dry-run says restack is required before submission.",
			"Run `gt restack --downstack --no-interactive` now, then continue with submit?",
			"",
			"If confirmed, ns flow submit will run:",
			"$ gt restack --downstack --no-interactive",
			`$ ${commands.submitCommandDisplay}`,
			"",
			"If restack hits conflicts or fails, submission will stop before `gt submit`.",
			"",
			`$ ${commands.submitDryRunCommandDisplay}`,
			"",
			formatOutputSection("stdout", output.stdout, SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS),
			formatOutputSection("stderr", output.stderr, SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS),
		]
			.filter(Boolean)
			.join("\n"),
	};
}

export function formatRestackDeclinedOutput(): string {
	return [
		"Restack was declined, so nothing was submitted.",
		"",
		"Fix: run `gt restack --downstack`, resolve any conflicts, then rerun `ns flow submit`.",
	].join("\n");
}

export function formatRestackConflictOutput(conflictedFiles: string[]): string {
	const fileLines =
		conflictedFiles.length > 0
			? ["", "Conflicted files:", ...conflictedFiles.map((file) => `- ${file}`)]
			: [];

	return [
		"`gt restack --downstack` hit merge conflicts, so nothing was submitted.",
		...fileLines,
		"",
		"Fix: resolve the conflicts, continue or abort the rebase, then rerun `ns flow submit`.",
	].join("\n");
}

export function formatReadinessRecheckFailureOutput(submitDryRunCommandDisplay: string): string {
	return [
		"Graphite still needs a restack after `ns flow submit` already ran `gt restack --downstack --no-interactive`. Nothing was submitted.",
		"",
		`Fix: run \`gt restack --downstack\` manually, resolve any conflicts or skipped/stale branches Graphite reports, verify with \`${submitDryRunCommandDisplay}\`, then rerun \`ns flow submit\`.`,
	].join("\n");
}

export function formatRestackFailureOutput(output: SubmitCommandOutput): string {
	return formatCommandFailureText({
		commandDisplay: "gt restack --downstack --no-interactive",
		output,
		reason: {
			spawnFailed: (error) =>
				`gt restack --downstack could not start: ${error}. Submission was not attempted.`,
			timedOut: `gt restack --downstack timed out after ${RESTACK_TIMEOUT_MS / 1000}s. Submission was not attempted.`,
			exit: (exitCode) =>
				`gt restack --downstack --no-interactive failed with exit code ${exitCode}. Submission was not attempted.`,
		},
	});
}

export function formatSubmitFailureOutput(
	output: SubmitCommandOutput,
	submitCommandDisplay: string,
): string {
	return formatCommandFailureText({
		commandDisplay: submitCommandDisplay,
		output,
		reason: {
			spawnFailed: (error) => `${submitCommandDisplay} could not start: ${error}.`,
			timedOut: `${submitCommandDisplay} timed out and was terminated.`,
			exit: (exitCode) => `${submitCommandDisplay} failed with exit code ${exitCode}.`,
		},
	});
}

export function formatPostSubmitFailureOutput({
	submitted,
	currentPr,
	submitCommandDisplay,
}: {
	submitted: Extract<SubmitRunResult, { kind: "success" }>;
	currentPr: CurrentPrVerificationResult;
	submitCommandDisplay: string;
}): string {
	return [
		formatPostSubmitFailureReason(submitted.semanticFailureCause, currentPr),
		"",
		`$ ${submitCommandDisplay}`,
		"",
		formatOutputSection("stdout", submitted.output.stdout, SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS),
		formatOutputSection("stderr", submitted.output.stderr, SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS),
		formatBufferedCommandSection(
			"$ gh pr view --json number,url",
			currentPr.output,
			CURRENT_PR_TIMEOUT_MS,
		),
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
		semanticFailureCause === undefined
			? undefined
			: formatSubmitSemanticFailureCause(semanticFailureCause),
		formatCurrentPrVerificationFailureReason(currentPr),
	]
		.filter((line): line is string => Boolean(line))
		.join("\n");
}

function formatCurrentPrVerificationFailureReason(
	currentPr: CurrentPrVerificationResult,
): string | undefined {
	const failure = currentPrVerificationFailure(currentPr);
	return failure === undefined ? undefined : formatCurrentPrVerificationFailureCause(failure);
}

function currentPrVerificationFailure(
	currentPr: CurrentPrVerificationResult,
): SubmitCurrentPrVerificationFailure | undefined {
	if (currentPr.kind === "present") return undefined;
	if (currentPr.kind === "no_current_pr") {
		return { kind: "no_current_pr", output: currentPr.output };
	}
	return { kind: currentPr.cause, output: currentPr.output };
}

function formatNoCurrentPrRecoveryGuidance(): string[] {
	return [
		"`ns flow submit` checkpoints outstanding worktree changes before submitting.",
		"If the branch still has no PR, inspect the submit and GitHub verification output above, then rerun `ns flow submit` after resolving the reported issue.",
	];
}

type SubmitCommandOutcome =
	| { type: "spawn-failed"; error: string }
	| { type: "cancelled" }
	| { type: "timed-out" }
	| { type: "signalled"; signal: string; exitCode: number | null }
	| { type: "exit"; exitCode: number | null };

interface CommandFailureReasonFormatters {
	spawnFailed: (error: string) => string;
	timedOut: string;
	exit: (exitCode: number) => string;
}

function classifySubmitCommandOutcome(output: SubmitCommandOutput): SubmitCommandOutcome {
	switch (output.type) {
		case "spawn-failed":
			return { type: "spawn-failed", error: output.error };
		case "cancelled":
			return { type: "cancelled" };
		case "timed-out":
			return { type: "timed-out" };
		case "exited":
			return output.signal === null
				? { type: "exit", exitCode: output.code }
				: { type: "signalled", signal: output.signal, exitCode: output.code };
	}
}

function formatCommandFailureText({
	commandDisplay,
	output,
	reason,
	detailLines = [],
}: {
	commandDisplay: string;
	output: SubmitCommandOutput;
	reason: CommandFailureReasonFormatters;
	detailLines?: readonly string[];
}): string {
	const outcome = classifySubmitCommandOutcome(output);
	const title = [formatSubmitCommandOutcome(outcome, reason), ...detailLines].join("\n");
	return formatCommandFailure(title, commandDisplay, submitCommandOutputToExecResult(output));
}

function submitCommandOutputToExecResult(output: SubmitCommandOutput): ExecResult {
	return output;
}

function formatBufferedCommandSection(
	commandDisplay: string,
	output: SubmitCommandOutput,
	timeoutMs: number,
): string {
	const status = formatBufferedSubmitCommandOutcome(
		classifySubmitCommandOutcome(output),
		timeoutMs,
	);
	return [
		`${commandDisplay} (${status})`,
		"",
		formatOutputSection("stdout", output.stdout, SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS),
		formatOutputSection("stderr", output.stderr, SUBMIT_COMMAND_OUTPUT_SECTION_OPTIONS),
	].join("\n");
}

function formatSubmitCommandOutcome(
	outcome: SubmitCommandOutcome,
	reason: CommandFailureReasonFormatters,
): string {
	switch (outcome.type) {
		case "spawn-failed":
			return reason.spawnFailed(outcome.error);
		case "cancelled":
			return "cancelled";
		case "timed-out":
			return reason.timedOut;
		case "signalled":
			return `terminated by ${outcome.signal}${outcome.exitCode === null ? "" : ` (exit code ${outcome.exitCode})`}`;
		case "exit":
			return reason.exit(outcome.exitCode ?? 1);
	}
}

function formatBufferedSubmitCommandOutcome(
	outcome: SubmitCommandOutcome,
	timeoutMs: number,
): string {
	return formatSubmitCommandOutcome(outcome, {
		spawnFailed: (error) => `spawn error: ${error}`,
		timedOut: `timed out after ${timeoutMs / 1000}s`,
		exit: (exitCode) => `exit code ${exitCode}`,
	});
}
