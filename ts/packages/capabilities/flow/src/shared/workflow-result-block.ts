// Flow-local house-style result block for MULTI-STEP workflow side effects whose outcome is a
// domain-authored summary/message string rather than a single git/Graphite `ExecResult`.
//
// `git-result-block.ts` is the reference for finite results backed by ONE subprocess: it mines the
// transcript for cause markers and prints command/exit/transcript plumbing. A workflow like
// `sdl flow branch-latest-commit` runs many subprocesses inside a transaction and reports a single
// settled outcome as already-phrased prose, so per the house style there is no single transcript to
// mine and the failure body is a "direct domain message" (see §7.1). This renderer applies the same
// headline grammar (bold + intent-paint + leading glyph — §3) and the success-concise /
// failure-detailed tiers (§4) to that domain prose.
//
// Normative spec: `.sdl/objectives/cli-ux-north-star/house-style.md`. Flow-local by design (the
// Objective's anti-generalization rule); do not export it beyond the flow capability.

import type { Caps } from "@sdl/clinkr";
import { bold, dim, glyph, paint } from "@sdl/clinkr/theme";

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
	| ({ kind: "failure" } & WorkflowResultFacts);

/** Render a flow workflow result block to a string, styled and degraded for `caps`. */
export function renderWorkflowResultBlock(caps: Caps, input: WorkflowResultBlockInput): string {
	const lines: string[] = [headlineLine(caps, input)];
	if (input.body !== undefined && input.body !== "") {
		lines.push(input.body);
	}
	if (input.guidance !== undefined) {
		lines.push(input.guidance);
	}
	lines.push(dim(`Cwd: ${input.cwd}`));
	return lines.join("\n");
}

function headlineLine(caps: Caps, input: WorkflowResultBlockInput): string {
	switch (input.kind) {
		case "success":
			return bold(paint(caps, "success", `${glyph(caps, "done")} ${input.headline}`));
		case "failure":
			return bold(paint(caps, "error", `${glyph(caps, "fail")} ${input.headline}`));
	}
}
