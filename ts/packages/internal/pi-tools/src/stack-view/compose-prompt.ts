/**
 * Pure system-prompt builder for the stack-view compose side-session. Turns a
 * {@link StackViewModel} plus an enrichment snapshot into the drafting agent's
 * system prompt. The agent's job is to help the user compose ONE instruction
 * message that will be injected into their parent coding-agent session to work
 * a Graphite PR stack.
 *
 * This module performs no I/O and reads no clock; it only formats and truncates.
 * Enrichment lookups reuse {@link checkEnrichmentKey} / {@link threadEnrichmentKey}
 * and degrade gracefully — a missing or non-ready summary never blocks the prompt.
 *
 * PRs are emitted BOTTOM-UP (nearest-trunk first): `model.prs` is top-first, so
 * it is reversed here.
 */
import { checkEnrichmentKey, threadEnrichmentKey } from "./enrichment-keys.ts";
import type { EnrichmentEntry } from "./enrichment-store.ts";
import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "./types.ts";

/** Per-comment body truncation cap in the thread context; longer bodies get an ellipsis suffix. */
export const COMPOSE_COMMENT_BODY_MAX_CHARS = 700;
/** Maximum number of comments shown per unresolved thread. */
export const COMPOSE_MAX_THREAD_COMMENTS = 5;

const ELLIPSIS = "…";
const NO_DIAGNOSIS = "(no diagnosis available)";

export function buildComposeSystemPrompt(options: {
	model: StackViewModel;
	enrichment: ReadonlyMap<string, EnrichmentEntry>;
}): string {
	const { model, enrichment } = options;
	return [
		roleSection(),
		contextSection(model, enrichment),
		draftContentSteeringSection(),
		draftProtocolSection(),
	].join("\n\n");
}

function roleSection(): string {
	return [
		"# Your role",
		"You help the user compose ONE instruction message that will be injected into their coding-agent session to work a Graphite PR stack.",
		"You have full stack context below. Converse with the user to curate the scope of that message: which PRs, failing checks, and review threads to fix, and in what order.",
		"You do not edit code or run commands yourself; your only output is the instruction message, refined turn by turn.",
	].join("\n");
}

function contextSection(
	model: StackViewModel,
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): string {
	const lines: string[] = ["# Stack context"];
	lines.push(
		`Stack: ${model.owner}/${model.repo} (trunk: ${model.trunk}, current branch: ${model.currentBranch})`,
	);
	const bottomUp = [...model.prs].reverse();
	bottomUp.forEach((pr, index) => {
		lines.push("");
		appendPrSection(lines, pr, index + 1, bottomUp.length, enrichment);
	});
	return lines.join("\n");
}

function appendPrSection(
	lines: string[],
	pr: StackViewPr,
	position: number,
	total: number,
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): void {
	const heading =
		pr.number === null ? `(no PR) ${pr.branch}` : `#${pr.number} ${collapseWhitespace(pr.title)}`;
	lines.push(`## PR ${position}/${total}: ${heading}`);
	lines.push(`branch: ${pr.branch} → ${pr.parentBranch}`);
	lines.push(`status: ${pr.status}`);

	appendFailingChecks(lines, pr, enrichment);
	appendUnresolvedThreads(lines, pr, enrichment);
	appendPendingChecks(lines, pr);

	if (pr.objectiveSlugs.length > 0) {
		lines.push(`objectives: ${pr.objectiveSlugs.join(", ")}`);
	}
}

function appendFailingChecks(
	lines: string[],
	pr: StackViewPr,
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): void {
	const failing = pr.checkEntries.filter((entry) => entry.bucket === "failing");
	if (failing.length === 0) return;
	lines.push(`FAILING CHECKS (${failing.length}):`);
	for (const entry of failing) {
		lines.push(`- ${checkEntryLabel(entry)}`);
		const diagnosis = readyCheckSummary(entry, enrichment) ?? NO_DIAGNOSIS;
		for (const line of diagnosis.split("\n")) lines.push(`  ${line}`);
	}
}

