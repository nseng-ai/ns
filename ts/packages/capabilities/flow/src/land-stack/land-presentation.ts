// CCC-local facade for the `sdl flow land` CLI surface.
//
// `land` is orchestrated in CCC and reports typed settled outcomes at the CLI edge. The generic
// finite block layout now lives in `@sdl/cli-theme` because the repeated shape was proven across
// Flow and CCC; land keeps this local facade because the Pi command-stream path must remain ANSI-free
// and domain-specific land facts stay in CCC.

import type { Caps } from "@sdl/clinkr";
import {
	bold,
	paint,
	type Intent,
	renderResultBlock,
	renderResultBlockFromMessage,
} from "@sdl/cli-theme";
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
	body?: string;
	/** Optional normal-weight "what to do next" line (e.g. a suggested recovery command). */
	guidance?: string;
	/** Optional working directory / repo root, shown as dimmed plumbing evidence when present. */
	cwd?: string;
}

export interface LandResultMessageBlock {
	kind: LandResultKind;
	/** Domain-authored message whose first line becomes the headline and rest becomes the body. */
	message: string;
	/** Optional normal-weight "what to do next" line (e.g. a suggested recovery command). */
	guidance?: string;
	/** Optional working directory / repo root, shown as dimmed plumbing evidence when present. */
	cwd?: string;
}

/** Render a land result block to a string, styled and degraded for `caps`. */
export function renderLandResultBlock(caps: Caps, input: LandResultBlock): string {
	return renderResultBlock(caps, input);
}

/** Render a domain-authored land message using the shared first-line headline grammar. */
export function renderLandResultBlockFromMessage(
	caps: Caps,
	input: LandResultMessageBlock,
): string {
	return renderResultBlockFromMessage(caps, input);
}

export function renderLandConfirmationDetails(caps: Caps, message: string): string {
	return message
		.split("\n")
		.map((line) => renderLandConfirmationLine(caps, line))
		.join("\n");
}

function renderLandConfirmationLine(caps: Caps, line: string): string {
	const style = landConfirmationLineStyle(line);
	if (style === "headline") return bold(paint(caps, "accent", line));
	if (style === undefined) return line;
	return paint(caps, style, line);
}

/**
 * CLI confirmation previews are finite, pre-confirmation text, so they use the CLI caps-aware palette
 * directly. The Pi command stream has its own RenderTheme-based classifier in `command-stream.ts`
 * because it renders live custom messages inside Pi instead of a Clinkr CLI confirmation prompt.
 */
function landConfirmationLineStyle(line: string): Intent | "headline" | undefined {
	if (line.startsWith("Land ")) return "headline";
	if (line.endsWith(":")) return "accent";
	if (/^\s{2}Chunk \d+\/\d+/.test(line)) return "warn";
	if (/^\s{2}\d+\./.test(line) || /^\s{4}\d+\./.test(line)) return "muted";
	return undefined;
}
