// CCC-local house-style result block for the `sdl flow land` CLI surface (PR 5a seam).
//
// `land` is orchestrated in CCC and reports its settled outcomes through the typed
// `LandStackFailure` / plain-string formatters in `presentation.ts`. Those formatters are shared by
// BOTH delivery surfaces: the Pi slash-command (`registerLandCommand` → `createLandUiCommandIo` →
// `renderCommandStreamMessage`, which applies its own `theme.fg` coloring to ✓/✗/→-prefixed lines)
// and the SDL CLI (`runLandCli` → `createLandCliCommandIo`, which writes plain text to stdout/stderr).
//
// House-style ANSI must therefore reach ONLY the CLI surface: passing pre-styled escapes into Pi's
// `notify`/command-stream path would render raw SGR in the Pi UI and duplicate the Pi renderer's
// coloring. This is the load-bearing land discovery (vs. `autoslot`, which is CLI-only and so could
// wire its CCC-local renderer directly — see `autoslot-presentation.ts`). PR 5a therefore ISOLATES
// this renderer as a pure seam without yet rerouting the live land output; PR 5b threads resolved
// `caps` to the CLI edge (`resolveFlowStreamCaps` → `LandCliInput` → here) and routes the inventoried
// land states through it, leaving the Pi command-stream path untouched.
//
// Renderer grammar is identical to the flow capability's `workflow-result-block.ts` and CCC's
// `autoslot-presentation.ts`: bold + intent-paint + leading glyph headline (house-style §3), concise
// success / detailed failure / first-class warn refusal tiers (§4, §7.3). The repeated grammar across
// three call sites is real duplication, but per the Objective's standing no-extraction rule it stays a
// small CCC-local helper; any future shared-renderer promotion is parked, not in-plan.
//
// Flow capability renderers are NOT importable from CCC (CCC sits below the flow capability, so the
// import would invert the dependency), which is why this lives in CCC next to the land facts it renders.
//
// Normative spec: `.sdl/objectives/cli-ux-north-star/house-style.md`. Pure string builder: takes
// `caps` + typed facts, returns a string, does no I/O and no `process.*` access of its own.

import type { Caps } from "@sdl/clinkr";
import { bold, dim, glyph, paint } from "@sdl/clinkr/theme";
import type { LandResultKind } from "./types.ts";

/**
 * The visual intent of a land outcome (canonical type in `types.ts`). Distinct from the
 * `LandStackFailure` notify level (which owns stdout/stderr routing and exit-code flipping): a
 * declined guardrail renders `refusal` (warn) even when it is notified at `error` level to flip the
 * exit code (house-style §7.3). The inventoried land states map onto these three kinds:
 *   - success: fast-path merge, single-plan / chunked stack success summary, post-landing cleanup done.
 *   - refusal: non-interactive confirmation refusal, cancelled-before-merge, base-branch mismatch,
 *     "nothing to do", post-landing cleanup declined / not-a-managed-slot.
 *   - failure: preflight load failure, merge-loop failure (incl. partial success), slot/submit
 *     pre-merge failures, post-landing free/delete failures, unexpected error.
 */
export type { LandResultKind };

export interface LandResultBlock {
	kind: LandResultKind;
	/** Leading one-line summary (already-phrased prose); rendered bold + intent-painted with a glyph. */
	headline: string;
	/**
	 * Domain-authored detail at normal weight: the plan preview, partial-success "already landed"
	 * list, failure cause + command details, or post-landing cleanup details. Built by the typed
	 * formatters in `presentation.ts`; passed through as-is so this stays a pure layout primitive.
	 */
	body?: string | undefined;
	/** Optional normal-weight "what to do next" line (e.g. a suggested recovery command). */
	guidance?: string | undefined;
	/** Optional working directory / repo root, shown as dimmed plumbing evidence when present. */
	cwd?: string | undefined;
}

/** Render a land result block to a string, styled and degraded for `caps`. */
export function renderLandResultBlock(caps: Caps, input: LandResultBlock): string {
	const lines: string[] = [headlineLine(caps, input)];
	if (input.body !== undefined && input.body !== "") {
		lines.push(input.body.trimEnd());
	}
	if (input.guidance !== undefined && input.guidance !== "") {
		lines.push(input.guidance);
	}
	if (input.cwd !== undefined && input.cwd !== "") {
		lines.push(dim(`Cwd: ${input.cwd}`));
	}
	return lines.join("\n");
}

function headlineLine(caps: Caps, input: LandResultBlock): string {
	switch (input.kind) {
		case "success":
			return bold(paint(caps, "success", `${glyph(caps, "done")} ${input.headline}`));
		case "failure":
			return bold(paint(caps, "error", `${glyph(caps, "fail")} ${input.headline}`));
		case "refusal":
			return bold(paint(caps, "warn", `${glyph(caps, "fail")} ${input.headline}`));
	}
}
