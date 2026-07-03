// Flow-local facade for the `autoslot` workflow's durable outcomes.
//
// `autoslot` (autobranch + slot checkout) reports typed settled facts at the Flow CLI edge, while the
// generic finite block layout lives in `@ji/core/cli-theme` because the repeated shape was proven across
// Flow and CCC. This module keeps autoslot's domain-local type name and owns the mapping from Flow
// outcome facts to that shared layout.

import type { Caps } from "@ji/clinkr";
import { renderResultBlock } from "@ji/core/cli-theme";

/**
 * The visual intent of an autoslot outcome. Distinct from the `SdlCommandIo` notify level (which owns
 * stdout/stderr routing and exit-code flipping): a declined guardrail renders `refusal` (warn) even
 * when it is notified at `error` level to flip the exit code (house-style §7.3).
 */
export type AutoslotResultKind = "success" | "refusal" | "failure";

export interface AutoslotResultBlock {
	kind: AutoslotResultKind;
	/** Leading one-line summary (already-phrased prose); rendered bold + intent-painted with a glyph. */
	headline: string;
	/** The working directory the workflow operated in, shown as dimmed plumbing evidence. */
	cwd: string;
	/** Domain-authored detail (slot target / skip reason / failure cause) at normal weight. */
	body?: string;
	/** Optional normal-weight "what to do next" line (e.g. the copyable `ji slot co <branch>`). */
	guidance?: string;
}

/** Render an autoslot result block to a string, styled and degraded for `caps`. */
export function renderAutoslotResultBlock(caps: Caps, input: AutoslotResultBlock): string {
	return renderResultBlock(caps, input);
}
