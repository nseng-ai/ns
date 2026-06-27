// Per-phase status line grammar for clinkr's streaming surface. A status line is one composed row that
// reports where a single phase stands (pending → active → done/skipped/failed). This module is a PURE
// string builder: it owns the glyph/color/indent grammar for each state but no sequencing, no timers,
// and no I/O. The streaming sink advances `tick` and composes whole frames from these lines.
//
// Generalized from the throwaway harness's `inPlacePhaseLine`, decoupled from any flow-specific phase
// type: it takes a small `StatusLineItem` (name + two presentational texts) rather than a `SubmitPhase`.

import type { Caps } from "../caps.ts";
import { glyph, spinnerFrame } from "./glyphs.ts";
import { bold, dim, paint } from "./palette.ts";
import { padPlain } from "./text.ts";

/** Column width the phase name is padded to, so glyphs and trailing text align across phases. */
export const PHASE_NAME_WIDTH = 13;

/** Lifecycle of a single phase. The sink picks the state; this module renders it. */
export type PhaseState = "pending" | "active" | "done" | "skipped" | "failed";

/**
 * The presentational payload for one phase line.
 *
 * `detail` is the SETTLED text (shown once the phase reaches done/skipped). `label` is the optional
 * IN-FLIGHT text (shown while active, and as the cause when failed). When `label` is omitted the line
 * reuses `detail`, so an item that does not distinguish the two reads correctly in every state.
 */
export interface StatusLineItem {
	name: string;
	detail: string;
	label?: string;
}

export interface StatusLineOptions {
	caps: Caps;
	item: StatusLineItem;
	state: PhaseState;
	/** Selects the spinner frame for the active state; ignored otherwise. */
	tick?: number;
}

/**
 * Render the status line for `item` in `state`. `tick` selects the spinner frame for the active state
 * (ignored otherwise) and defaults to the first frame. Pure: returns the composed line, writes nothing.
 */
export function statusLine(options: StatusLineOptions): string {
	const { caps, item, state, tick = 0 } = options;
	const name = padPlain(item.name, PHASE_NAME_WIDTH);
	// In-flight/failure text falls back to the settled detail when no distinct label is supplied.
	const label = item.label ?? item.detail;
	switch (state) {
		case "done":
			return `  ${paint(caps, "success", glyph(caps, "done"))} ${name} ${dim(item.detail)}`;
		case "active":
			return `  ${paint(caps, "accent", spinnerFrame(caps, tick))} ${bold(name)} ${label}`;
		case "skipped":
			return `  ${paint(caps, "muted", glyph(caps, "skip"))} ${dim(name)} ${dim(item.detail)}`;
		case "failed":
			return `  ${paint(caps, "error", glyph(caps, "fail"))} ${name} ${paint(caps, "error", label)}`;
		case "pending":
			return `  ${dim(glyph(caps, "bullet"))} ${dim(name)} ${dim("pending")}`;
	}
}