function appendUnresolvedThreads(
	lines: string[],
	pr: StackViewPr,
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): void {
	if (pr.unresolvedThreads.length === 0) return;
	lines.push(`UNRESOLVED THREADS (${pr.unresolvedThreads.length}):`);
	for (const thread of pr.unresolvedThreads) {
		lines.push(`- thread ${threadHeader(thread)}`);
		const asks = readyThreadSummary(thread, enrichment);
		if (asks !== null) lines.push(`  asks: ${collapseWhitespace(asks)}`);
		appendThreadComments(lines, thread);
	}
}

function appendThreadComments(lines: string[], thread: StackViewThreadDetail): void {
	const shown = thread.comments.slice(0, COMPOSE_MAX_THREAD_COMMENTS);
	for (const comment of shown) {
		const author = comment.author ?? "(unknown)";
		lines.push(`  ${author}: ${truncate(comment.body, COMPOSE_COMMENT_BODY_MAX_CHARS)}`);
	}
	const more = thread.totalComments - shown.length;
	if (more > 0) lines.push(`  (+${more} more comments)`);
}

function appendPendingChecks(lines: string[], pr: StackViewPr): void {
	const pending = pr.checkEntries.filter((entry) => entry.bucket === "pending");
	if (pending.length === 0) return;
	lines.push(`PENDING CHECKS (${pending.length}):`);
	for (const entry of pending) lines.push(`- ${checkEntryLabel(entry)}`);
}

function readyCheckSummary(
	entry: StackViewCheckEntry,
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): string | null {
	const result = enrichment.get(checkEnrichmentKey(entry));
	return result?.state === "ready" ? result.summary : null;
}

function readyThreadSummary(
	thread: StackViewThreadDetail,
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): string | null {
	const key = threadEnrichmentKey(thread);
	if (key === null) return null;
	const result = enrichment.get(key);
	return result?.state === "ready" ? result.summary : null;
}

function threadHeader(thread: StackViewThreadDetail): string {
	const location = thread.path.length > 0 ? thread.path : "(file unknown)";
	const withLine = thread.line !== null ? `${location}:${thread.line}` : location;
	const parts = [thread.id ?? "(unknown id)", withLine];
	if (thread.author !== null) parts.push(thread.author);
	return parts.join(" · ");
}

function checkEntryLabel(entry: StackViewCheckEntry): string {
	return entry.workflowName !== null ? `${entry.name} (${entry.workflowName})` : entry.name;
}

function draftContentSteeringSection(): string {
	return [
		"# What the instruction message must contain",
		"Steer the draft so the coding agent that receives it will:",
		"- Organize the work bottom-up, one branch at a time, nearest the trunk first.",
		"- Navigate to each branch with `gt checkout <branch>` before touching it.",
		"- Fix and validate that branch's issues before moving up the stack.",
		"- Reference the exact review-thread IDs it is addressing.",
		'- After implementing and validating a fix, close each addressed thread with `ns address exec close-review-threads --thread-ids-json \'{"threadIds":["<THREAD_ID>"]}\' --format json`; add `--body <BODY>` to also post a reply.',
		"- Use single-thread reply/resolve primitives only for one-offs, and never use raw `gh api graphql` for those mutations.",
		"- Not push, submit, create branches, or mutate unrelated GitHub state unless the user explicitly asked.",
		"- Report any thread it cannot resolve rather than leaving it silently open.",
	].join("\n");
}

function draftProtocolSection(): string {
	return [
		"# Draft protocol (required on every reply)",
		"End EVERY reply with the complete current draft in a single fenced block:",
		"- a line containing exactly ```draft",
		"- the full draft message",
		"- a line containing exactly ```",
		"Emit the full draft every time (never a diff), exactly one block, as the last thing in the reply.",
		"Do not place any triple-backtick fences inside the draft; indent example code by four spaces instead.",
		"Propose an initial draft in your first reply.",
	].join("\n");
}

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max)}${ELLIPSIS}` : value;
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
