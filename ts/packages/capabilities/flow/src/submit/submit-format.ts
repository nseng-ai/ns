import { stripTerminalEscapes } from "@ns/core/terminal-escapes";

import type { PrewrittenPrMetadata } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import {
	formatCurrentPrVerificationFailureCause,
	formatSubmitSemanticFailureCause,
	type SubmitCurrentPrVerificationFailure,
} from "./submit-failure-catalog.ts";
import { formatPrLinkText, formatPrLinkTextRow } from "./submit-pr-link.ts";
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

export function formatItemCount(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

export function formatSubmitSuccessText(
	prLinks: SubmitPrLink[],
	descriptions: {
		generated: readonly SubmitPrLink[];
		skipped: readonly SubmitPrLink[];
		prewritten: readonly SubmitPrLink[];
		prewriteFallbacks: readonly SubmitPrLink[];
		previews: readonly SubmitPrDescriptionPreview[];
	},
): string {
	const lines = [`Submitted ${formatItemCount(prLinks.length, "PR", "PRs")}:`];
	for (const link of prLinks) {
		lines.push(`✓ ${formatPrLinkText(link)}`);
		for (const status of formatSubmitSuccessStatuses(link, descriptions)) {
			lines.push(`  - ${status}`);
		}
	}
	if (descriptions.skipped.length > 0) {
		lines.push(
			"",
			"Skipped unchanged PR descriptions:",
			...descriptions.skipped.map(formatPrLinkTextRow),
		);
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

interface SubmitPrDescriptionPreview {
	link: SubmitPrLink;
	title: string;
	descriptionFirstLine: string;
}

function formatSubmitSuccessStatuses(
	link: SubmitPrLink,
	descriptions: {
		generated: readonly SubmitPrLink[];
		prewritten: readonly SubmitPrLink[];
		prewriteFallbacks: readonly SubmitPrLink[];
		previews: readonly SubmitPrDescriptionPreview[];
	},
): string[] {
	const statuses: string[] = [];
	if (hasMatchingLink(descriptions.prewritten, link)) {
		statuses.push("initial metadata prepared");
	}
	if (
		hasMatchingLink(descriptions.generated, link) ||
		hasMatchingLink(descriptions.prewriteFallbacks, link)
	) {
		statuses.push("description updated");
	}
	const preview = descriptions.previews.find((candidate) => candidate.link.url === link.url);
	if (preview !== undefined) {
		statuses.push(`new title: ${preview.title}`);
		if (preview.descriptionFirstLine !== "") {
			statuses.push(`new description: ${preview.descriptionFirstLine}`);
		}
	}
	return statuses;
}

function hasMatchingLink(links: readonly SubmitPrLink[], target: SubmitPrLink): boolean {
	return links.some((link) => link.url === target.url);
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
	const reason = output.startupError
		? `${submitDryRunCommandDisplay} could not start: ${output.startupError}. Submission was not attempted.`
		: output.killed
			? `${submitDryRunCommandDisplay} timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `${submitDryRunCommandDisplay} failed with exit code ${output.exitCode}. Submission was not attempted.`;

	return [
		reason,
		"",
		`$ ${submitDryRunCommandDisplay}`,
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
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
			formatOutputSection("stdout", output.stdout),
			formatOutputSection("stderr", output.stderr),
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
	const reason = output.startupError
		? `gt restack --downstack could not start: ${output.startupError}. Submission was not attempted.`
		: output.killed
			? `gt restack --downstack timed out after ${RESTACK_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `gt restack --downstack --no-interactive failed with exit code ${output.exitCode}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ gt restack --downstack --no-interactive",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatPrewriteFailureOutput(
	error: string,
	amendedBranches: readonly string[],
): string {
	return [
		error,
		...(amendedBranches.length === 0
			? []
			: [
					"",
					"Local PR metadata commit messages were amended before the failure:",
					...amendedBranches.map((branch) => `- ${branch}`),
				]),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatSubmitFailureOutput(
	output: SubmitCommandOutput,
	prewrittenMetadata: readonly PrewrittenPrMetadata[],
	submitCommandDisplay: string,
): string {
	const reason = output.startupError
		? `${submitCommandDisplay} could not start: ${output.startupError}.`
		: output.killed
			? `${submitCommandDisplay} timed out and was killed.`
			: `${submitCommandDisplay} failed with exit code ${output.exitCode}.`;
	return [
		reason,
		...(prewrittenMetadata.length === 0
			? []
			: [
					"Local PR metadata commit messages were prepared before submit; rerun ns flow submit after resolving the Graphite failure.",
				]),
		"",
		`$ ${submitCommandDisplay}`,
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
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
		formatOutputSection("stdout", submitted.output.stdout),
		formatOutputSection("stderr", submitted.output.stderr),
		formatBufferedCommandSection(
			"$ gt branch info --no-interactive",
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
		"If the branch still has no PR, inspect the Graphite output above and rerun `ns flow submit` after resolving the reported issue.",
	];
}

function formatBufferedCommandSection(
	commandDisplay: string,
	output: SubmitCommandOutput,
	timeoutMs: number,
): string {
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
