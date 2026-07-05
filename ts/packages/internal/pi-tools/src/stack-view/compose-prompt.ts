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
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";

import { checkEnrichmentKey, threadEnrichmentKey } from "./enrichment-keys.ts";
import type { EnrichmentEntry } from "./enrichment-store.ts";
import { collapseWhitespace, entriesForCheckBucket, formatCheckEntryLabel } from "./format.ts";
import type {
	StackViewCheckBucket,
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "./types.ts";

/**
 * Per-comment body truncation cap in the thread context, marker-inclusive: a
 * truncated line is at most this many chars total (body + ellipsis), and bodies of
 * at most this length pass through untouched. Longer bodies get an ellipsis suffix.
 */
export const COMPOSE_COMMENT_BODY_MAX_CHARS = 700;
/** Maximum number of comments shown per unresolved thread. */
export const COMPOSE_MAX_THREAD_COMMENTS = 5;

const ELLIPSIS = "…";
const NO_DIAGNOSIS = "(no diagnosis available)";

interface PromptWriter {
	push(...texts: string[]): void;
	toText(): string;
}

interface EnrichmentReader {
	readyCheckSummary(entry: StackViewCheckEntry): string | null;
	readyThreadSummary(thread: StackViewThreadDetail): string | null;
}

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
	const writer = createPromptWriter();
	const enrichmentReader = createEnrichmentReader(enrichment);
	writer.push("# Stack context");
	writer.push(
		`Stack: ${model.owner}/${model.repo} (trunk: ${model.trunk}, current branch: ${model.currentBranch})`,
	);
	const bottomUp = [...model.prs].reverse();
	bottomUp.forEach((pr, index) => {
		writer.push("");
		appendPrSection(writer, enrichmentReader, { pr, position: index + 1, total: bottomUp.length });
	});
	return writer.toText();
}

function createPromptWriter(): PromptWriter {
	const lines: string[] = [];
	return {
		push(...texts) {
			lines.push(...texts);
		},
		toText() {
			return lines.join("\n");
		},
	};
}

function createEnrichmentReader(
	enrichment: ReadonlyMap<string, EnrichmentEntry>,
): EnrichmentReader {
	return {
		readyCheckSummary(entry) {
			const result = enrichment.get(checkEnrichmentKey(entry));
			return result?.state === "ready" ? result.summary : null;
		},
		readyThreadSummary(thread) {
			const key = threadEnrichmentKey(thread);
			if (key === null) return null;
			const result = enrichment.get(key);
			return result?.state === "ready" ? result.summary : null;
		},
	};
}

function appendPrSection(
	writer: PromptWriter,
	enrichmentReader: EnrichmentReader,
	options: { pr: StackViewPr; position: number; total: number },
): void {
	const { pr, position, total } = options;
	const heading =
		pr.number === null ? `(no PR) ${pr.branch}` : `#${pr.number} ${collapseWhitespace(pr.title)}`;
	writer.push(`## PR ${position}/${total}: ${heading}`);
	writer.push(`branch: ${pr.branch} → ${pr.parentBranch}`);
	writer.push(`status: ${pr.status}`);

	appendCheckBucketSection(writer, pr, {
		bucket: "failing",
		label: "FAILING CHECKS",
		withDetail: (entry) => (enrichmentReader.readyCheckSummary(entry) ?? NO_DIAGNOSIS).split("\n"),
	});
	appendUnresolvedThreads(writer, enrichmentReader, pr);
	appendCheckBucketSection(writer, pr, { bucket: "pending", label: "PENDING CHECKS" });

	if (pr.objectiveSlugs.length > 0) {
		writer.push(`objectives: ${pr.objectiveSlugs.join(", ")}`);
	}
}

function appendCheckBucketSection(
	writer: PromptWriter,
	pr: StackViewPr,
	options: {
		bucket: StackViewCheckBucket;
		label: string;
		withDetail?: (entry: StackViewCheckEntry) => string[];
	},
): void {
	const entries = entriesForCheckBucket(pr.checkEntries, options.bucket);
	if (entries.length === 0) return;
	writer.push(`${options.label} (${entries.length}):`);
	for (const entry of entries) {
		writer.push(`- ${formatCheckEntryLabel(entry)}`);
		for (const line of options.withDetail?.(entry) ?? []) writer.push(`  ${line}`);
	}
}

function appendUnresolvedThreads(
	writer: PromptWriter,
	enrichmentReader: EnrichmentReader,
	pr: StackViewPr,
): void {
	if (pr.unresolvedThreads.length === 0) return;
	writer.push(`UNRESOLVED THREADS (${pr.unresolvedThreads.length}):`);
	for (const thread of pr.unresolvedThreads) {
		writer.push(`- thread ${threadHeader(thread)}`);
		const asks = enrichmentReader.readyThreadSummary(thread);
		if (asks !== null) writer.push(`  asks: ${collapseWhitespace(asks)}`);
		appendThreadComments(writer, thread);
	}
}

function appendThreadComments(writer: PromptWriter, thread: StackViewThreadDetail): void {
	const shown = thread.comments.slice(0, COMPOSE_MAX_THREAD_COMMENTS);
	for (const comment of shown) {
		const author = comment.author ?? "(unknown)";
		writer.push(`  ${author}: ${truncate(comment.body, COMPOSE_COMMENT_BODY_MAX_CHARS)}`);
	}
	const more = thread.totalComments - shown.length;
	if (more > 0) writer.push(`  (+${more} more comments)`);
}

function threadHeader(thread: StackViewThreadDetail): string {
	const location = thread.path.length > 0 ? thread.path : "(file unknown)";
	const withLine = thread.line !== null ? `${location}:${thread.line}` : location;
	const parts = [thread.id ?? "(unknown id)", withLine];
	if (thread.author !== null) parts.push(thread.author);
	return parts.join(" · ");
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
	// `truncateTextHead` counts the marker inside `maxChars`, so passing `max`
	// directly makes both the pass-through threshold and the truncated output
	// marker-inclusive (each at most `max` chars).
	return truncateTextHead({ value, maxChars: max, buildMarker: () => ELLIPSIS });
}
