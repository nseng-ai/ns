/**
 * pr-previews-specific view helpers: the missing-target message and the narrow
 * inline markdown parser for model-generated check-log summaries. The generic
 * bordered-overlay sizing and detail-pane viewport math live in
 * `../overlay-kit/` (`frame.ts`, `viewport.ts`); import those directly.
 */

export interface PreviewTargetLocator {
	pr_number: number | null;
	branch: string | null;
}

export interface MissingPreviewTargetMessageOptions {
	readonly preferredLocator: "branch" | "pr_number";
}

export function missingPreviewTargetMessage(
	target: PreviewTargetLocator,
	options: MissingPreviewTargetMessageOptions,
): string {
	if (options.preferredLocator === "branch") {
		if (target.branch !== null) return `No open PR found for branch ${target.branch}.`;
		if (target.pr_number !== null) return `No PR found for PR ${target.pr_number}.`;
		return "No open PR found for current branch.";
	}
	if (target.pr_number !== null) return `No PR found for PR ${target.pr_number}.`;
	if (target.branch !== null) return `No open PR found for branch ${target.branch}.`;
	return "No open PR found for the current branch.";
}

export type CheckLogSummaryMarkdownSegment =
	| { kind: "bold"; text: string }
	| { kind: "code"; text: string }
	| { kind: "plain"; text: string };

const CHECK_LOG_SUMMARY_MARKDOWN_PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * Intentionally narrow inline parser for model-generated one-line check log
 * summaries. It recognizes only bold labels and code spans; general markdown
 * rendering stays out of this view helper.
 */
export function parseCheckLogSummaryMarkdownLine(line: string): CheckLogSummaryMarkdownSegment[] {
	const segments: CheckLogSummaryMarkdownSegment[] = [];
	let lastIndex = 0;
	for (const match of line.matchAll(CHECK_LOG_SUMMARY_MARKDOWN_PATTERN)) {
		const matchIndex = match.index;
		if (matchIndex > lastIndex)
			segments.push({ kind: "plain", text: line.slice(lastIndex, matchIndex) });
		const [, bold, code] = match;
		segments.push(
			bold !== undefined ? { kind: "bold", text: bold } : { kind: "code", text: code ?? "" },
		);
		lastIndex = matchIndex + match[0].length;
	}
	if (lastIndex < line.length) segments.push({ kind: "plain", text: line.slice(lastIndex) });
	return segments;
}
