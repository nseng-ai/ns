/**
 * GitHub Actions job-log plumbing for the stack-view enrichment engine. These
 * helpers are deliberate local duplicates of the pr-previews check-log helpers
 * (`src/pr-previews/preview-check-logs.ts`) rather than imports: the stack-view
 * subpackage stays decoupled from `src/pr-previews`, mirroring the same idiom
 * `overlay-model.ts:19-22` uses for the overlay clip-budget constants. The small
 * amount of URL-parsing and `gh run view` plumbing is cheaper to mirror than to
 * couple the two tool subpackages.
 *
 * Error model matches the rest of stack-view: failures are returned as typed
 * discriminated-union values, never thrown.
 */
import { commandFailureReason, commandSucceeded } from "@ns/core/exec";
import { formatErrorMessage } from "@ns/core/primitives";

import type { CommandExecApi } from "./exec.ts";
import type { StackViewCheckEntry } from "./types.ts";

/** Default log-tail budget; only the final N characters are kept for the summarizer. */
const DEFAULT_MAX_LOG_TAIL_CHARS = 40_000;

/** Parse a GitHub Actions job URL into `gh run view` args; null when not an Actions job URL. */
export function githubActionsJobLogArgs(detailsUrl: string): string[] | null {
	const parsed =
		/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(\d+)\/job\/(\d+)(?:\b|[/?#])/u.exec(
			detailsUrl,
		);
	if (parsed === null) return null;
	const runId = parsed[1];
	const jobId = parsed[2];
	if (runId === undefined || jobId === undefined) return null;
	return ["run", "view", runId, "--job", jobId, "--log"];
}

/**
 * LBYL reason a check's logs cannot be fetched; null when fetchable. Guards, in
 * order: the check is not completed, it was canceled/skipped (GitHub omits those
 * logs), or its details URL is absent or not a parseable Actions job URL.
 */
export function checkLogUnavailableReason(entry: StackViewCheckEntry): string | null {
	if (entry.status !== "COMPLETED") {
		return `logs are not available while this check is ${entry.status ?? "not completed"}`;
	}
	const conclusion = entry.conclusion?.toLowerCase() ?? null;
	if (conclusion === "canceled" || conclusion === "cancelled" || conclusion === "skipped") {
		const label = conclusion === "skipped" ? "skipped" : "canceled";
		return `logs are not available because this check was ${label}`;
	}
	if (entry.detailsUrl === null) {
		return "logs are not available because this check has no details URL";
	}
	if (githubActionsJobLogArgs(entry.detailsUrl) === null) {
		return "logs are not available because this check's details URL is not a GitHub Actions job URL";
	}
	return null;
}

export interface FetchCheckLogTailOptions {
	execApi: CommandExecApi;
	cwd: string;
	entry: StackViewCheckEntry;
	signal: AbortSignal;
	/** Log-tail budget in characters; defaults to 40_000, keeping the TAIL. */
	maxChars?: number;
}

export type FetchCheckLogTailResult = { ok: true; logTail: string } | { ok: false; reason: string };

/**
 * Fetch the tail of a check's GitHub Actions job log through the exec seam.
 * LBYL-guards via {@link checkLogUnavailableReason}, then execs `gh` with the
 * parsed run/job args; a nonzero exit or startup error maps to `{ ok: false }`,
 * and a successful log is truncated to the final `maxChars` characters. The Pi
 * exec seam can reject (e.g. a spawn failure) rather than return a
 * `{ startupError }` result, so the exec await is wrapped and a thrown error is
 * mapped to `{ ok: false }` — this helper never throws, matching the stack-view
 * errors-as-values contract.
 */
export async function fetchCheckLogTail(
	options: FetchCheckLogTailOptions,
): Promise<FetchCheckLogTailResult> {
	const unavailable = checkLogUnavailableReason(options.entry);
	if (unavailable !== null) return { ok: false, reason: unavailable };

	// checkLogUnavailableReason guarantees a parseable Actions job URL here; the
	// re-parse keeps the null-narrowing honest for the type checker.
	const detailsUrl = options.entry.detailsUrl;
	if (detailsUrl === null) return { ok: false, reason: "logs are not available for this check" };
	const args = githubActionsJobLogArgs(detailsUrl);
	if (args === null) return { ok: false, reason: "logs are not available for this check" };

	let result;
	try {
		result = await options.execApi.exec("gh", args, {
			cwd: options.cwd,
			signal: options.signal,
		});
	} catch (error) {
		return { ok: false, reason: formatErrorMessage(error) };
	}
	if (result.startupError !== undefined || !commandSucceeded(result)) {
		return { ok: false, reason: commandFailureReason(result) };
	}

	const output = result.stdout.trim();
	const maxChars = options.maxChars ?? DEFAULT_MAX_LOG_TAIL_CHARS;
	const logTail = output.length > maxChars ? output.slice(-maxChars) : output;
	return { ok: true, logTail };
}
