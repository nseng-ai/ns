// Flow-local facade for MULTI-STEP workflow side effects whose outcome is a domain-authored
// summary/message string rather than a single git/Graphite `ExecResult`.
//
// The generic finite block layout now lives in `@sdl/clinkr/theme` because the repeated shape was
// proven across Flow and CCC. This module keeps the flow-domain input name and documents when to use
// that shared primitive: direct workflow messages with no single transcript to mine.

import type { Caps } from "@sdl/clinkr";
import { renderResultBlock } from "@sdl/clinkr/theme";

interface WorkflowResultFacts {
	/** Leading one-line summary (already-phrased prose); rendered bold + intent-painted with a glyph. */
	headline: string;
	/** The working directory the workflow operated in, shown as dimmed plumbing evidence. */
	cwd: string;
	/** Domain-authored detail (the workflow summary, or the failure cause/recovery text) at normal weight. */
	body?: string | undefined;
	/** Optional normal-weight "what to do next" line rendered after the body. */
	guidance?: string | undefined;
}

export type WorkflowResultBlockInput =
	/** The workflow completed; concise success headline plus the settled summary body. */
	| ({ kind: "success" } & WorkflowResultFacts)
	/** The workflow failed mid-transaction; the domain body carries the cause and recovery guidance. */
	| ({ kind: "failure" } & WorkflowResultFacts)
	/**
	 * A guardrail declined to run the workflow (e.g. a clean worktree, or a latest-commit eligibility
	 * guardrail) — a first-class warn outcome per house-style §7.3, never a red failure. The domain
	 * body carries the actionable reason; `guidance` points to the right command where one exists.
	 */
	| ({ kind: "refusal" } & WorkflowResultFacts);

/** Render a flow workflow result block to a string, styled and degraded for `caps`. */
export function renderWorkflowResultBlock(caps: Caps, input: WorkflowResultBlockInput): string {
	return renderResultBlock(caps, input);
}
