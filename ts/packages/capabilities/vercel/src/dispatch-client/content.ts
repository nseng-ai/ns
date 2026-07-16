// Pure content builders for dispatch anchor branches and pull requests.
// Prompt dispatch selects semantic names elsewhere; Saved Plan dispatch
// retains its dispatch-ID-based anchor path here.
import type { DispatchPlanContextLocator } from "../dispatch/dispatch-context.ts";
import {
	DISPATCH_ANCHOR_BRANCH_MAX_CHARS,
	DISPATCH_ANCHOR_BRANCH_PREFIX,
	isValidDispatchAnchorBranch,
} from "../dispatch/dispatch-run.ts";

/** Cap on the sanitized source-branch portion of a Saved Plan anchor branch name. */
const ANCHOR_SOURCE_SEGMENT_MAX_CHARS = 120;

/** Cap on the PR title's prompt excerpt. */
const ANCHOR_PR_TITLE_PROMPT_MAX_CHARS = 72;

export const DISPATCH_ANCHOR_PR_TITLE_PREFIX = "[dispatch] ";

/** Build the Saved Plan anchor name: `dispatch/<sanitized-source>-<dispatch-id>`. */
export function buildAnchorBranchName(sourceBranch: string, dispatchId: string): string {
	const sanitizedSource = sanitizeAnchorSegment(sourceBranch);
	const sanitizedId = sanitizeAnchorSegment(dispatchId);
	const name = `${DISPATCH_ANCHOR_BRANCH_PREFIX}${sanitizedSource}-${sanitizedId}`;
	if (!isValidDispatchAnchorBranch(name) || name.length > DISPATCH_ANCHOR_BRANCH_MAX_CHARS) {
		throw new Error(`Built an invalid dispatch anchor branch name: ${JSON.stringify(name)}`);
	}
	return name;
}

function sanitizeAnchorSegment(value: string): string {
	const sanitized = value
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/\.{2,}/g, ".")
		.replace(/-{2,}/g, "-")
		.replace(/^[-.]+/, "")
		.replace(/[-.]+$/, "")
		.slice(0, ANCHOR_SOURCE_SEGMENT_MAX_CHARS)
		.replace(/[-.]+$/, "");
	if (sanitized.length === 0) return "work";
	if (sanitized.toLowerCase().endsWith(".lock")) {
		return `${sanitized.slice(0, -".lock".length)}-lock`;
	}
	return sanitized;
}

/** Build the anchor PR title from the prompt's first line. */
export function buildAnchorPrTitle(prompt: string): string {
	const firstLine =
		prompt
			.split("\n")
			.find((line) => line.trim().length > 0)
			?.trim() ?? "";
	const excerpt =
		firstLine.length <= ANCHOR_PR_TITLE_PROMPT_MAX_CHARS
			? firstLine
			: `${firstLine.slice(0, ANCHOR_PR_TITLE_PROMPT_MAX_CHARS - 1).trimEnd()}…`;
	return `${DISPATCH_ANCHOR_PR_TITLE_PREFIX}${excerpt.length === 0 ? "dispatched prompt" : excerpt}`;
}

/**
 * Build the up-front anchor PR body. Status-aware: the run has been
 * created but not submitted when this body is written; the run-id stamp
 * is appended after the trigger call returns, and the workflow later
 * publishes the decision log (success) or the failure comment (failure)
 * onto this same PR.
 */
export function buildAnchorPrBody(options: {
	readonly prompt: string;
	readonly revision: string;
	readonly sourceBranch: string;
}): string {
	return [
		"This pull request anchors a cloud dispatch (`ns dispatch prompt`).",
		"",
		`- **Source branch:** \`${options.sourceBranch}\``,
		`- **Dispatched revision:** \`${options.revision}\``,
		"",
		"## Dispatched prompt",
		"",
		fencePrompt(options.prompt),
		"",
		"When the run completes, the produced commits land on this branch and",
		"the decision log is published into this description. If the run",
		"fails, a failure comment marks this PR failed and it stays open for",
		"triage. The workflow run id is stamped on this description at",
		"submission.",
	].join("\n");
}

/** Build the plan-specific anchor body with a marked, complete recovery record. */
export function buildPlanAnchorPrBody(options: {
	readonly planRef: string;
	readonly revision: string;
	readonly locator: DispatchPlanContextLocator;
}): string {
	return [
		"This pull request anchors a cloud dispatch (`ns dispatch plan`).",
		"",
		`- **Saved Plan:** \`${options.planRef}\``,
		`- **Dispatched revision:** \`${options.revision}\``,
		"",
		"<!-- ns:dispatch-provenance:start -->",
		"## Dispatch provenance",
		"",
		`- **Dispatch ID:** \`${options.locator.dispatchId}\``,
		`- **Branch Memory namespace:** \`${options.locator.namespace}\``,
		`- **Context prefix:** \`${options.locator.contextPrefix}\``,
		`- **Source branch:** \`${options.locator.sourceBranch}\``,
		`- **Snapshot Ref:** \`${options.locator.snapshotRef}\``,
		`- **Snapshot commit:** \`${options.locator.snapshotCommitSha}\``,
		`- **Plan Entry:** \`${options.locator.entryLocator}\``,
		"<!-- ns:dispatch-provenance:end -->",
		"",
		"When the run completes, the produced commits and decision log land on this branch.",
		"If the run fails, this PR remains the durable failure and recovery record.",
	].join("\n");
}

/** Fence the prompt, widening the fence when the prompt contains one. */
function fencePrompt(prompt: string): string {
	let fence = "```";
	while (prompt.includes(fence)) fence += "`";
	return `${fence}text\n${prompt}\n${fence}`;
}
