/**
 * Pure, host-agnostic render layer for the `/stack:view` panel. Mirrors the
 * grill render module's contract: theme and width primitives are injected as
 * optional-method interfaces with graceful fallbacks, and every emitted line is
 * truncated to the requested width. This module does no I/O, spawns no
 * processes, and reads no clock/timers — it maps a {@link StackViewModel} to
 * strings only.
 *
 * Row ordering follows the model: `model.prs` is top-of-stack first, and the
 * trunk is carried separately on `model.trunk` and rendered as a final,
 * non-selectable row. Selection (`selectedIndex`) indexes `model.prs` only; the
 * trunk row is never focusable.
 */
import type { StackViewModel, StackViewPr, StackViewPrStatus } from "./types.ts";

/** Foreground/background/bold styling hooks; each is optional with a plain fallback. */
export interface StackViewRenderTheme {
	fg?(color: string, text: string): string;
	bg?(color: string, text: string): string;
	bold?(text: string): string;
}

/** Width-aware string primitives; each is optional with an ANSI-stripping fallback. */
export interface StackViewRenderPrimitives {
	truncateToWidth?: (value: string, width: number, ellipsis?: string) => string;
	wrapTextWithAnsi?: (value: string, width: number) => string[];
	visibleWidth?: (value: string) => number;
}

/** Shared inputs for the styled render functions. */
export interface StackViewRenderParams {
	model: StackViewModel;
	selectedIndex: number;
	width: number;
	theme: StackViewRenderTheme;
	primitives?: StackViewRenderPrimitives;
}

interface StackViewRenderContext {
	width: number;
	theme: StackViewRenderTheme;
	primitives: StackViewRenderPrimitives;
}

/** The dim key legend rendered as the last footer line. */
const KEY_LEGEND = "↑/↓ move · o open · s summarize · r refresh · q close";

/**
 * Render one line per PR row (top-of-stack first) followed by the trunk as a
 * final dimmed, non-selectable row. Every line is truncated to `width`.
 */
export function renderStackRows(params: StackViewRenderParams): string[] {
	const context = toContext(params);
	const { model, selectedIndex } = params;
	const lines: string[] = [];

	for (const [index, row] of model.prs.entries()) {
		lines.push(
			renderPrRow(row, index === selectedIndex, row.branch === model.currentBranch, context),
		);
	}
	lines.push(renderTrunkRow(model.trunk, context));

	return lines.map((line) => truncate(line, context.width, context.primitives));
}

/**
 * Render the footer: the selected PR's Graphite URL, an optional objectives
 * block, and the dim key legend. Selection is over PR rows only; a `no-pr` (or
 * out-of-range) selection shows a dim placeholder in place of a URL.
 */
export function renderStackFooter(params: StackViewRenderParams): string[] {
	const context = toContext(params);
	const { model, selectedIndex } = params;
	const { theme } = context;
	const lines: string[] = [];

	const selected = model.prs[selectedIndex];
	if (selected !== undefined && selected.graphiteUrl.length > 0) {
		lines.push(style(theme, "accent", selected.graphiteUrl));
	} else {
		lines.push(style(theme, "dim", "(no Graphite URL for this row)"));
	}

	const objectiveLines = objectiveDisplayLines(model);
	if (objectiveLines.length > 0) {
		lines.push("");
		lines.push(style(theme, "muted", "Objectives:"));
		for (const objectiveLine of objectiveLines) {
			lines.push(`  ${style(theme, "text", objectiveLine)}`);
		}
	}

	lines.push("");
	lines.push(style(theme, "dim", KEY_LEGEND));

	return lines.map((line) => truncate(line, context.width, context.primitives));
}

/**
 * Convenience composition used by the inline UI component: stack rows, a blank
 * spacer, then the footer. Every line is truncated to `width`.
 */
export function renderStackView(params: StackViewRenderParams): string[] {
	const width = Math.max(1, params.width);
	const lines = [...renderStackRows(params), "", ...renderStackFooter(params)];
	return lines.map((line) => truncate(line, width, params.primitives ?? {}));
}

/**
 * Plain-text (no ANSI, no theme) markdown-ish snapshot for the on-close
 * transcript message and the `!hasUI` fallback. Includes a heading with repo +
 * trunk, one line per PR row, an objectives section with per-slug PR
 * attribution, and each PR's Graphite URL.
 */
