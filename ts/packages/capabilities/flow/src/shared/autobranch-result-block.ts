import type { AutobranchFlowOutcome } from "../autobranch/dirty-worktree.ts";
import type { Caps } from "@sdl/clinkr";
import { renderResultBlock } from "@sdl/core/cli-theme";

interface RenderAutobranchFailureResultBlockOptions {
	caps: Caps;
	outcome: AutobranchFlowOutcome;
	cwd: string;
	error: string;
	refusalHeadline: string;
	failureHeadline: string;
}

export function renderAutobranchFailureResultBlock(
	options: RenderAutobranchFailureResultBlockOptions,
): string {
	const isRefusal = options.outcome === "refusal";
	return renderResultBlock(options.caps, {
		kind: isRefusal ? "refusal" : "failure",
		headline: isRefusal ? options.refusalHeadline : options.failureHeadline,
		cwd: options.cwd,
		body: options.error.trimEnd(),
	});
}
