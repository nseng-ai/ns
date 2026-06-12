import type { CommandResult } from "asdl-dev/checkpoint-flow";

import { formatCommandDetails } from "./shared.ts";

const GIT_TIMEOUT_MS = 30_000;

export type UpstreamHeadState =
	| { type: "no_upstream" }
	| { type: "upstream_contains_head"; upstream: string }
	| { type: "head_not_in_upstream"; upstream: string }
	| { type: "failed"; error: string };

export interface UpstreamHeadStateInput {
	cwd: string;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
}

export async function inspectUpstreamHeadState(input: UpstreamHeadStateInput): Promise<UpstreamHeadState> {
	const branch = await input.exec("git", ["branch", "--show-current"], input.cwd, GIT_TIMEOUT_MS);
	if (branch.code !== 0) {
		return { type: "failed", error: formatCommandDetails(branch) };
	}
	const branchName = firstNonEmptyLine(branch.stdout);
	if (!branchName) {
		return { type: "failed", error: "git branch --show-current returned no branch name." };
	}

	const upstream = await input.exec("git", ["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branchName}`], input.cwd, GIT_TIMEOUT_MS);
	if (upstream.code !== 0) {
		return { type: "failed", error: formatCommandDetails(upstream) };
	}

	const upstreamName = firstNonEmptyLine(upstream.stdout);
	if (!upstreamName) {
		return { type: "no_upstream" };
	}

	const containsHead = await input.exec("git", ["merge-base", "--is-ancestor", "HEAD", upstreamName], input.cwd, GIT_TIMEOUT_MS);
	if (containsHead.code === 0) {
		return { type: "upstream_contains_head", upstream: upstreamName };
	}
	if (containsHead.code === 1) {
		return { type: "head_not_in_upstream", upstream: upstreamName };
	}
	return { type: "failed", error: formatCommandDetails(containsHead) };
}

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}