export function renderPlainSnapshot(model: StackViewModel): string {
	const lines: string[] = [];
	lines.push(`# Stack: ${model.owner}/${model.repo} (trunk: ${model.trunk})`);
	lines.push("");

	for (const row of model.prs) {
		const marker = row.branch === model.currentBranch ? "* " : "- ";
		lines.push(`${marker}${plainRowLabel(row)} — ${plainRowMeta(row)}`);
		lines.push(`  branch: ${row.branch}`);
		if (row.number !== null && row.graphiteUrl.length > 0) {
			lines.push(`  ${row.graphiteUrl}`);
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
		lines.push(`Title: ${plainRowLabel(row)}`);
		lines.push("Description:");
		lines.push("<<<description");
		lines.push(row.body.trim().length > 0 ? row.body.trim() : "(no description)");
		lines.push("description>>>");
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

function toContext(params: StackViewRenderParams): StackViewRenderContext {
	return {
		width: Math.max(1, params.width),
		theme: params.theme,
		primitives: params.primitives ?? {},
	};
}

function renderPrRow(
	row: StackViewPr,
	selected: boolean,
	isCurrent: boolean,
	context: StackViewRenderContext,
): string {
	const { theme, width, primitives } = context;
	const prefix = `${selected ? "▸" : " "} ${isCurrent ? style(theme, "accent", "*") : " "} `;

	const label = selected
		? style(theme, "accent", bold(theme, rowLabel(row)))
		: style(theme, "text", rowLabel(row));

	const badges = rowBadges(row, theme);
	const content = badges.length > 0 ? `${label}  ${badges.join("  ")}` : label;
	const line = `${prefix}${content}`;

	if (!selected) return line;
	return focusStyle(theme, padToWidth(line, width, primitives));
}

function renderTrunkRow(trunk: string, context: StackViewRenderContext): string {
	return `  ${style(context.theme, "dim", `─ ${trunk}`)}`;
}

function rowLabel(row: StackViewPr): string {
	if (row.number === null) return `(no PR) ${row.branch}`;
	return `#${row.number} ${singleLine(row.title)}`;
}

function rowBadges(row: StackViewPr, theme: StackViewRenderTheme): string[] {
	const badges: string[] = [];

	const threadsBadge = threadsBadgeText(row, theme);
	if (threadsBadge !== undefined) badges.push(threadsBadge);

	const checksBadge = checksBadgeText(row, theme);
	if (checksBadge !== undefined) badges.push(checksBadge);

	const status = statusDisplay(row.status);
	badges.push(style(theme, status.color, status.text));

	return badges;
}

function threadsBadgeText(row: StackViewPr, theme: StackViewRenderTheme): string | undefined {
	if (row.threads.total <= 0) return undefined;
	const resolved = row.threads.total - row.threads.resolved <= 0;
	const color = resolved ? "muted" : "warning";
	return style(theme, color, `💬 ${row.threads.resolved}/${row.threads.total}`);
}

function checksBadgeText(row: StackViewPr, theme: StackViewRenderTheme): string | undefined {
	const { passing, failing, pending, total } = row.checks;
	if (total <= 0) return undefined;
	if (failing > 0) return style(theme, "error", `✗ ${failing}/${total}`);
	if (pending > 0) return style(theme, "warning", `⋯ ${pending}/${total}`);
	return style(theme, "success", `✓ ${passing}/${total}`);
}

interface StatusDisplay {
	text: string;
	color: string;
}

function statusDisplay(status: StackViewPrStatus): StatusDisplay {
	switch (status) {
		case "draft":
			return { text: "draft", color: "muted" };
		case "checks-failing":
			return { text: "checks failing", color: "error" };
		case "unresolved":
			return { text: "unresolved", color: "warning" };
		case "ready":
			return { text: "ready", color: "success" };
		case "no-pr":
			return { text: "no-pr", color: "dim" };
	}
}

function plainRowLabel(row: StackViewPr): string {
	if (row.number === null) return `(no PR) ${row.branch}`;
	return `#${row.number} ${singleLine(row.title)}`;
}

function plainRowMeta(row: StackViewPr): string {
	const parts: string[] = [];
	if (row.threads.total > 0) {
		parts.push(`threads ${row.threads.resolved}/${row.threads.total}`);
	}
	if (row.checks.total > 0) {
		parts.push(`checks ${row.checks.passing}✓ ${row.checks.failing}✗ ${row.checks.pending}⋯`);
	}
	parts.push(statusDisplay(row.status).text);
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

function focusStyle(theme: StackViewRenderTheme, text: string): string {
	return theme.bg?.("selectedBg", text) ?? text;
}

function padToWidth(value: string, width: number, primitives: StackViewRenderPrimitives): string {
	const safeWidth = Math.max(0, width);
	const truncated = truncate(value, safeWidth, primitives);
	const padding = safeWidth - visibleWidth(truncated, primitives);
	return padding > 0 ? `${truncated}${" ".repeat(padding)}` : truncated;
}

function truncate(value: string, width: number, primitives: StackViewRenderPrimitives): string {
	const safeWidth = Math.max(0, width);
	if (primitives.truncateToWidth !== undefined) return primitives.truncateToWidth(value, safeWidth);
	if (visibleWidth(value, primitives) <= safeWidth) return value;
	if (safeWidth <= 1) return stripAnsi(value).slice(0, safeWidth);
	return `${stripAnsi(value).slice(0, safeWidth - 1)}…`;
}

function visibleWidth(value: string, primitives: StackViewRenderPrimitives): number {
	return primitives.visibleWidth?.(value) ?? stripAnsi(value).length;
}

function style(theme: StackViewRenderTheme, color: string, text: string): string {
	return theme.fg?.(color, text) ?? text;
}

function bold(theme: StackViewRenderTheme, text: string): string {
	return theme.bold?.(text) ?? text;
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}
