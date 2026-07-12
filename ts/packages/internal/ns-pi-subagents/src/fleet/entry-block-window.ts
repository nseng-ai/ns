/**
 * Variable-height entry-block windowing for the fleet navigator list.
 *
 * Blocks are whole rendered entries (one line collapsed, several lines
 * expanded). The window always contains the selected block and grows by whole
 * blocks until the viewport budget is exhausted. Omitted blocks are summarized
 * by marker rows (`… N earlier` / `… N more`) that consume viewport budget
 * like any other row.
 */

interface EntryBlockRange {
	start: number;
	end: number;
}

/**
 * Windows `blocks` around `selectedIndex` into at most `rows` output lines.
 *
 * Growth policy: upward growth wins whenever both directions would fit.
 * Selection tends to move downward through the list, so preserving nearby
 * earlier context keeps the reader oriented; this preference is intentional,
 * not an artifact of candidate ordering. Downward growth is used when upward
 * cannot fit (or the top boundary is reached), and growth stops when neither
 * direction fits.
 *
 * Two output paths are distinguishable below:
 * - fitted range: the grown range satisfies the fit invariant, so its rows are
 *   emitted between markers without truncation;
 * - oversized selected block: growth never accepted a candidate and the
 *   selected block alone exceeds the budget, so it is deliberately truncated
 *   (see {@link oversizedSelectedBlockRows}).
 */
export function windowEntryBlocks(
	blocks: readonly (readonly string[])[],
	selectedIndex: number,
	rows: number,
): string[] {
	const safeRows = Math.max(1, rows);
	const range = growFittedRange(blocks, selectedIndex, safeRows);
	const prefix = range.start > 0 ? [`… ${range.start} earlier`] : [];
	const suffix = range.end < blocks.length ? [`… ${blocks.length - range.end} more`] : [];
	const availableBlockRows = safeRows - prefix.length - suffix.length;
	const selectedBlock = blocks[selectedIndex] ?? [];
	const visibleRows = blocks.slice(range.start, range.end).flat();
	if (visibleRows.length <= availableBlockRows) {
		// Fitted range: the growth invariant proved these rows fit alongside
		// the markers, so no defensive truncation is needed.
		return [...prefix, ...visibleRows, ...suffix];
	}
	return oversizedSelectedBlockRows({
		selectedBlock,
		prefix,
		suffix,
		availableBlockRows,
		safeRows,
	});
}

/**
 * Grows the window from the selected block, preferring upward growth and
 * accepting a candidate only when {@link entryBlockWindowLineCount} fits the
 * viewport budget. The initial single-block range is never validated here: an
 * oversized selected block is handled by the caller's fallback path.
 */
function growFittedRange(
	blocks: readonly (readonly string[])[],
	selectedIndex: number,
	safeRows: number,
): EntryBlockRange {
	let start = selectedIndex;
	let end = selectedIndex + 1;
	const fits = (candidate: EntryBlockRange): boolean =>
		entryBlockWindowLineCount(blocks, candidate.start, candidate.end) <= safeRows;
	while (true) {
		if (start > 0 && fits({ start: start - 1, end })) {
			start -= 1;
			continue;
		}
		if (end < blocks.length && fits({ start, end: end + 1 })) {
			end += 1;
			continue;
		}
		return { start, end };
	}
}

/**
 * Fallback for a selected block larger than the remaining viewport budget.
 * With at least one block row left after marker accounting, the selected block
 * is truncated to that budget and the markers are kept. With no block row
 * left, the markers are omitted entirely and the selected block is truncated
 * to the full viewport: showing the selection beats showing omission counts.
 */
function oversizedSelectedBlockRows(input: {
	selectedBlock: readonly string[];
	prefix: readonly string[];
	suffix: readonly string[];
	availableBlockRows: number;
	safeRows: number;
}): string[] {
	if (input.availableBlockRows < 1) return [...input.selectedBlock.slice(0, input.safeRows)];
	return [
		...input.prefix,
		...input.selectedBlock.slice(0, input.availableBlockRows),
		...input.suffix,
	];
}

/**
 * Total viewport rows a candidate range would consume: its block rows plus the
 * prefix/suffix marker rows the range would require. Marker rows deliberately
 * count against the same budget as block rows.
 */
export function entryBlockWindowLineCount(
	blocks: readonly (readonly string[])[],
	start: number,
	end: number,
): number {
	const blockRows = blocks.slice(start, end).reduce((total, block) => total + block.length, 0);
	return blockRows + (start > 0 ? 1 : 0) + (end < blocks.length ? 1 : 0);
}
