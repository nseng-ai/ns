import { stripTerminalEscapes } from "../exec.ts";

import type { SubmitPrLink } from "./gt-output.ts";
import { formatPrLinkText, formatPrLinkTextRow } from "./submit-pr-link.ts";
import type { PreparedSubmitPrMetadata } from "./submit-pr-metadata-prewrite.ts";
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

export function formatSubmitSuccessText(
	prLinks: SubmitPrLink[],
	descriptions: {
		generated: readonly SubmitPrLink[];
		skipped: readonly SubmitPrLink[];
		prewritten: readonly SubmitPrLink[];
		prewriteFallbacks: readonly SubmitPrLink[];
	},
): string {
	const lines = [`Submitted ${prLinks.length} ${prLinks.length === 1 ? "PR" : "PRs"}:`];
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
		"PR descriptions were not generated. Checkout a branch and run `sdl regenerate-pr` if needed.",
	];
	const outputTail = formatSubmitOutputTail(stdout, stderr);
	if (outputTail) {
		lines.push("", "Recent output:", outputTail);
	}
	return lines.join("\n");
}

function formatSubmitSuccessStatuses(
	link: SubmitPrLink,
	descriptions: {
		generated: readonly SubmitPrLink[];
		prewritten: readonly SubmitPrLink[];
		prewriteFallbacks: readonly SubmitPrLink[];
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

export function formatPreflightFailureOutput(output: SubmitCommandOutput): string {
	const reason = output.startupError
		? `gt submit -nps --no-ai --no-interactive --dry-run could not start: ${output.startupError}. Submission was not attempted.`
		: output.killed
			? `gt submit -nps --no-ai --no-interactive --dry-run timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `gt submit -nps --no-ai --no-interactive --dry-run failed with exit code ${output.exitCode}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ gt submit -nps --no-ai --no-interactive --dry-run",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatTrunkOutOfDatePreflightOutput(_output: SubmitCommandOutput): string {
	return [
		"Graphite could not update the trunk branch before submit.",
		"Submission was not attempted.",
		"",
		"What to do next:",
		"- Update or repair your local Graphite trunk checkout, then rerun `sdl submit`.",
		"- If Graphite reports a specific trunk-update problem, resolve that first.",
		"- To inspect the raw Graphite dry-run output, rerun with `sdl submit --verbose` or run `gt submit -nps --no-ai --no-interactive --dry-run` manually.",
	].join("\n");
}

export function formatRestackRequiredOutput(output: SubmitCommandOutput): string {
	return [
		"Graphite requires a restack before submission.",
		"Run `gt restack`, resolve any conflicts, then run `sdl submit` again, or rerun with `--restack` to let sdl submit run `gt restack --no-interactive`.",
		"Submission was not attempted.",
		"",
		"$ gt submit -nps --no-ai --no-interactive --dry-run",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatRestackConfirmationPrompt(
	output: SubmitCommandOutput,
): SubmitRestackConfirmationPrompt {
	return {
		title: "Run gt restack before submit?",
		message: [
			"Graphite dry-run says restack is required before submission.",
			"Run `gt restack --no-interactive` now, then continue with submit?",
			"",
			"If confirmed, sdl submit will run:",
			"$ gt restack --no-interactive",
			"$ gt submit -nps --no-ai --no-interactive",
			"",
			"If restack hits conflicts or fails, submission will stop before `gt submit`.",
			"",
			"$ gt submit -nps --no-ai --no-interactive --dry-run",
			"",
			formatOutputSection("stdout", output.stdout),
			formatOutputSection("stderr", output.stderr),
		]
			.filter(Boolean)
			.join("\n"),
	};
}

export function formatRestackDeclinedOutput(output: SubmitCommandOutput): string {
	return [
		"Restack was not run. Submission was not attempted.",
		"Run `gt restack`, resolve any conflicts, then run `sdl submit` again, or rerun with `--restack` to skip the prompt.",
		"",
		"$ gt submit -nps --no-ai --no-interactive --dry-run",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatRestackConflictOutput(
	output: SubmitCommandOutput,
	conflictedFiles: string[],
): string {
	const fileLines =
		conflictedFiles.length > 0
			? ["Conflicted files:", ...conflictedFiles.map((file) => `- ${file}`), ""]
			: [];

	return [
		"`gt restack` hit merge conflicts. Submission was not attempted.",
		"",
		...fileLines,
		"Resolve the conflicts, continue or abort the rebase as appropriate, then run `sdl submit` again.",
		"",
		"$ gt restack --no-interactive",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatReadinessRecheckFailureOutput(output: SubmitCommandOutput): string {
	return [
		[
			"Graphite still requires restack after `sdl submit` already ran `gt restack --no-interactive`.",
			"Submission was not attempted. PR metadata was not prepared.",
		].join("\n"),
		formatIndentedOutputBlock("Graphite dry-run error:", output.stderr),
		[
			"Next steps:",
			"- Run `gt restack` manually and resolve any conflicts, skipped branches, or stale stack state Graphite reports.",
			"- Verify readiness: `gt submit -nps --no-ai --no-interactive --dry-run`",
			"- Then rerun: `sdl submit`",
		].join("\n"),
		formatIndentedOutputBlock("Additional dry-run stdout:", output.stdout),
	]
		.filter((section): section is string => section !== undefined && section !== "")
		.join("\n\n");
}

export function formatRestackFailureOutput(output: SubmitCommandOutput): string {
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
	prewrittenMetadata: readonly PreparedSubmitPrMetadata[],
): string {
	const reason = output.startupError
		? `gt submit -nps --no-ai --no-interactive could not start: ${output.startupError}.`
		: output.killed
			? "gt submit -nps --no-ai --no-interactive timed out and was killed."
			: `gt submit -nps --no-ai --no-interactive failed with exit code ${output.exitCode}.`;
	return [
		reason,
		...(prewrittenMetadata.length === 0
			? []
			: [
					"Local PR metadata commit messages were prepared before submit; rerun sdl submit after resolving the Graphite failure.",
				]),
		"",
		"$ gt submit -nps --no-ai --no-interactive",
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
}: {
	submitted: Extract<SubmitRunResult, { kind: "success" }>;
	currentPr: CurrentPrVerificationResult;
}): string {
	return [
		formatPostSubmitFailureReason(submitted.semanticFailureCause, currentPr),
		"",
		"$ gt submit -nps --no-ai --no-interactive",
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

function formatSubmitSemanticFailureCause(cause: SubmitSemanticFailureCause): string {
	switch (cause.kind) {
		case "empty_branch_skipped":
			return cause.branchName === undefined
				? "gt submit exited 0, but Graphite skipped submitting part of the stack because a branch is empty."
				: `gt submit exited 0, but Graphite skipped submitting part of the stack because branch ${cause.branchName} is empty.`;
	}
	return assertNever(cause.kind);
}

function formatCurrentPrVerificationFailureReason(
	currentPr: CurrentPrVerificationResult,
): string | undefined {
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
		"`sdl submit` checkpoints outstanding worktree changes before submitting.",
		"If the branch still has no PR, inspect the Graphite output above and rerun `sdl submit` after resolving the reported issue.",
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

function formatIndentedOutputBlock(title: string, output: string): string | undefined {
	const lines = normalizedOutputLines(output);
	if (lines.length === 0) return undefined;
	return [title, ...lines.map((line) => `  ${line}`)].join("\n");
}

function normalizedOutputLines(output: string): string[] {
	return stripTerminalEscapes(output)
		.replace(/\r/g, "\n")
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim() !== "");
}

function formatOutputSection(name: "stdout" | "stderr", output: string): string {
	const body = output.length > 0 ? output.replace(/\r/g, "\n") : "(empty)\n";
	return `----- ${name} -----\n${body}${body.endsWith("\n") ? "" : "\n"}`;
}
