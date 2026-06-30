import type { GitGateway } from "@sdl/git";

import type { GithubPrFeedbackFailure, GithubPrFeedbackGateway, GithubPrSummary } from "../api.ts";

import type { GatewayFailure, GatewayOptions } from "./gateways.ts";

export type PrTargetResolution =
	| { type: "found"; pr: GithubPrSummary; branch: string | null }
	| { type: "miss"; prNumber: number | null; branch: string | null; stderr: string }
	| { type: "git_failure"; message: string; failure: GatewayFailure }
	| { type: "pr_feedback_failure"; message: string; failure: GithubPrFeedbackFailure }
	| { type: "detached_head"; message: string };

export interface ResolvePrTargetOptions {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	prNumber?: number;
	detachedHeadMessage: string;
}

export async function resolvePrTarget(
	options: ResolvePrTargetOptions,
): Promise<PrTargetResolution> {
	if (options.prNumber !== undefined) {
		const lookup = await options.prFeedback.getPr({
			...options.gatewayOptions,
			prNumber: options.prNumber,
		});
		if (!lookup.ok) {
			return {
				type: "pr_feedback_failure",
				message: `Failed to look up PR ${options.prNumber}`,
				failure: lookup.error,
			};
		}
		if (!lookup.value.found) {
			return {
				type: "miss",
				prNumber: options.prNumber,
				branch: null,
				stderr: lookup.value.miss.stderr,
			};
		}
		return { type: "found", pr: lookup.value.pr, branch: null };
	}

	const branch = await options.git.currentBranch(options.gatewayOptions);
	if (branch.type === "failure") {
		return {
			type: "git_failure",
			message: "Failed to determine current branch",
			failure: branch.error,
		};
	}
	if (branch.type === "detached") {
		return { type: "detached_head", message: options.detachedHeadMessage };
	}

	const lookup = await options.prFeedback.getPrForBranch({
		...options.gatewayOptions,
		branch: branch.branch,
	});
	if (!lookup.ok) {
		return {
			type: "pr_feedback_failure",
			message: `Failed to look up PR for branch ${branch.branch}`,
			failure: lookup.error,
		};
	}
	if (!lookup.value.found) {
		return {
			type: "miss",
			prNumber: null,
			branch: branch.branch,
			stderr: lookup.value.miss.stderr,
		};
	}
	return { type: "found", pr: lookup.value.pr, branch: branch.branch };
}
