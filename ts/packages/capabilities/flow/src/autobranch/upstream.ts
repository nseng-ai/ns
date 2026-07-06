import type { AutobranchGitGateway } from "./git-gateway.ts";

export type UpstreamHeadState =
	| { type: "no_upstream" }
	| { type: "upstream_contains_head"; upstream: string }
	| { type: "head_not_in_upstream"; upstream: string }
	| { type: "failed"; error: string };

export interface UpstreamHeadStateInput {
	cwd: string;
	git: AutobranchGitGateway;
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

	const containsHead = await input.git.isAncestor("HEAD", upstreamName);
	if (!containsHead.ok) {
		return { type: "failed", error: containsHead.details };
	}
	return containsHead.value
		? { type: "upstream_contains_head", upstream: upstreamName }
		: { type: "head_not_in_upstream", upstream: upstreamName };
}
