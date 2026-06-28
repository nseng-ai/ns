// CCC-local house-style result block for the `autoslot` workflow's durable outcomes.
//
// `autoslot` (autobranch + slot checkout) is orchestrated in CCC and reports its settled outcome
// through `CommandIo.notify(...)` — the durable presentation path endorsed by `AGENTS.md`. The
// outcome facts (which of the four states, the created branch, the slot target, the failure cause)
// are computed here in CCC, so the styling lives next to them rather than in the `sdl flow autoslot`
// wrapper, which only sees opaque notify text. This renderer is the CCC-local equivalent of the
// flow capability's `workflow-result-block.ts`: same headline grammar (bold + intent-paint + leading
// glyph, house-style §3) and concise-success / detailed-failure tiers (§4), applied to autoslot's
// domain-authored outcome prose.
//
// Flow capability renderers (`workflow-result-block.ts`, `pending-worktree-result.ts`) are NOT
// importable from CCC — CCC sits below the flow capability, so importing them would invert the
// dependency. Per the Objective's standing no-extraction rule this stays a small CCC-local helper;
// any future promotion to a shared renderer is parked, not in-plan.
//
// Normative spec: `.sdl/objectives/cli-ux-north-star/house-style.md`. Pure string builder: takes
// `caps` + typed facts, returns a string, does no I/O.

import type { Caps } from "@sdl/clinkr";
import { bold, dim, glyph, paint } from "@sdl/clinkr/theme";

/**
 * The visual intent of an autoslot outcome. Distinct from the `CommandIo` notify level (which owns
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
	body?: string | undefined;
	/** Optional normal-weight "what to do next" line (e.g. the copyable `sdl slot co <branch>`). */
	guidance?: string | undefined;
}

/** Render an autoslot result block to a string, styled and degraded for `caps`. */
export function renderAutoslotResultBlock(caps: Caps, input: AutoslotResultBlock): string {
	const lines: string[] = [headlineLine(caps, input)];
	if (input.body !== undefined && input.body !== "") {
		lines.push(input.body.trimEnd());
	}
	if (input.guidance !== undefined && input.guidance !== "") {
		lines.push(input.guidance);
	}
	lines.push(dim(`Cwd: ${input.cwd}`));
	return lines.join("\n");
}

function headlineLine(caps: Caps, input: AutoslotResultBlock): string {
	switch (input.kind) {
		case "success":
			return bold(paint(caps, "success", `${glyph(caps, "done")} ${input.headline}`));
		case "failure":
			return bold(paint(caps, "error", `${glyph(caps, "fail")} ${input.headline}`));
		case "refusal":
			return bold(paint(caps, "warn", `${glyph(caps, "fail")} ${input.headline}`));
	}
}
