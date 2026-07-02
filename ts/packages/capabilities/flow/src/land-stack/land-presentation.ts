// Flow-local facade for the `sdl flow land` CLI surface.
//
// `land` reports typed settled outcomes at the Flow CLI edge. The generic finite block layout now
// lives in `@sdl/core/cli-theme` because the repeated shape was proven across Flow and CCC; land keeps this
// local facade because the Pi command-stream path must remain ANSI-free and domain-specific land facts
// stay in Flow/Land-owned code.

import type { Caps } from "@sdl/clinkr";
import { bold, paint, renderResultBlock, renderResultBlockFromMessage } from "@sdl/core/cli-theme";
import type { LandConfirmationPreview, LandResultKind } from "./types.ts";

/**
 * The visual intent of a land outcome (canonical type in `types.ts`). Distinct from the
 * `LandStackFailure` notify level (which owns stdout/stderr routing and exit-code flipping): a
 * declined guardrail renders `refusal` (warn) even when it is notified at `error` level to flip the
 * exit code (house-style §7.3). The inventoried land states map onto these three kinds:
 *   - success: fast-path merge, stack success summary, post-landing cleanup done.
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

export function renderPlainLandConfirmationDetails(input: LandConfirmationPreview): string {
	return buildConfirmationLines(input, plainConfirmationStyle()).join("\n");
}

export function renderLandConfirmationDetails(caps: Caps, input: LandConfirmationPreview): string {
	return buildConfirmationLines(input, styledConfirmationStyle(caps)).join("\n");
}

interface ConfirmationLineStyle {
	headline(text: string): string;
	section(text: string): string;
	bulletPrefix(text: string): string;
	planLabel(text: string): string;
	guidance(text: string): string;
}

function plainConfirmationStyle(): ConfirmationLineStyle {
	return {
		headline: identity,
		section: identity,
		bulletPrefix: identity,
		planLabel: identity,
		guidance: identity,
	};
}

function styledConfirmationStyle(caps: Caps): ConfirmationLineStyle {
	return {
		headline: (text) => bold(paint(caps, "accent", text)),
		section: (text) => paint(caps, "accent", text),
		bulletPrefix: (text) => paint(caps, "accent", text),
		planLabel: (text) => paint(caps, "muted", text),
		guidance: (text) => paint(caps, "success", text),
	};
}

function identity(text: string): string {
	return text;
}

function buildConfirmationLines(
	input: LandConfirmationPreview,
	style: ConfirmationLineStyle,
): string[] {
	const labelWidth = confirmationPlanLabelWidth(input);
	return [
		style.headline(input.headline),
		"",
		style.section("Impact"),
		...input.impactLines.map((line) => `${style.bulletPrefix("  •")} ${line}`),
		"",
		style.section("Plan"),
		...input.planRows.map((row) => renderConfirmationPlanRow(row, labelWidth, style)),
		"",
		style.guidance(input.guidance),
	];
}

function confirmationPlanLabelWidth(input: LandConfirmationPreview): number {
	return input.planRows.reduce((width, row) => Math.max(width, row.label.length), 0);
}

function renderConfirmationPlanRow(
	row: LandConfirmationPreview["planRows"][number],
	labelWidth: number,
	style: ConfirmationLineStyle,
): string {
	return `${style.planLabel(`  ${row.label.padEnd(labelWidth)}`)}  ${row.value}`;
}
