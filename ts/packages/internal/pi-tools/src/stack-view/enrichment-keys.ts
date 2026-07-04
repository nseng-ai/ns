/**
 * Pure memo-key derivation for the stack-view enrichment subsystem. A key
 * identifies a unit of cheap-model work (a thread summary or a check-failure
 * diagnosis) and encodes the inputs that invalidate it: a thread key rolls when
 * a new last comment arrives, a check key rolls when the conclusion changes.
 * This module performs no I/O and reads no clock.
 */
import type { StackViewCheckEntry, StackViewThreadDetail } from "./types.ts";

/** Memo key for a thread summary; null when the thread has no GraphQL id (never summarized). */
export function threadEnrichmentKey(thread: StackViewThreadDetail): string | null {
	if (thread.id === null) return null;
	return `thread:${thread.id}:${thread.lastCommentId ?? "none"}`;
}

/**
 * Memo key for a check-failure summary: `check:<discriminator>:<conclusion>`.
 * The discriminator prefers the run/job-unique `detailsUrl` because the store is
 * shared across every PR in the stack and `identity` (`check-run:<wf>:<name>`)
 * carries no PR/run discriminator — same-named failing checks on two stacked PRs
 * would otherwise collide on one key. Falls back to `identity`, then to
 * `<workflowName>/<name>`, when the details URL is absent.
 */
export function checkEnrichmentKey(entry: StackViewCheckEntry): string {
	const discriminator =
		entry.detailsUrl ?? entry.identity ?? `${entry.workflowName ?? ""}/${entry.name}`;
	return `check:${discriminator}:${entry.conclusion ?? "none"}`;
}
