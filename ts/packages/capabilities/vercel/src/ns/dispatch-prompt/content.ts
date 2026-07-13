// Pure content builders for `ns dispatch prompt`: the anchor branch
// naming scheme (settling seam-design §5's `dispatch/<source>-<short-id>`
// placeholder) and the up-front anchor PR title/body. Everything here is
// deterministic in its inputs; wording is status-aware — the body
// describes a submitted-not-finished run, and the workflow's own
// reporting later lands the decision log or the failure comment.
import {
	DISPATCH_ANCHOR_BRANCH_MAX_CHARS,
	DISPATCH_ANCHOR_BRANCH_PREFIX,
	isValidDispatchAnchorBranch,
} from "../../dispatch/dispatch-run.ts";

/** Cap on the sanitized source-branch portion of an anchor branch name. */
const ANCHOR_SOURCE_SEGMENT_MAX_CHARS = 120;

/** Cap on the PR title's prompt excerpt. */
const ANCHOR_PR_TITLE_PROMPT_MAX_CHARS = 72;

export const DISPATCH_ANCHOR_PR_TITLE_PREFIX = "[dispatch] ";

/**
 * Build the anchor branch name: `dispatch/<sanitized-source>-<id>`. The
 * sanitized source keeps the branch recognizably tied to where it was
 * dispatched from; the id suffix keeps repeated dispatches from one
 * branch distinct. Output always satisfies
 * {@link isValidDispatchAnchorBranch} (the landing command's injection
 * gate), which the caller re-checks as an invariant.
 */
export function buildAnchorBranchName(sourceBranch: string, anchorId: string): string {
	const sanitizedSource = sanitizeAnchorSegment(sourceBranch);
	const sanitizedId = sanitizeAnchorSegment(anchorId);
	const name = `${DISPATCH_ANCHOR_BRANCH_PREFIX}${sanitizedSource}-${sanitizedId}`;
	if (!isValidDispatchAnchorBranch(name) || name.length > DISPATCH_ANCHOR_BRANCH_MAX_CHARS) {
		throw new Error(`Built an invalid dispatch anchor branch name: ${JSON.stringify(name)}`);
	}
	return name;
}

/**
 * Reduce a branch name (or id) to the anchor charset: `/` becomes `-` so
 * the anchor stays a two-segment name, everything outside
 * `[A-Za-z0-9._-]` becomes `-`, runs collapse, and edge characters that
 * would break git ref segment rules are trimmed. Empty input falls back
 * to `work`.
 */
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
	if (sanitized.toLowerCase().endsWith(".lock"))
		return `${sanitized.slice(0, -".lock".length)}-lock`;
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

/** Fence the prompt, widening the fence when the prompt contains one. */
function fencePrompt(prompt: string): string {
	let fence = "```";
	while (prompt.includes(fence)) fence += "`";
	return `${fence}text\n${prompt}\n${fence}`;
}
