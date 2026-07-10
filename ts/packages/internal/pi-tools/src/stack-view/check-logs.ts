/**
 * GitHub Actions job-log plumbing for the stack-view enrichment engine. These
 * helpers reuse the shared GitHub Actions job URL parser from the pr-previews
 * tooling and keep stack-view-specific availability wording local.
 *
 * Error model matches the rest of stack-view: failures are returned as typed
 * discriminated-union values, never thrown.
 */
import { commandFailureReason, commandSucceeded } from "@nseng-ai/foundation/exec";
import { GITHUB_CLI_TIMEOUT_MS } from "@nseng-ai/capability-kit/github";

import { githubActionsJobLogArgs } from "../pr-previews/preview-check-logs.ts";
import { CHECK_LOG_TAIL_MAX_CHARS } from "./enrichment-prompts.ts";
import type { CommandExecApi } from "./exec.ts";
import type { StackViewCheckEntry } from "./types.ts";

/** Resolved log source for a check: the proven `gh` argv, or the reason it is unavailable. */
export type ResolveCheckLogSourceResult =
	| { ok: true; args: string[] }
	| { ok: false; reason: string };

/**
 * Parse-don't-validate the log source for a check. Guards, in order: the check
 * is not completed, it was canceled/skipped (GitHub omits those logs), or its
 * details URL is absent or not a parseable Actions job URL. On success it hands
 * back the parsed `gh run view --log` argv so callers never re-parse the URL.
 */
export function resolveCheckLogSource(entry: StackViewCheckEntry): ResolveCheckLogSourceResult {
	if (entry.status !== "COMPLETED") {
		return {
			ok: false,
			reason: `logs are not available while this check is ${entry.status ?? "not completed"}`,
		};
	}
	const conclusion = entry.conclusion?.toLowerCase() ?? null;
	if (conclusion === "canceled" || conclusion === "cancelled" || conclusion === "skipped") {
		const label = conclusion === "skipped" ? "skipped" : "canceled";
		return { ok: false, reason: `logs are not available because this check was ${label}` };
	}
	if (entry.detailsUrl === null) {
		return { ok: false, reason: "logs are not available because this check has no details URL" };
	}
	const args = githubActionsJobLogArgs(entry.detailsUrl);
	if (args === null) {
		return {
			ok: false,
			reason:
				"logs are not available because this check's details URL is not a GitHub Actions job URL",
		};
	}
	return { ok: true, args };
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
 * Resolves the log source via {@link resolveCheckLogSource} (which returns the
 * proven `gh` argv), then execs `gh`; any non-success termination maps to
 * `{ ok: false }`, and a successful log is truncated to the final `maxChars`
 * characters. The injected command gateway returns failures as union arms, so
 * this helper preserves the stack-view errors-as-values contract.
 */
export async function fetchCheckLogTail(
	options: FetchCheckLogTailOptions,
): Promise<FetchCheckLogTailResult> {
	const source = resolveCheckLogSource(options.entry);
	if (!source.ok) return { ok: false, reason: source.reason };

	const result = await options.execApi.exec("gh", source.args, {
		cwd: options.cwd,
		signal: options.signal,
		timeout: GITHUB_CLI_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return { ok: false, reason: commandFailureReason(result) };
	}

	const output = result.stdout.trim();
	const maxChars = options.maxChars ?? CHECK_LOG_TAIL_MAX_CHARS;
	const logTail = output.length > maxChars ? output.slice(-maxChars) : output;
	return { ok: true, logTail };
}
