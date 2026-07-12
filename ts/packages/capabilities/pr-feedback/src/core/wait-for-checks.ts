import type { Clock } from "@nseng-ai/foundation/clock";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import type { GithubPrFeedbackFailure, PrAddressGithubGateway } from "../api.ts";

import {
	branchPrChecksMappingGaps,
	collectBranchPrChecks,
	type BranchPrChecksCollection,
	type BranchPrChecksEntry,
} from "./branch-pr-checks.ts";
import { hasBranchPrMappingGaps, type BranchPrMappingSummary } from "./branch-pr-mapping.ts";
import type { GatewayOptions } from "./gateways.ts";
import type { PrChecksCountsPayload } from "./pr-checks.ts";

/**
 * How one wait ended. "failing" is reported as soon as any check concludes
 * unsuccessfully (failing or cancelled bucket); "passing" means every check
 * concluded without a pending, failing, or cancelled check remaining;
 * "timeout" means checks were still pending when the deadline passed;
 * "mapping-gap" means at least one branch had no or multiple open PRs
 * (reported immediately — waiting cannot resolve it).
 */
export type WaitForChecksOutcome = "passing" | "failing" | "timeout" | "mapping-gap";

export interface WaitForChecksReport {
	outcome: WaitForChecksOutcome;
	polls: number;
	waitedMs: number;
	/** Check counts aggregated across every found branch entry in the last poll. */
	counts: PrChecksCountsPayload;
	entries: BranchPrChecksEntry[];
	summary: BranchPrMappingSummary;
}

export type WaitForChecksResult =
	| { type: "ok"; report: WaitForChecksReport }
	| { type: "failure"; message: string; failure: GithubPrFeedbackFailure };

export interface WaitForBranchPrChecksOptions {
	branches: readonly string[];
	prFeedback: PrAddressGithubGateway;
	gatewayOptions: GatewayOptions;
	clock: Clock;
	timers: TimerScheduler;
	timeoutMs: number;
	intervalMs: number;
}

/**
 * Poll the batched branch->PR checks collection until it settles, then report
 * once. Settling short-circuits: any failing/cancelled check or mapping gap
 * returns immediately; otherwise the wait continues while checks are pending,
 * up to the deadline. The deadline is checked after each poll, so the last
 * poll may start up to one interval before `timeoutMs` elapses.
 */
export async function waitForBranchPrChecks(
	options: WaitForBranchPrChecksOptions,
): Promise<WaitForChecksResult> {
	const startMs = options.clock.nowMs();
	const deadlineMs = startMs + options.timeoutMs;
	let polls = 0;
	for (;;) {
		const result = await collectBranchPrChecks({
			branches: options.branches,
			prFeedback: options.prFeedback,
			gatewayOptions: options.gatewayOptions,
		});
		polls += 1;
		if (result.type === "failure") return result;
		const collection = result.collection;
		const settled = settledOutcome(collection);
		if (settled !== null) return waitReport(settled, collection, polls, options.clock, startMs);
		if (options.clock.nowMs() >= deadlineMs) {
			return waitReport("timeout", collection, polls, options.clock, startMs);
		}
		await options.timers.delay(options.intervalMs);
	}
}

export function aggregateBranchPrChecksCounts(
	collection: BranchPrChecksCollection,
): PrChecksCountsPayload {
	const totals: PrChecksCountsPayload = {
		passing: 0,
		pending: 0,
		failing: 0,
		cancelled: 0,
		unknown: 0,
		hasMore: false,
	};
	for (const entry of collection.entries) {
		if (entry.status !== "found") continue;
		totals.passing += entry.counts.passing;
		totals.pending += entry.counts.pending;
		totals.failing += entry.counts.failing;
		totals.cancelled += entry.counts.cancelled;
		totals.unknown += entry.counts.unknown;
		totals.hasMore = totals.hasMore || entry.counts.hasMore;
	}
	return totals;
}

function settledOutcome(
	collection: BranchPrChecksCollection,
): Exclude<WaitForChecksOutcome, "timeout"> | null {
	if (hasBranchPrMappingGaps(branchPrChecksMappingGaps(collection))) return "mapping-gap";
	const counts = aggregateBranchPrChecksCounts(collection);
	if (counts.failing > 0 || counts.cancelled > 0) return "failing";
	if (counts.pending > 0) return null;
	return "passing";
}

function waitReport(
	outcome: WaitForChecksOutcome,
	collection: BranchPrChecksCollection,
	polls: number,
	clock: Clock,
	startMs: number,
): WaitForChecksResult {
	return {
		type: "ok",
		report: {
			outcome,
			polls,
			waitedMs: clock.nowMs() - startMs,
			counts: aggregateBranchPrChecksCounts(collection),
			entries: collection.entries,
			summary: collection.summary,
		},
	};
}
