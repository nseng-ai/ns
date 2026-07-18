/**
 * Pure, host-agnostic plain-text layer for the `/stack:view` panel: the
 * on-close transcript snapshot. This module does
 * no I/O, spawns no processes, reads no clock/timers, and emits no ANSI — it
 * maps a {@link StackViewModel} to plain strings only. The styled, interactive
 * UI lives in `overlay-ui.ts`.
 *
 * Row ordering follows the model: `model.prs` is top-of-stack first, and the
 * trunk is carried separately on `model.trunk`.
 */
import {
	EXPECTED_GRAPHITE_PENDING_EXPLANATION,
	entriesForCheckBucket,
	formatCheckEntryLabel,
	formatThreadDetailLabel,
	partitionPendingChecks,
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

		const cancelled = entriesForCheckBucket(row.checkEntries, "cancelled");
		if (cancelled.length > 0) {
			lines.push(`  cancelled: ${cancelled.map(formatCheckEntryLabel).join(", ")}`);
		}

		if (row.unresolvedThreads.length > 0) {
			const items = row.unresolvedThreads.map(formatThreadDetailLabel).join("; ");
			const hidden = row.threads.total - row.threads.resolved - row.unresolvedThreads.length;
			const suffix = hidden > 0 ? ` [+${hidden} more]` : "";
			lines.push(`  unresolved: ${items}${suffix}`);
		}

		const pending = partitionPendingChecks(row);
		if (pending.ordinaryCount > 0) {
			const fetched = pending.ordinaryEntries.map(formatCheckEntryLabel).join(", ");
			const missing =
				pending.unaccountedOrdinaryCount > 0
					? `${fetched.length > 0 ? " " : ""}[+${pending.unaccountedOrdinaryCount} not fetched]`
					: "";
			lines.push(`  pending: ${fetched}${missing}`);
		}
		if (pending.expectedEntries.length > 0) {
			lines.push(
				`  expected pending: ${pending.expectedEntries.map(formatCheckEntryLabel).join(", ")} — ${EXPECTED_GRAPHITE_PENDING_EXPLANATION}`,
			);
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

function plainRowMeta(row: StackViewPr): string {
	const parts: string[] = [];
	if (row.threads.total > 0) {
		parts.push(`threads ${row.threads.resolved}/${row.threads.total}`);
	}
	if (row.checks.total > 0) {
		const pending = partitionPendingChecks(row);
		const badges = `${row.checks.passing}✓ ${row.checks.failing}✗ ${pending.ordinaryCount}⋯`;
		const expected = pending.expectedCount > 0 ? ` ${pending.expectedCount} expected` : "";
		const cancelled = row.checks.cancelled > 0 ? ` ${row.checks.cancelled}⊘` : "";
		parts.push(`checks ${badges}${expected}${cancelled}`);
	}
	parts.push(statusWord(row.status));
	return parts.join(", ");
}

/**
 * Format `model.objectivesBySlug` as one `slug (#12, #34)` line per slug, in Map
 * insertion order. Returns an empty array when the map is empty so callers can
 * omit the block entirely.
 */
function objectiveDisplayLines(model: StackViewModel): string[] {
	const lines: string[] = [];
	for (const [slug, numbers] of model.objectivesBySlug) {
		const refs = numbers.map((number) => `#${number}`).join(", ");
		lines.push(refs.length > 0 ? `${slug} (${refs})` : slug);
	}
	return lines;
}
