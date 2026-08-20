import type { AutobranchGitGateway } from "./git-gateway.ts";

export type UpstreamHeadState =
	| { type: "no_upstream" }
	| { type: "synchronized"; branch: string; upstream: string }
	| { type: "local_ahead"; upstream: string }
	| { type: "remote_ahead"; upstream: string }
	| { type: "diverged"; upstream: string }
	| { type: "failed"; error: string };

export type GitTrunkResolutionFailure = { type: "missing" } | { type: "error"; error: string };

type SynchronizedTrunkState =
	| { type: "trunk"; trunk: string }
	| { type: "non_trunk"; trunk: string }
	| { type: "unavailable"; failure: GitTrunkResolutionFailure };

type LatestCommitUpstreamEligibility =
	| { type: "eligible" }
	| { type: "synchronized"; upstream: string }
	| { type: "upstream_check_failed"; error: string }
	| { type: "git_trunk_unavailable"; failure: GitTrunkResolutionFailure }
	| { type: "remote_ahead_refusal"; upstream: string }
	| { type: "diverged_upstream_refusal"; upstream: string }
	| {
			type: "synchronized_trunk_refusal";
			branch: string;
			upstream: string;
			trunk: string;
	  };

export interface UpstreamHeadStateInput {
	cwd: string;
	git: AutobranchGitGateway;
}

type LatestCommitUpstreamEligibilityInput = UpstreamHeadStateInput;

export async function inspectUpstreamHeadState(
	input: UpstreamHeadStateInput,
): Promise<UpstreamHeadState> {
	const branch = await input.git.currentBranch();
	if (!branch.ok) return { type: "failed", error: branch.details };
	if (branch.value.type === "detached") {
		return { type: "failed", error: "Git HEAD is detached; no current branch is available." };
	}
	const branchName = branch.value.name;

	const upstream = await input.git.upstreamOf(branchName);
	if (!upstream.ok) return { type: "failed", error: upstream.details };
	const upstreamName = upstream.value;
	if (!upstreamName) return { type: "no_upstream" };

	const relationship = await input.git.headUpstreamRelationship(upstreamName);
	if (!relationship.ok) return { type: "failed", error: relationship.details };

	switch (relationship.value) {
		case "synchronized":
			return { type: "synchronized", branch: branchName, upstream: upstreamName };
		case "local_ahead":
			return { type: "local_ahead", upstream: upstreamName };
		case "remote_ahead":
			return { type: "remote_ahead", upstream: upstreamName };
		case "diverged":
			return { type: "diverged", upstream: upstreamName };
	}
}

export async function inspectLatestCommitUpstreamEligibility(
	input: LatestCommitUpstreamEligibilityInput,
): Promise<LatestCommitUpstreamEligibility> {
	const upstream = await inspectUpstreamHeadState(input);
	switch (upstream.type) {
		case "failed":
			return { type: "upstream_check_failed", error: upstream.error };
		case "remote_ahead":
			return { type: "remote_ahead_refusal", upstream: upstream.upstream };
		case "diverged":
			return { type: "diverged_upstream_refusal", upstream: upstream.upstream };
		case "synchronized": {
			const trunk = await inspectSynchronizedTrunkState({
				branch: upstream.branch,
				git: input.git,
			});
			switch (trunk.type) {
				case "unavailable":
					return { type: "git_trunk_unavailable", failure: trunk.failure };
				case "trunk":
					return {
						type: "synchronized_trunk_refusal",
						branch: upstream.branch,
						upstream: upstream.upstream,
						trunk: trunk.trunk,
					};
				case "non_trunk":
					return { type: "synchronized", upstream: upstream.upstream };
			}
		}
		case "no_upstream":
		case "local_ahead":
			return { type: "eligible" };
	}
}

async function inspectSynchronizedTrunkState(input: {
	branch: string;
	git: AutobranchGitGateway;
}): Promise<SynchronizedTrunkState> {
	const trunk = await input.git.cachedOriginHeadBranch();
	if (trunk.type === "missing") {
		return { type: "unavailable", failure: { type: "missing" } };
	}
	if (trunk.type === "error") {
		return {
			type: "unavailable",
			failure: { type: "error", error: trunk.error.message },
		};
	}
	return input.branch === trunk.value
		? { type: "trunk", trunk: trunk.value }
		: { type: "non_trunk", trunk: trunk.value };
}
