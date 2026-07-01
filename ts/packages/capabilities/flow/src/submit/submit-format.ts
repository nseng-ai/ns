import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import { formatItemCount, type PrewrittenPrMetadata } from "./index.ts";

import type { SubmitPrLink } from "./gt-output.ts";
import { formatPrLinkText, formatPrLinkTextRow } from "./submit-pr-link.ts";
import type {
	CurrentPrVerificationResult,
	RemoteSyncDiagnostics,
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
		"PR descriptions were not generated. Checkout a branch and run `sdl flow regenerate-pr` if needed.",
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

export function formatEmptyBranchFailureOutput(input: { branchName?: string }): string {
	return formatEmptyBranchFailure(input.branchName);
}

function formatEmptyBranchFailure(branchName: string | undefined): string {
	if (branchName === undefined) {
		return [
			"The submit stack contains an empty branch, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.",
			"",
			"If the empty branch has no remaining work, delete it (switch to its parent/downstack branch first if it is checked out), then rerun `sdl flow submit`.",
			"Otherwise, commit real changes to it, then rerun `sdl flow submit`.",
		].join("\n");
	}
	return [
		`Branch ${branchName} is empty, so Graphite will not submit it (GitHub rejects empty PRs). Nothing was submitted.`,
		"",
		`If ${branchName} has no remaining work, delete it, then rerun \`sdl flow submit\`:`,
		`    gt delete ${branchName} -f -q`,
		"(switch to its parent/downstack branch first if Graphite cannot delete the checked-out branch)",
		`Otherwise, commit real changes to ${branchName}, then rerun \`sdl flow submit\`.`,
	].join("\n");
}

export function formatTrunkOutOfDatePreflightOutput(
	_output: SubmitCommandOutput,
	_submitDryRunCommandDisplay: string,
): string {
	return [
		"Graphite could not update your local trunk before submitting. Nothing was submitted.",
		"",
		"Fix: update or repair your local trunk checkout (resolve any specific trunk problem Graphite reported), then rerun `sdl flow submit`.",
	].join("\n");
}

export function formatMergedPrNotInTrunkOutput(output: SubmitCommandOutput): string {
	const details = parseMergedPrNotInTrunkDetails(output);
	const affectedBranch = details.branch ?? "the affected branch";
	const trunkName = details.trunk ?? "trunk";
	const identityLine =
		details.branch === undefined
			? undefined
			: `Branch ${formatMergedPrBranchDetails(details)}${details.trunk === undefined ? "" : `; trunk ${details.trunk}`}.`;
	return [
		`A merged PR in this stack is not in ${details.trunk === undefined ? "the current trunk" : `trunk ${details.trunk}`}, so Graphite will not submit the stack. Nothing was submitted.`,
		identityLine,
		"",
		`Fix: ensure ${trunkName} contains the merged PR's commits, or reparent ${affectedBranch} onto a trunk that already contains them, then rerun \`sdl flow submit\`.`,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

export function formatRemoteUpdatedOutsideGraphitePreflightOutput(input: {
	branchName?: string;
	remoteSync?: RemoteSyncDiagnostics;
}): string {
	const subject = input.branchName === undefined ? "This branch" : `Branch ${input.branchName}`;
	return [
		`${subject} is out of sync with its upstream PR branch, so Graphite blocked the submit. Nothing was submitted.`,
		formatRemoteSyncDetails(input.remoteSync),
		"Fix:    run `gt sync` (or `gt get`), then rerun `sdl flow submit`.",
		"Bypass: `sdl flow submit --force` skips Graphite's remote-update check.",
	].join("\n");
}

function formatRemoteSyncDetails(remoteSync: RemoteSyncDiagnostics | undefined): string {
	if (remoteSync === undefined) return "";

	const lines = [
		`Remote checked: ${remoteSync.upstream} (this is the PR branch, not trunk/master).`,
		`Why: ${formatRemoteDivergence(remoteSync)}`,
		"Possible cause: the PR branch was pushed/submitted from another checkout, or this local branch was rewritten after an earlier submit.",
	];
	if (remoteSync.remoteOnlyCommits !== undefined && remoteSync.remoteOnlyCommits.length > 0) {
		lines.push(`Remote-only commits on ${remoteSync.upstream} (not in local HEAD):`);
		for (const commit of remoteSync.remoteOnlyCommits) {
			lines.push(`  - ${commit}`);
		}
		if (
			remoteSync.behindCount !== undefined &&
			remoteSync.behindCount > remoteSync.remoteOnlyCommits.length
		) {
			lines.push(
				`  - … ${formatItemCount(remoteSync.behindCount - remoteSync.remoteOnlyCommits.length, "more commit", "more commits")}`,
			);
		}
	}
	return `${lines.join("\n")}\n`;
}

function formatRemoteDivergence(remoteSync: RemoteSyncDiagnostics): string {
	if (remoteSync.aheadCount === undefined || remoteSync.behindCount === undefined) {
		return `remote branch ${remoteSync.upstream} changed outside Graphite; local ahead/behind counts could not be computed.`;
	}
	if (remoteSync.aheadCount === 0 && remoteSync.behindCount === 0) {
		return `git reports local HEAD and ${remoteSync.upstream} are not divergent; Graphite metadata may be stale.`;
	}
	if (remoteSync.aheadCount === 0) {
		return `local HEAD is ${formatItemCount(remoteSync.behindCount, "commit", "commits")} behind ${remoteSync.upstream}.`;
	}
	if (remoteSync.behindCount === 0) {
		return `local HEAD is ${formatItemCount(remoteSync.aheadCount, "commit", "commits")} ahead of ${remoteSync.upstream}; Graphite metadata may be stale.`;
	}
	return `local HEAD is ${formatItemCount(remoteSync.aheadCount, "commit", "commits")} ahead of and ${formatItemCount(remoteSync.behindCount, "commit", "commits")} behind ${remoteSync.upstream}.`;
}

interface MergedPrNotInTrunkDetails {
	branch?: string;
	prNumber?: string;
	prState?: string;
	trunk?: string;
}

function parseMergedPrNotInTrunkDetails(output: SubmitCommandOutput): MergedPrNotInTrunkDetails {
	const text = stripTerminalEscapes(`${output.stdout}\n${output.stderr}`).replace(/\r/g, "\n");
	const branchMatch = text.match(
		/^\s*▸\s*(?<branch>\S+)(?:\s+-\s+PR\s+#(?<prNumber>\d+)\s+\((?<prState>[^)]+)\))?/mu,
	);
	const trunkMatch = text.match(/latest trunk branch (?<trunk>[^\s.]+)\./iu);
	return {
		...(branchMatch?.groups?.branch === undefined ? {} : { branch: branchMatch.groups.branch }),
		...(branchMatch?.groups?.prNumber === undefined
			? {}
			: { prNumber: branchMatch.groups.prNumber }),
		...(branchMatch?.groups?.prState === undefined ? {} : { prState: branchMatch.groups.prState }),
		...(trunkMatch?.groups?.trunk === undefined ? {} : { trunk: trunkMatch.groups.trunk }),
	};
}

function formatMergedPrBranchDetails(details: MergedPrNotInTrunkDetails): string {
	const prSuffix =
		details.prNumber === undefined
			? ""
			: ` (PR #${details.prNumber}${formatPrState(details.prState)})`;
	return `${details.branch ?? "unknown"}${prSuffix}`;
}

function formatPrState(prState: string | undefined): string {
	return prState === undefined || prState.trim() === "" ? "" : `, ${prState.trim()}`;
}

export function formatRestackRequiredOutput(
	_output: SubmitCommandOutput,
	_submitDryRunCommandDisplay: string,
): string {
	return [
		"Graphite needs a restack before submitting, but automatic restack was disabled or unavailable. Nothing was submitted.",
		"",
		"Fix: run `gt restack --downstack`, resolve any conflicts, then rerun `sdl flow submit`.",
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
			"If confirmed, sdl flow submit will run:",
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

export function formatRestackDeclinedOutput(
	_output: SubmitCommandOutput,
	_submitDryRunCommandDisplay: string,
): string {
	return [
		"Restack was declined, so nothing was submitted.",
		"",
		"Fix: run `gt restack --downstack`, resolve any conflicts, then rerun `sdl flow submit`.",
	].join("\n");
}

export function formatRestackConflictOutput(
	_output: SubmitCommandOutput,
	conflictedFiles: string[],
): string {
	const fileLines =
		conflictedFiles.length > 0
			? ["", "Conflicted files:", ...conflictedFiles.map((file) => `- ${file}`)]
			: [];

	return [
		"`gt restack --downstack` hit merge conflicts, so nothing was submitted.",
		...fileLines,
		"",
		"Fix: resolve the conflicts, continue or abort the rebase, then rerun `sdl flow submit`.",
	].join("\n");
}

export function formatReadinessRecheckFailureOutput(
	_output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return [
		"Graphite still needs a restack after `sdl flow submit` already ran `gt restack --downstack --no-interactive`. Nothing was submitted.",
		"",
		`Fix: run \`gt restack --downstack\` manually, resolve any conflicts or skipped/stale branches Graphite reports, verify with \`${submitDryRunCommandDisplay}\`, then rerun \`sdl flow submit\`.`,
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
					"Local PR metadata commit messages were prepared before submit; rerun sdl flow submit after resolving the Graphite failure.",
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

function formatSubmitSemanticFailureCause(cause: SubmitSemanticFailureCause): string {
	switch (cause.kind) {
		case "empty_branch_skipped":
			return cause.branchName === undefined
				? "gt submit exited 0, but Graphite skipped submitting part of the submit scope because a branch is empty."
				: `gt submit exited 0, but Graphite skipped submitting part of the submit scope because branch ${cause.branchName} is empty.`;
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
		"`sdl flow submit` checkpoints outstanding worktree changes before submitting.",
		"If the branch still has no PR, inspect the Graphite output above and rerun `sdl flow submit` after resolving the reported issue.",
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
