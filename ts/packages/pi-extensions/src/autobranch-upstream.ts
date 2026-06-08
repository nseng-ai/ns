import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";

import { formatCommandDetails } from "./autobranch-shared.ts";

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
	const upstream = await input.exec("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], input.cwd, GIT_TIMEOUT_MS);
	if (upstream.code !== 0) {
		const details = `${upstream.stdout}\n${upstream.stderr}`.toLowerCase();
		if (upstream.code === 128 || details.includes("no upstream") || details.includes("no tracking") || details.includes("has no upstream")) {
			return { type: "no_upstream" };
		}
		return { type: "failed", error: formatCommandDetails(upstream) };
	}

	const upstreamName = upstream.stdout.trim().split("\n").find((line) => line.trim().length > 0)?.trim();
	if (!upstreamName) {
		return { type: "failed", error: "git rev-parse @{u} returned no upstream branch name." };
	}

	const containsHead = await input.exec("git", ["merge-base", "--is-ancestor", "HEAD", "@{u}"], input.cwd, GIT_TIMEOUT_MS);
	if (containsHead.code === 0) {
		return { type: "upstream_contains_head", upstream: upstreamName };
	}
	if (containsHead.code === 1) {
		return { type: "head_not_in_upstream", upstream: upstreamName };
	}
	return { type: "failed", error: formatCommandDetails(containsHead) };
}
