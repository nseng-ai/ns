import { commandSucceeded } from "@nseng-ai/foundation/command";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import type { AutobranchGitGateway } from "./git-gateway.ts";
import { formatAutobranchCommandDetails, type AutobranchExec } from "./shared.ts";

const GT_TIMEOUT_MS = 120_000;

export type UpstreamHeadState =
	| { type: "no_upstream" }
	| { type: "synchronized"; branch: string; upstream: string }
	| { type: "local_ahead"; upstream: string }
	| { type: "remote_ahead"; upstream: string }
	| { type: "diverged"; upstream: string }
	| { type: "failed"; error: string };

type SynchronizedTrunkState =
	| { type: "trunk"; trunk: string }
	| { type: "non_trunk"; trunk: string }
	| { type: "failed"; error: string };

type LatestCommitUpstreamEligibility =
	| { type: "eligible" }
	| { type: "synchronized"; upstream: string }
	| { type: "upstream_check_failed"; error: string }
	| { type: "graphite_trunk_check_failed"; error: string }
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

interface LatestCommitUpstreamEligibilityInput extends UpstreamHeadStateInput {
	exec: AutobranchExec;
}

export async function inspectUpstreamHeadState(
	input: UpstreamHeadStateInput,
): Promise<UpstreamHeadState> {
	const branch = await input.git.currentBranch();
	if (!branch.ok) {
		return { type: "failed", error: branch.details };
	}
	const branchName = branch.value;
	if (!branchName) {
		return { type: "failed", error: "git branch --show-current returned no branch name." };
	}

	const upstream = await input.git.upstreamOf(branchName);
	if (!upstream.ok) {
		return { type: "failed", error: upstream.details };
	}

	const upstreamName = upstream.value;
	if (!upstreamName) {
		return { type: "no_upstream" };
	}

	const headIsAncestor = await input.git.isAncestor("HEAD", upstreamName);
	if (!headIsAncestor.ok) {
		return {
			type: "failed",
			error: formatAncestryProbeFailure("HEAD", upstreamName, headIsAncestor.details),
		};
	}
	const upstreamIsAncestor = await input.git.isAncestor(upstreamName, "HEAD");
	if (!upstreamIsAncestor.ok) {
		return {
			type: "failed",
			error: formatAncestryProbeFailure(upstreamName, "HEAD", upstreamIsAncestor.details),
		};
	}

	if (headIsAncestor.value && upstreamIsAncestor.value) {
		return { type: "synchronized", branch: branchName, upstream: upstreamName };
	}
	if (upstreamIsAncestor.value) {
		return { type: "local_ahead", upstream: upstreamName };
	}
	if (headIsAncestor.value) {
		return { type: "remote_ahead", upstream: upstreamName };
	}
	return { type: "diverged", upstream: upstreamName };
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
				exec: input.exec,
			});
			switch (trunk.type) {
				case "failed":
					return { type: "graphite_trunk_check_failed", error: trunk.error };
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
	exec: AutobranchExec;
}): Promise<SynchronizedTrunkState> {
	const result = await input.exec("gt", ["trunk", "--no-interactive"], GT_TIMEOUT_MS);
	if (!commandSucceeded(result)) {
		return { type: "failed", error: formatAutobranchCommandDetails(result) };
	}
	const trunk = firstNonEmptyLine(result.stdout);
	if (trunk === undefined) {
		return { type: "failed", error: "gt trunk --no-interactive returned no branch name." };
	}
	return input.branch === trunk ? { type: "trunk", trunk } : { type: "non_trunk", trunk };
}

function formatAncestryProbeFailure(ancestor: string, descendant: string, details: string): string {
	return `git merge-base --is-ancestor ${ancestor} ${descendant} failed.\n${details}`;
}
