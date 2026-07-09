/**
 * Pure, host-agnostic plain-text layer for the `/stack:view` panel: the
 * on-close transcript snapshot and the opt-in summary prompt. This module does
 * no I/O, spawns no processes, reads no clock/timers, and emits no ANSI — it
 * maps a {@link StackViewModel} to plain strings only. The styled, interactive
 * UI lives in `overlay-ui.ts`.
 *
 * Row ordering follows the model: `model.prs` is top-of-stack first, and the
 * trunk is carried separately on `model.trunk`.
 */
import { buildFencedTextBlock } from "@nseng-ai/foundation/primitives";

import {
	collapseWhitespace,
	entriesForCheckBucket,
	formatCheckEntryLabel,
	formatThreadDetailLabel,
	stackRowLabel,
	statusWord,
} from "./format.ts";
import type { StackViewModel, StackViewPr } from "./types.ts";

/**
 * Plain-text (no ANSI, no theme) markdown-ish snapshot for the on-close
 * transcript message and the `!hasUI` fallback. Includes a heading with repo +
 * trunk, one line per PR row, each PR's Graphite URL, per-row detail lines for
 * failing/unresolved/pending items (mirroring the overlay's detail pane), and
 * an objectives section with per-slug PR attribution.
 */
export function renderPlainSnapshot(model: StackViewModel): string {
	const lines: string[] = [];
	lines.push(`# Stack: ${model.owner}/${model.repo} (trunk: ${model.trunk})`);
	lines.push("");

	for (const row of model.prs) {
		const marker = row.branch === model.currentBranch ? "* " : "- ";
		lines.push(`${marker}${stackRowLabel(row)} — ${plainRowMeta(row)}`);
		lines.push(`  branch: ${row.branch}`);
		if (row.number !== null && row.graphiteUrl.length > 0) {
			lines.push(`  ${row.graphiteUrl}`);
		}

		const failing = entriesForCheckBucket(row.checkEntries, "failing");
		if (failing.length > 0) {
			lines.push(`  failing: ${failing.map(formatCheckEntryLabel).join(", ")}`);
		}

		if (row.unresolvedThreads.length > 0) {
			const items = row.unresolvedThreads.map(formatThreadDetailLabel).join("; ");
			const hidden = row.threads.total - row.threads.resolved - row.unresolvedThreads.length;
			const suffix = hidden > 0 ? ` [+${hidden} more]` : "";
			lines.push(`  unresolved: ${items}${suffix}`);
		}

		const pending = entriesForCheckBucket(row.checkEntries, "pending");
		if (pending.length > 0) {
			lines.push(`  pending: ${pending.map(formatCheckEntryLabel).join(", ")}`);
		}
	}
	lines.push(`- ─ trunk: ${model.trunk}`);

	const objectiveLines = objectiveDisplayLines(model);
	if (objectiveLines.length > 0) {
		lines.push("");
		lines.push("## Objectives");
		for (const objectiveLine of objectiveLines) {
			lines.push(`- ${objectiveLine}`);
		}
	}

	return lines.join("\n");
}

/**
 * Build the user-turn instruction injected when the user presses `s`. Written as
 * an instruction TO the agent, and self-contained: the agent reading it has no
 * other stack context. PRs are emitted bottom-up (nearest-trunk first) because
 * `model.prs` is top-first and a stack summary reads most naturally from the
 * base up.
 */
export function buildSummaryPrompt(model: StackViewModel): string {
	const bottomUp = [...model.prs].reverse();
	const lines: string[] = [];

	lines.push("Write a concise summary of the Graphite pull-request stack described below.");
	lines.push("Base your summary on each PR's own description text; do not speculate beyond it.");
	lines.push(
		"Read the PRs in the order given (bottom-up: nearest the trunk first), then produce a short overall narrative followed by a one-line-per-PR breakdown.",
	);
	lines.push("Also mention which objectives this stack edits (listed at the end).");
	lines.push("");
	lines.push(`Stack: ${model.owner}/${model.repo} (trunk: ${model.trunk})`);
	lines.push(`PRs, bottom-up (${bottomUp.length} total):`);
	lines.push("");

	bottomUp.forEach((row, index) => {
		lines.push(`## PR ${index + 1} of ${bottomUp.length}`);
		lines.push(`Branch: ${row.branch}`);
		lines.push(`Title: ${summaryPrTitle(row)}`);
		lines.push("Description:");
		lines.push(
			buildFencedTextBlock(row.body.trim().length > 0 ? row.body.trim() : "(no description)"),
		);
		lines.push("");
	});

	lines.push("Objectives edited by this stack:");
	const objectiveLines = objectiveDisplayLines(model);
	if (objectiveLines.length === 0) {
		lines.push("- None recorded.");
	} else {
		for (const objectiveLine of objectiveLines) {
			lines.push(`- ${objectiveLine}`);
		}
	}

	return lines.join("\n");
}

function plainRowMeta(row: StackViewPr): string {
	const parts: string[] = [];
	if (row.threads.total > 0) {
		parts.push(`threads ${row.threads.resolved}/${row.threads.total}`);
	}
	if (row.checks.total > 0) {
		parts.push(`checks ${row.checks.passing}✓ ${row.checks.failing}✗ ${row.checks.pending}⋯`);
	}
	parts.push(statusWord(row.status));
	return parts.join(", ");
}

/**
 * Format `model.objectivesBySlug` as one `slug (#12, #34)` line per slug, in Map
 * insertion order. Returns an empty array when the map is empty so callers can
 * omit the block entirely.
 */
function summaryPrTitle(row: StackViewPr): string {
	if (row.number === null) return `(no PR) ${row.branch}`;
	return `#${row.number} ${collapseWhitespace(row.title)}`;
}

function objectiveDisplayLines(model: StackViewModel): string[] {
	const lines: string[] = [];
	for (const [slug, numbers] of model.objectivesBySlug) {
		const refs = numbers.map((number) => `#${number}`).join(", ");
		lines.push(refs.length > 0 ? `${slug} (${refs})` : slug);
	}
	return lines;
}
