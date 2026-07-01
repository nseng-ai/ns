import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import type { PrewrittenPrMetadata } from "./index.ts";

import type { SubmitPrLink } from "./gt-output.ts";
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

export function formatEmptyBranchPreflightOutput(input: {
	output: SubmitCommandOutput;
	submitDryRunCommandDisplay: string;
	branchName?: string;
}): string {
	const branchGuidance = emptyBranchGuidance(input.branchName);
	return formatPreflightGuidanceOutput({
		headingLines: [
			"Submit stack contains an empty branch; Graphite will not submit it.",
			branchGuidance.branchHeadingLine,
		],
		attemptLine:
			"Submission was not attempted because Graphite would skip the empty branch and can then report all PRs up to date.",
		whatSucceededLines: [preflightRanBeforeMutationLine(input.submitDryRunCommandDisplay)],
		actionSections: [
			{
				title: "Recommended remediation:",
				lines: [
					`- If ${branchGuidance.branch} has no remaining work, delete it before rerunning \`sdl flow submit\`.`,
					...branchGuidance.deleteCommandLines,
					"- If Graphite cannot delete the checked-out branch, switch to its parent/downstack branch first, then delete it.",
				],
			},
			{
				title: "Alternative:",
				lines: [
					`- If ${branchGuidance.branch} should still have its own PR, commit real changes to it, then rerun \`sdl flow submit\`.`,
				],
			},
		],
		detailLines: [branchGuidance.detailLine],
		command: {
			display: input.submitDryRunCommandDisplay,
			output: input.output,
		},
	});
}

function emptyBranchGuidance(branchName: string | undefined): {
	branch: string;
	branchHeadingLine: string | undefined;
	deleteCommandLines: readonly string[];
	detailLine: string;
} {
	if (branchName === undefined) {
		return {
			branch: "the empty branch",
			branchHeadingLine: undefined,
			deleteCommandLines: [],
			detailLine:
				"- Graphite reports this branch does not introduce any changes, and GitHub does not allow empty PRs.",
		};
	}
	return {
		branch: branchName,
		branchHeadingLine: `Branch: ${branchName}`,
		deleteCommandLines: [`- Delete the empty branch: \`gt delete ${branchName} -f -q\`.`],
		detailLine: `- Graphite skipped submission because branch ${branchName} is empty; it does not introduce any changes, and GitHub does not allow empty PRs.`,
	};
}

export function formatEmptyBranchSubmitPreflightOutput(input: {
	output: SubmitCommandOutput;
	submitCommandDisplay: string;
	branchName?: string;
}): string {
	const branchGuidance = emptyBranchGuidance(input.branchName);
	return formatPreflightGuidanceOutput({
		headingLines: [
			"Submit stack contains an empty branch; Graphite will not submit it.",
			branchGuidance.branchHeadingLine,
		],
		attemptLine:
			"Graphite aborted the final submit preflight because it would skip the empty branch and can then report all PRs up to date.",
		whatSucceededLines: [
			`- ${input.submitCommandDisplay} reached Graphite validation before submitting PRs.`,
		],
		actionSections: [
			{
				title: "Recommended remediation:",
				lines: [
					`- If ${branchGuidance.branch} has no remaining work, delete it before rerunning \`sdl flow submit\`.`,
					...branchGuidance.deleteCommandLines,
					"- If Graphite cannot delete the checked-out branch, switch to its parent/downstack branch first, then delete it.",
				],
			},
			{
				title: "Alternative:",
				lines: [
					`- If ${branchGuidance.branch} should still have its own PR, commit real changes to it, then rerun \`sdl flow submit\`.`,
				],
			},
		],
		detailLines: [branchGuidance.detailLine],
		command: {
			display: input.submitCommandDisplay,
			output: input.output,
		},
	});
}

