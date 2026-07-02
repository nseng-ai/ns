// House-style human renderer for `objective list`, built on the @sdl/core/cli-theme display
// primitives (palette / glyphs / width helpers). This is the buffered "north-star" surface from the
// CLI UX design harness, ported onto the real Objective list result.
//
// It is a pure function over an injected `Caps` and `nowMs`, so every rung of the capability ladder
// (truecolor / 256 / 16 / mono) and the relative-time output are deterministic under test. The
// `--format json` machine path keeps the raw ISO stamp; only this human surface relativizes it.

import type { Caps } from "@sdl/clinkr";
import {
	bold,
	dim,
	ellipsisFor,
	glyph,
	paint,
	padCell,
	padPlain,
	treeMarkers,
	truncatePlain,
} from "@sdl/core/cli-theme";
import type { GlyphName, Intent } from "@sdl/core/cli-theme";

import { MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS } from "./list-branch-attribution.ts";
import {
	emptyMessage,
	renderSlugs,
	type ObjectiveListRecord,
	type ObjectiveListResult,
} from "./list-objectives.ts";

/** caps-aware truncation: ascii mode degrades the ellipsis to "..." too. */
function clip(caps: Caps, text: string, width: number): string {
	return truncatePlain(text, width, ellipsisFor(caps));
}

interface StatusCell {
	intent: Intent;
	glyphName: Extract<GlyphName, "open" | "done">;
	word: string;
}

function statusCellFor(record: ObjectiveListRecord): StatusCell {
	return record.status === "closed"
		? { intent: "success", glyphName: "done", word: "closed" }
		: { intent: "accent", glyphName: "open", word: "open" };
}

// Relative time for the human surface ("2 hours ago" beats a raw ISO stamp). `nowMs` is injected so
// output stays stable under test; the json path keeps the ISO.
function ago(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"} ago`;
}

export function relativeTime(iso: string, nowMs: number): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return iso;
	const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return ago(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (hours < 24) return ago(hours, "hour");
	const days = Math.round(hours / 24);
	if (days < 7) return ago(days, "day");
	if (days < 30) return ago(Math.round(days / 7), "week");
	if (days < 365) return ago(Math.round(days / 30), "month");
	return ago(Math.round(days / 365), "year");
}

function subtitle(result: ObjectiveListResult): string {
	const count = result.records.length;
	const noun = count === 1 ? "record" : "records";
	return dim(`${count} ${noun}  ·  filter ${result.statusFilter}  ·  root ${result.rootPath}`);
}

/**
 * Render the Objective list as the house-style human surface.
 *
 * Note on the table primitive: this list interleaves per-row branch-attribution sub-rows (a tree)
 * beneath each record and carries a separate fixed-width outstanding-changes gutter, so it composes
 * from the lower-level cell primitives (paint / glyph / padCell / treeMarkers) rather than the flat
 * `renderTable` — which lays out exactly one line per row. That's a deliberate fit, not a gap.
 */
export function renderObjectiveListPretty(
	result: ObjectiveListResult,
	caps: Caps,
	nowMs: number,
): string {
	if (result.namesOnly) return renderSlugs(result.records);

	const lines: string[] = [bold("Objective records in this checkout"), subtitle(result)];
	if (result.records.length === 0) {
		lines.push("", emptyMessage(result.statusFilter));
		return lines.join("\n");
	}

	const includeBranches = result.updatedBranchesIncluded === true;
	const maxSlug = Math.max(...result.records.map((r) => r.slug.length), "OBJECTIVE".length);
	const slugW = Math.max(12, Math.min(maxSlug, caps.columns - 28));
	const statusW = "X closed".length; // widest plain status cell ("{glyph} closed")
	const flagW = "x".length; // the outstanding-changes flag gets its own spaced column
	const dateW = Math.max(8, caps.columns - slugW - statusW - flagW - 6);

	lines.push("");
	// "LATEST UPDATE" sits above the dates; the flag gutter header stays blank.
	lines.push(
		dim(
			`${padPlain("OBJECTIVE", slugW)}  ${padPlain("STATUS", statusW)}  ${" ".repeat(flagW)}  LATEST UPDATE`,
		),
	);

	for (const record of result.records) {
		const slugCell = padPlain(clip(caps, record.slug, slugW), slugW);

		const status = statusCellFor(record);
		const statusGlyph = glyph(caps, status.glyphName);
		const statusColored = `${paint(caps, status.intent, statusGlyph)} ${status.word}`;
		const statusPlain = `${statusGlyph} ${status.word}`;
		const statusCell = padCell(statusColored, statusPlain, statusW);

		const stamp =
			record.latestUpdateIso === null ? "—" : relativeTime(record.latestUpdateIso, nowMs);
		// A bare `x` warn marker in its own fixed-width column, explained once by the footer legend.
		const flagCell = record.hasOutstandingChanges ? paint(caps, "warn", "x") : " ".repeat(flagW);
		const dateCell = dim(clip(caps, stamp, dateW));

		lines.push(`${slugCell}  ${statusCell}  ${flagCell}  ${dateCell}`);

		if (includeBranches) {
			const branches = record.updatedBranches ?? [];
			const markers = treeMarkers(caps);
			branches.forEach((branch, index) => {
				const marker = index === branches.length - 1 ? markers.last : markers.tee;
				lines.push(`  ${dim(clip(caps, `${marker} ${branch}`, caps.columns - 2))}`);
			});
		}
	}

	if (result.records.some((record) => record.hasOutstandingChanges)) {
		lines.push("", dim("x = uncommitted changes not yet recorded in an update"));
	}
	if (result.updatedBranchesTruncated === true) {
		lines.push(
			"",
			dim(
				`Updated branch attribution limited to newest ${MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS} changed local branches.`,
			),
		);
	}

	return lines.join("\n");
}
