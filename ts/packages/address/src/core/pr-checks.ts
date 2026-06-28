import type { GitGateway } from "@sdl/core/git";

import type {
	GithubPrFeedbackFailure,
	GithubPrFeedbackGateway,
	GithubPrSummary,
	GithubStatusChecks,
} from "../api.ts";

import type { GatewayFailure, GatewayOptions } from "./gateways.ts";
import { resolvePrTarget } from "./pr-target.ts";

export interface PrChecksTargetPayload {
	kind: "github_pr";
	pr_number: number | null;
	branch: string | null;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
	head_ref_oid: string | null;
}

export interface PrChecksCountsPayload {
	passing: number;
	pending: number;
	failing: number;
	unknown: number;
	has_more?: boolean | undefined;
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
	target: PrChecksTargetPayload;
	counts: PrChecksCountsPayload;
	checks: PrCheckEntryPayload[];
}

export type PrChecksResult =
	| { type: "ok"; checks: PrChecksPayload }
	| { type: "git_failure"; message: string; failure: GatewayFailure }
	| { type: "pr_feedback_failure"; message: string; failure: GithubPrFeedbackFailure }
	| { type: "detached_head"; message: string };

export interface CollectPrChecksOptions {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	prNumber?: number | undefined;
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
	readonly checks?: GithubStatusChecks | undefined;
}): PrChecksPayload {
	return {
		found: options.found,
		target: {
			kind: "github_pr",
			pr_number: options.pr?.number ?? null,
			branch: options.branch,
			title: options.pr?.title ?? null,
			url: options.pr?.url ?? null,
			head_ref_name: options.pr?.headRefName ?? null,
			base_ref_name: options.pr?.baseRefName ?? null,
			head_ref_oid: options.pr?.headRefOid ?? null,
		},
		counts: {
			passing: options.checks?.counts.passing ?? 0,
			pending: options.checks?.counts.pending ?? 0,
			failing: options.checks?.counts.failing ?? 0,
			unknown: options.checks?.counts.unknown ?? 0,
			...(options.checks?.counts.hasMore === undefined
				? {}
				: { has_more: options.checks.counts.hasMore }),
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