export function formatTrunkOutOfDatePreflightOutput(
	_output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return formatPreflightGuidanceOutput({
		headingLines: ["Graphite could not update trunk before submit."],
		attemptLine: "Submission was not attempted.",
		whatSucceededLines: [preflightRanBeforeMutationLine(submitDryRunCommandDisplay)],
		actionSections: [
			{
				title: "What to do next:",
				lines: [
					"- Update or repair your local Graphite trunk checkout, then rerun `sdl flow submit`.",
					"- If Graphite reports a specific trunk-update problem, resolve that first.",
				],
			},
		],
		detailLines: [
			`- To inspect the raw Graphite dry-run output, rerun with \`sdl flow submit --verbose\` or run \`${submitDryRunCommandDisplay}\` manually.`,
		],
	});
}

export function formatMergedPrNotInTrunkPreflightOutput(
	output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return formatMergedPrNotInTrunkOutput({
		output,
		submitDryRunCommandDisplay,
		attemptLine: "Submission was not attempted.",
		detailsLine:
			"- Graphite will not submit a stack containing this branch until trunk contains the merged PR's commits.",
	});
}

export function formatRemoteUpdatedOutsideGraphitePreflightOutput(input: {
	output: SubmitCommandOutput;
	submitDryRunCommandDisplay: string;
	branchName?: string;
}): string {
	const branch = input.branchName ?? "this branch";
	return formatPreflightGuidanceOutput({
		headingLines: [
			"Graphite sees a remote branch update that local Graphite metadata has not synced yet.",
			input.branchName === undefined ? undefined : `Branch: ${input.branchName}`,
		],
		attemptLine: "Submission was not attempted.",
		whatSucceededLines: [preflightRanBeforeMutationLine(input.submitDryRunCommandDisplay)],
		actionSections: [
			{
				title: "Recommended remediation:",
				lines: [
					"- Run `gt get` or `gt sync` to bring Graphite's local state back in sync with the remote branch, then rerun `sdl flow submit`.",
				],
			},
			{
				title: "Why this can happen:",
				lines: [
					`- Graphite is not saying ${branch} changed by itself; it is saying the remote branch differs from the local Graphite-tracked state.`,
					"- Common causes are a direct `git push`/`git push --force-with-lease`, another checkout or agent pushing the branch, or GitHub updating the PR branch outside `gt submit`.",
				],
			},
			{
				title: "Override:",
				lines: [
					"- Use `sdl flow submit --force` only if you intentionally want Graphite to ignore this remote-update safety check.",
				],
			},
		],
		detailLines: [
			"- Graphite reported: branch has been updated remotely outside of Graphite.",
			"- `sdl flow submit` stopped during dry-run preflight before metadata preparation or submit mutation.",
		],
		command: {
			display: input.submitDryRunCommandDisplay,
			output: input.output,
		},
	});
}

export function formatMergedPrNotInTrunkSubmitOutput(
	output: SubmitCommandOutput,
	submitCommandDisplay: string,
	submitDryRunCommandDisplay: string,
): string {
	return formatMergedPrNotInTrunkOutput({
		output,
		submitDryRunCommandDisplay,
		attemptLine: "Graphite aborted the final submit preflight before submitting PRs.",
		detailsLine: `- The earlier dry-run passed, but ${submitCommandDisplay} re-ran Graphite validation and found the merged-PR/trunk mismatch before submission.`,
	});
}

