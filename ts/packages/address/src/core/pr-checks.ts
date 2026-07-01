import type { GitGateway } from "@sdl/git";

import type { GithubPrFeedbackGateway, GithubPrSummary, GithubStatusChecks } from "../api.ts";

import type { GatewayOptions } from "./gateways.ts";
import { resolvePrTarget, type PrTargetFailureResult } from "./pr-target.ts";
import { buildPrChecksTargetPayload, type PrTargetPayload } from "./pr-target-payload.ts";

export interface PrChecksCountsPayload {
	passing: number;
	pending: number;
	failing: number;
	unknown: number;
	hasMore: boolean;
}

export interface PrCheckEntryPayload {
	bucket: "passing" | "pending" | "failing" | "unknown";
	kind: "check_run" | "status_context" | "unknown";
	name: string;
	workflow_name: string | null;
	status: string | null;
	conclusion: string | null;
	state: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string | null;
	details_url: string | null;
	target_url: string | null;
	identity: string | null;
}

export interface PrChecksPayload {
	found: boolean;
	target: PrTargetPayload;
	counts: PrChecksCountsPayload;
	checks: PrCheckEntryPayload[];
}

export type PrChecksResult = { type: "ok"; checks: PrChecksPayload } | PrTargetFailureResult;

export interface CollectPrChecksOptions {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	prNumber?: number;
}

export async function collectPrChecks(options: CollectPrChecksOptions): Promise<PrChecksResult> {
	const target = await resolvePrTarget({
		...options,
		detachedHeadMessage: "Detached HEAD: pr-checks requires a checked-out branch or --pr-number.",
	});
	if (target.type === "git_failure") return target;
	if (target.type === "pr_feedback_failure") return target;
	if (target.type === "detached_head") return target;
	if (target.type === "miss") {
		return {
			type: "ok",
			checks: prChecksPayload({ found: false, pr: null, branch: target.branch }),
		};
	}

	const checks = await options.prFeedback.getPrChecks({
		...options.gatewayOptions,
		prNumber: target.pr.number,
	});
	if (!checks.ok) {
		return {
			type: "pr_feedback_failure",
			message: `Failed to fetch checks for PR ${target.pr.number}`,
			failure: checks.error,
		};
	}
	return {
		type: "ok",
		checks: prChecksPayload({
			found: true,
			pr: target.pr,
			branch: target.branch,
			checks: checks.value,
		}),
	};
}

function prChecksPayload(options: {
	readonly found: boolean;
	readonly pr: GithubPrSummary | null;
	readonly branch: string | null;
	readonly checks?: GithubStatusChecks;
}): PrChecksPayload {
	return {
		found: options.found,
		target: buildPrChecksTargetPayload({
			pr: options.pr,
			branch: options.branch,
		}),
		counts: {
			passing: options.checks?.counts.passing ?? 0,
			pending: options.checks?.counts.pending ?? 0,
			failing: options.checks?.counts.failing ?? 0,
			unknown: options.checks?.counts.unknown ?? 0,
			hasMore: options.checks?.counts.hasMore ?? false,
		},
		checks:
			options.checks?.checks.map((check) => ({
				bucket: check.bucket,
				kind: check.kind,
				name: check.name,
				workflow_name: check.workflowName,
				status: check.status,
				conclusion: check.conclusion,
				state: check.state,
				started_at: check.startedAt,
				completed_at: check.completedAt,
				created_at: check.createdAt,
				details_url: check.detailsUrl,
				target_url: check.targetUrl,
				identity: check.identity,
			})) ?? [],
	};
}
