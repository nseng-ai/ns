// Anchor-PR reporting for the dispatch workflow: the pure content builders
// (marked decision-log section, idempotent description composition, marked
// failure comment) plus the gateway seam the reporting steps call. The
// GitHub App's installation token is the runtime credential, minted
// in-process by the real adapter (`real-dispatch-report-gateway.ts`);
// report content is non-secret by construction — it carries only the
// harness-authored decision log and stable failure codes/messages, never
// token material or environment values.
import type { DispatchReportResult, DispatchRunFailureCode } from "./dispatch-run.ts";

/** Markers bounding the decision-log section in the anchor PR description. */
export const DISPATCH_DECISION_LOG_SECTION_START = "<!-- ns-dispatch:decision-log:start -->";
export const DISPATCH_DECISION_LOG_SECTION_END = "<!-- ns-dispatch:decision-log:end -->";

/**
 * Cap applied to the published decision log: GitHub PR bodies max out at
 * 65536 characters, and the description also carries the CLI-authored
 * content outside the marked section.
 */
export const DISPATCH_DECISION_LOG_MAX_CHARS = 30_000;

const DECISION_LOG_TRUNCATION_NOTICE =
	"\n\n_Decision log truncated; see the run logs for the rest._";

/**
 * Build the marked decision-log section. Deterministic in its input, so
 * re-composing the same run's description is idempotent.
 */
export function buildDecisionLogSection(decisionLog: string | null): string {
	const body =
		decisionLog === null || decisionLog.trim().length === 0
			? "_The dispatched run recorded no decision log._"
			: truncateDecisionLog(decisionLog.trim());
	return [
		DISPATCH_DECISION_LOG_SECTION_START,
		"## Decision log",
		"",
		body,
		DISPATCH_DECISION_LOG_SECTION_END,
	].join("\n");
}

function truncateDecisionLog(decisionLog: string): string {
	if (decisionLog.length <= DISPATCH_DECISION_LOG_MAX_CHARS) return decisionLog;
	return decisionLog.slice(0, DISPATCH_DECISION_LOG_MAX_CHARS) + DECISION_LOG_TRUNCATION_NOTICE;
}

/**
 * Compose the anchor PR description with the marked section: replace an
 * existing marked section in place, or append one to the existing body.
 * Idempotent — composing the same section twice yields the same
 * description, which makes the at-least-once reporting step safe to
 * re-run.
 */
export function composeAnchorPrDescription(existingBody: string | null, section: string): string {
	const body = existingBody ?? "";
	const start = body.indexOf(DISPATCH_DECISION_LOG_SECTION_START);
	const end = body.indexOf(DISPATCH_DECISION_LOG_SECTION_END);
	if (start !== -1 && end !== -1 && end >= start) {
		const before = body.slice(0, start);
		const after = body.slice(end + DISPATCH_DECISION_LOG_SECTION_END.length);
		return `${before}${section}${after}`;
	}
	if (body.trim().length === 0) return section;
	return `${body.replace(/\s+$/, "")}\n\n${section}`;
}

/**
 * The marker embedded in a dispatch failure comment. One dispatch owns one
 * anchor branch, so the adapter can detect an already-posted failure
 * comment by this marker and keep the reporting step idempotent.
 */
export function buildDispatchFailureMarker(anchorBranch: string): string {
	return `<!-- ns-dispatch:failure:${anchorBranch} -->`;
}

/**
 * Build the failure comment that marks the anchor PR failed while leaving
 * it open for triage: re-dispatch, take the work over, or close it. Content
 * is a stable code plus a safe message; the workflow run id stamped on the
 * PR at submission is the pointer to the run's logs.
 */
export function buildDispatchFailureComment(options: {
	readonly anchorBranch: string;
	readonly code: DispatchRunFailureCode;
	readonly message: string;
}): string {
	return [
		buildDispatchFailureMarker(options.anchorBranch),
		"## Dispatch failed",
		"",
		`- **Code:** \`${options.code}\``,
		`- **Reason:** ${options.message}`,
		"",
		"The anchor PR stays open for triage: re-dispatch, take the work over, or close it.",
		"Run logs are reachable through the workflow run id stamped on this PR.",
	].join("\n");
}

/**
 * Gateway seam over the anchor PR's GitHub reporting surface: publish the
 * decision log into the PR description and mark a failed run with the
 * failure comment. Both operations are idempotent per this contract — the
 * adapter replaces the marked description section in place and never posts
 * a second comment carrying the same marker — so the at-least-once
 * reporting steps are safe to re-run. Faked in tests; the real adapter
 * mints the GitHub App installation token in-process per operation.
 */
export interface DispatchReportGateway {
	publishAnchorPrDecisionLog(options: {
		readonly anchorPrNumber: number;
		readonly decisionLog: string | null;
	}): Promise<DispatchReportResult>;
	ensureAnchorPrFailureComment(options: {
		readonly anchorPrNumber: number;
		readonly anchorBranch: string;
		readonly code: DispatchRunFailureCode;
		readonly message: string;
	}): Promise<DispatchReportResult>;
}