function formatMergedPrNotInTrunkOutput(input: {
	output: SubmitCommandOutput;
	submitDryRunCommandDisplay: string;
	attemptLine: string;
	detailsLine: string;
}): string {
	const details = parseMergedPrNotInTrunkDetails(input.output);
	const affectedBranch = details.branch ?? "the affected branch";
	return formatPreflightGuidanceOutput({
		headingLines: [
			"Graphite found a merged PR in the submit stack whose commits are not in the current trunk branch.",
			details.branch === undefined ? undefined : `Branch: ${formatMergedPrBranchDetails(details)}`,
			details.trunk === undefined ? undefined : `Trunk: ${details.trunk}`,
		],
		attemptLine: input.attemptLine,
		whatSucceededLines: [
			`- ${input.submitDryRunCommandDisplay} started and validated the stack in dry-run mode.`,
		],
		actionSections: [
			{
				title: "Next step:",
				lines: [
					details.trunk === undefined
						? `- Ensure the trunk branch contains the merged PR's commits, or move/reparent ${affectedBranch} onto a trunk that already contains them.`
						: `- Ensure ${details.trunk} contains the merged PR's commits, or move/reparent ${affectedBranch} onto a trunk that already contains them.`,
					"- Then rerun `sdl flow submit`.",
				],
			},
		],
		detailLines: [input.detailsLine],
	});
}

interface PreflightGuidanceSection {
	title: string;
	lines: readonly string[];
}

function preflightRanBeforeMutationLine(submitDryRunCommandDisplay: string): string {
	return `- ${submitDryRunCommandDisplay} ran before PR metadata preparation or submit mutation.`;
}

function formatPreflightGuidanceOutput(input: {
	headingLines: readonly (string | undefined)[];
	attemptLine: string;
	whatSucceededLines: readonly string[];
	actionSections: readonly PreflightGuidanceSection[];
	detailLines: readonly string[];
	command?: {
		display: string;
		output: SubmitCommandOutput;
	};
}): string {
	const lines: string[] = [];
	for (const line of input.headingLines) {
		if (line !== undefined) lines.push(line);
	}
	lines.push(input.attemptLine, "", "What succeeded:", ...input.whatSucceededLines);
	for (const section of input.actionSections) {
		lines.push("", section.title, ...section.lines);
	}
	lines.push("", "Details:", ...input.detailLines);
	if (input.command !== undefined) {
		lines.push(
			"",
			`$ ${input.command.display}`,
			"",
			formatOutputSection("stdout", input.command.output.stdout),
			formatOutputSection("stderr", input.command.output.stderr),
		);
	}
	return lines.join("\n");
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
	output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return [
		"Graphite requires a restack before submission.",
		"Plain `sdl flow submit` normally runs `gt restack --downstack --no-interactive` automatically when required; this output means automatic restack was disabled or unavailable.",
		"Run `gt restack --downstack`, resolve any conflicts, then run `sdl flow submit` again.",
		"Submission was not attempted.",
		"",
		`$ ${submitDryRunCommandDisplay}`,
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
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
	output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return [
		"Restack was not run. Submission was not attempted.",
		"Run `gt restack --downstack`, resolve any conflicts, then run `sdl flow submit` again.",
		"",
		`$ ${submitDryRunCommandDisplay}`,
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
		"`gt restack --downstack` hit merge conflicts. Submission was not attempted.",
		"",
		...fileLines,
		"Resolve the conflicts, continue or abort the rebase as appropriate, then run `sdl flow submit` again.",
		"",
		"$ gt restack --downstack --no-interactive",
		"",
		formatOutputSection("stdout", output.stdout),
		formatOutputSection("stderr", output.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatReadinessRecheckFailureOutput(
	output: SubmitCommandOutput,
	submitDryRunCommandDisplay: string,
): string {
	return [
		[
			"Graphite still requires restack after `sdl flow submit` already ran `gt restack --downstack --no-interactive`.",
			"Submission was not attempted. PR metadata was not prepared.",
		].join("\n"),
		formatIndentedOutputBlock("Graphite dry-run error:", output.stderr),
		[
			"Next steps:",
			"- Run `gt restack --downstack` manually and resolve any conflicts, skipped branches, or stale branch state Graphite reports.",
			`- Verify readiness: \`${submitDryRunCommandDisplay}\``,
			"- Then rerun: `sdl flow submit`",
		].join("\n"),
		formatIndentedOutputBlock("Additional dry-run stdout:", output.stdout),
	]
		.filter((section): section is string => section !== undefined && section !== "")
		.join("\n\n");
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
