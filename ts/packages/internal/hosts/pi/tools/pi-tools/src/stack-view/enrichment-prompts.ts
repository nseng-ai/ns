/**
 * Pure prompt builders for the cheap-model enrichment passes. Each builder turns
 * a stack-view domain object plus already-fetched text into a `ModelPromptText`
 * the engine sends to the model. This module performs no I/O and reads no clock;
 * it only formats and truncates. The numeric caps are exported so the engine and
 * tests reference the same constants rather than re-deriving them.
 */
import type { StackViewCheckEntry, StackViewThreadDetail } from "./types.ts";

export interface ModelPromptText {
	systemPrompt: string;
	userText: string;
}

/** Per-comment body truncation cap; bodies longer than this get an ellipsis suffix. */
export const THREAD_COMMENT_BODY_MAX_CHARS = 1500;
/** Total-userText cap for the thread summary prompt. */
export const THREAD_USER_TEXT_MAX_CHARS = 6000;
/** Log-tail cap for the check summary prompt; only the final N characters are kept. */
export const CHECK_LOG_TAIL_MAX_CHARS = 40000;

const ELLIPSIS = "…";
const THREAD_OMISSION_MARKER = "(… earlier comments omitted)";

const THREAD_SYSTEM_PROMPT =
	"You summarize a code-review thread for the PR author. Reply with exactly one line of at most 100 characters stating what the reviewer wants changed or answered. No preamble, no labels, no markdown.";

const CHECK_SYSTEM_PROMPT =
	"You diagnose a failed GitHub Actions check from its log tail. Reply with at most 3 short lines: the failing step or test, the exact error, and the likely fix. No generic CI advice.";

/** Build the cheap-model prompt summarizing what a review thread asks for. */
export function buildThreadSummaryPrompt(options: {
	prNumber: number;
	thread: StackViewThreadDetail;
}): ModelPromptText {
	const { prNumber, thread } = options;
	const header = buildThreadHeader(prNumber, thread);
	const commentLines = thread.comments.map(buildCommentLine);
	const moreNote = buildMoreCommentsNote(thread);
	return {
		systemPrompt: THREAD_SYSTEM_PROMPT,
		userText: assembleThreadUserText(header, commentLines, moreNote),
	};
}

/** Build the cheap-model prompt diagnosing a failed check from its log tail. */
export function buildCheckSummaryPrompt(options: {
	entry: StackViewCheckEntry;
	logTail: string;
}): ModelPromptText {
	const { entry, logTail } = options;
	const headerLines = [`Check: ${entry.name}`];
	if (entry.workflowName !== null) headerLines.push(`Workflow: ${entry.workflowName}`);
	if (entry.conclusion !== null) headerLines.push(`Conclusion: ${entry.conclusion}`);
	return {
		systemPrompt: CHECK_SYSTEM_PROMPT,
		userText: [...headerLines, "", buildLogBlock(logTail)].join("\n"),
	};
}

function buildThreadHeader(prNumber: number, thread: StackViewThreadDetail): string {
	const location = thread.line === null ? thread.path : `${thread.path}:${thread.line}`;
	return `PR #${prNumber} — ${location}`;
}

function buildCommentLine(comment: { author: string | null; body: string }): string {
	const author = comment.author ?? "(unknown)";
	const body =
		comment.body.length > THREAD_COMMENT_BODY_MAX_CHARS
			? `${comment.body.slice(0, THREAD_COMMENT_BODY_MAX_CHARS)}${ELLIPSIS}`
			: comment.body;
	return `${author}: ${body}`;
}

function buildMoreCommentsNote(thread: StackViewThreadDetail): string | null {
	const missing = thread.totalComments - thread.comments.length;
	if (missing <= 0) return null;
	return `(thread has ${missing} more comments than shown)`;
}

/**
 * Join header, comment lines, and the optional more-comments note under the total
 * cap. When over the cap, keep the first comment and as many of the most-recent
 * comments as fit, with an omission marker inserted between them.
 */
function assembleThreadUserText(
	header: string,
	commentLines: readonly string[],
	moreNote: string | null,
): string {
	const tailLines = moreNote === null ? [] : [moreNote];
	const full = [header, ...commentLines, ...tailLines].join("\n");
	if (full.length <= THREAD_USER_TEXT_MAX_CHARS || commentLines.length === 0) return full;

	const first = commentLines[0] ?? "";
	const rest = commentLines.slice(1);
	const moreSuffix = moreNote === null ? "" : `\n${moreNote}`;
	// Fixed prefix that is always present once we trim: header, first comment, marker.
	const fixedLength =
		header.length + 1 + first.length + 1 + THREAD_OMISSION_MARKER.length + moreSuffix.length;

	const recent: string[] = [];
	let recentLength = 0;
	for (let index = rest.length - 1; index >= 0; index -= 1) {
		const line = rest[index] ?? "";
		const addLength = 1 + line.length;
		if (fixedLength + recentLength + addLength > THREAD_USER_TEXT_MAX_CHARS) break;
		recent.unshift(line);
		recentLength += addLength;
	}

	const lines = [header, first];
	if (recent.length < rest.length) lines.push(THREAD_OMISSION_MARKER);
	lines.push(...recent, ...tailLines);
	return lines.join("\n");
}

function buildLogBlock(logTail: string): string {
	if (logTail.length <= CHECK_LOG_TAIL_MAX_CHARS) return logTail;
	const tail = logTail.slice(logTail.length - CHECK_LOG_TAIL_MAX_CHARS);
	return `(log truncated to final ${CHECK_LOG_TAIL_MAX_CHARS} characters)\n${tail}`;
}
