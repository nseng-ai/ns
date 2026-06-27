// THROWAWAY steelthread harness — renderers.
//
// Two representative surfaces:
//   renderObjectiveList  — buffered, minimal/gh chrome (the buffered-list north star)
//   renderFlowSubmit     — streaming, in-place live region with a log-tail
//
// Plus renderMatrix, which stacks the buffered list across every ladder rung so approach
// A vs B can be compared in one screen.

import { setTimeout as sleep } from "node:timers/promises";

import type { Caps, ColorDepth } from "./caps.ts";
import { effectiveDepth } from "./caps.ts";
import type { ObjectiveRow, SubmitFailure, SubmitPhase, SubmittedPr } from "./fixtures.ts";
import { NOW_ISO, OBJECTIVE_ROWS, SUBMIT_FAILURE, SUBMITTED_PRS } from "./fixtures.ts";
import { relativeTime } from "./time.ts";
import {
	bold,
	dim,
	ellipsisFor,
	glyph,
	type Intent,
	paint,
	padPlain,
	ruleChar,
	spinnerFrame,
	treeMarkers,
	truncatePlain,
} from "./theme.ts";

function out(text: string): void {
	process.stdout.write(text);
}

/** caps-aware truncation: ascii mode degrades the ellipsis too. */
function clip(caps: Caps, text: string, width: number): string {
	return truncatePlain(text, width, ellipsisFor(caps));
}

/** Pad a styled cell to `width` using its known plain width, so SGR escapes don't skew layout. */
function padCell(colored: string, plain: string, width: number): string {
	const gap = width - plain.length;
	return gap > 0 ? colored + " ".repeat(gap) : colored;
}

// --- objective list (buffered) ---------------------------------------------

interface StatusCell {
	intent: Intent;
	glyphName: "open" | "done";
	word: string;
}

function statusCellFor(row: ObjectiveRow): StatusCell {
	return row.status === "closed"
		? { intent: "success", glyphName: "done", word: "closed" }
		: { intent: "accent", glyphName: "open", word: "open" };
}

// Candidate treatments for the outstanding-changes marker, to be compared by feel.
export type MarkerStyle = "paren" | "dot" | "label" | "legend";

export const MARKER_STYLES: readonly MarkerStyle[] = ["paren", "dot", "label", "legend"];

// Chosen treatment (by feel, 2026-06-27): a bare `x` marker plus a one-line footer legend.
export const DEFAULT_MARKER: MarkerStyle = "legend";

export function isMarkerStyle(value: string): value is MarkerStyle {
	return (MARKER_STYLES as readonly string[]).includes(value);
}

function markerDot(caps: Caps): string {
	return caps.unicode ? "●" : "*";
}

function markerWidth(caps: Caps, style: MarkerStyle): number {
	switch (style) {
		case "paren":
			return "(x)".length;
		case "legend":
			return "x".length;
		case "label":
			return "changed".length;
		case "dot":
			return markerDot(caps).length;
	}
}

// Returns a cell whose visible width is exactly markerWidth(style) for both states, so dates align.
function markerCell(caps: Caps, style: MarkerStyle, hasChanges: boolean): string {
	const width = markerWidth(caps, style);
	if (!hasChanges) return " ".repeat(width);
	switch (style) {
		case "paren":
			return paint(caps, "warn", "(x)");
		case "legend":
			return paint(caps, "warn", "x");
		case "label":
			return paint(caps, "warn", "changed");
		case "dot":
			return paint(caps, "warn", markerDot(caps));
	}
}

export interface ListOptions {
	marker: MarkerStyle;
}

export function renderObjectiveList(
	caps: Caps,
	rows: readonly ObjectiveRow[],
	opts: ListOptions = { marker: DEFAULT_MARKER },
): string {
	const style = opts.marker;
	const lines: string[] = [];
	const maxSlug = Math.max(...rows.map((r) => r.slug.length), "OBJECTIVE".length);
	const slugW = Math.max(12, Math.min(maxSlug, caps.columns - 28));
	const statusW = "● closed".length; // widest plain status cell
	const flagW = markerWidth(caps, style); // the outstanding-changes flag gets its own spaced column
	const dateW = Math.max(8, caps.columns - slugW - statusW - flagW - 6);

	lines.push(bold("Objective records in this checkout"));
	lines.push(dim(`${rows.length} active  ·  root .sdl/objectives`));
	lines.push("");
	// "LATEST UPDATE" sits above the dates, not the flag gutter; the flag column header is blank.
	lines.push(
		dim(`${padPlain("OBJECTIVE", slugW)}  ${padPlain("STATUS", statusW)}  ${" ".repeat(flagW)}  LATEST UPDATE`),
	);

	for (const row of rows) {
		const slugPlain = clip(caps, row.slug, slugW);
		const slugCell = padPlain(slugPlain, slugW);

		const status = statusCellFor(row);
		const statusGlyph = glyph(caps, status.glyphName);
		const statusColored = `${paint(caps, status.intent, statusGlyph)} ${status.word}`;
		const statusPlain = `${statusGlyph} ${status.word}`;
		const statusCell = padCell(statusColored, statusPlain, statusW);

		const stamp = row.latestUpdateIso === null ? "—" : relativeTime(row.latestUpdateIso, Date.parse(NOW_ISO));
		// The outstanding-changes flag is its own fixed-width column with gaps on both sides, so it
		// reads as a separate marker and the dates stay column-aligned beneath the header.
		const flagCell = markerCell(caps, style, row.hasOutstandingChanges);
		const dateCell = dim(clip(caps, stamp, dateW));

		lines.push(`${slugCell}  ${statusCell}  ${flagCell}  ${dateCell}`);

		const branches = row.updatedBranches ?? [];
		const markers = treeMarkers(caps);
		branches.forEach((branch, index) => {
			const marker = index === branches.length - 1 ? markers.last : markers.tee;
			const branchPlain = clip(caps, `${marker} ${branch}`, caps.columns - 2);
			lines.push(`  ${dim(branchPlain)}`);
		});
	}

	// The legend treatment keeps the marker minimal (a bare `x`) and explains it once below the list.
	if (style === "legend" && rows.some((row) => row.hasOutstandingChanges)) {
		lines.push("");
		lines.push(dim("x = uncommitted changes not yet recorded in an update"));
	}

	return lines.join("\n") + "\n";
}

const MARKER_GALLERY: readonly { style: MarkerStyle; note: string }[] = [
	{ style: "paren", note: "(x) — current baseline" },
	{ style: "dot", note: "warn dot — most compact" },
	{ style: "label", note: "changed — self-explanatory inline word" },
	{ style: "legend", note: "bare x + one-line footer legend (chosen)" },
];

export function renderMarkerGallery(caps: Caps): string {
	const blocks: string[] = [];
	for (const { style, note } of MARKER_GALLERY) {
		blocks.push(dim(ruleChar(caps).repeat(Math.min(caps.columns, 72))));
		blocks.push(`${bold(`marker: ${style}`)}${dim(`   ·   ${note}`)}`);
		blocks.push("");
		blocks.push(renderObjectiveList(caps, OBJECTIVE_ROWS, { marker: style }).replace(/\n$/, ""));
		blocks.push("");
	}
	return blocks.join("\n") + "\n";
}

// --- flow submit (streaming) -----------------------------------------------

const PHASE_NAME_WIDTH = 13;

// Spinner repaint cadence, independent of how long a step actually takes — a long network step
// holds its log-tail line while the spinner keeps ticking at this rate, so it reads as working.
const SPINNER_FRAME_MS = 90;

// Realistic dwell per subprocess line: network round-trips (push / create / update / fetch) linger
// noticeably; local validation is quick. Keeps the stream from flashing past faster than real work.
function lineDwellMs(line: string, tickMs: number): number {
	return /^(?:Pushing|Creating|Updating|Fetching|Submitting)\b/.test(line) ? Math.round(tickMs * 2.6) : tickMs;
}

function phaseDisplayName(phase: SubmitPhase): string {
	const head = phase.key.charAt(0).toUpperCase() + phase.key.slice(1);
	return padPlain(head, PHASE_NAME_WIDTH);
}

type PhaseState = "pending" | "active" | "done" | "skipped" | "failed";

function inPlacePhaseLine(caps: Caps, phase: SubmitPhase, state: PhaseState, tick: number): string {
	const name = phaseDisplayName(phase);
	switch (state) {
		case "done":
			return `  ${paint(caps, "success", glyph(caps, "done"))} ${name} ${dim(phase.done)}`;
		case "active":
			return `  ${paint(caps, "accent", spinnerFrame(caps, tick))} ${bold(name)} ${phase.label}`;
		case "skipped":
			return `  ${paint(caps, "muted", glyph(caps, "skip"))} ${dim(name)} ${dim(phase.done)}`;
		case "failed":
			return `  ${paint(caps, "error", glyph(caps, "fail"))} ${name} ${paint(caps, "error", phase.label)}`;
		case "pending":
			return `  ${dim(glyph(caps, "bullet"))} ${dim(name)} ${dim("pending")}`;
	}
}

function successBlockLines(caps: Caps, prs: readonly SubmittedPr[]): string[] {
	const lines: string[] = ["", bold("Submitted")];
	const branchW = Math.max(...prs.map((p) => p.branch.length));
	for (const pr of prs) {
		const dot = paint(caps, "success", glyph(caps, "open"));
		const branch = padPlain(pr.branch, branchW);
		const num = paint(caps, "accent", `#${pr.number}`);
		const action = pr.action === "created" ? paint(caps, "success", "created") : dim("updated");
		const url = dim(clip(caps, pr.url, Math.max(8, caps.columns - branchW - 24)));
		lines.push(`  ${dot} ${branch}  ${num}  (${action})  ${url}`);
	}
	return lines;
}

// Inside a raw `gt submit` transcript, the `error:`/`fatal:`/`rejected` lines are the actual
// cause; the rest (the destination URL, refspec echoes) are git plumbing. Splitting them lets the
// cause read while the noise recedes.
function isSalientTranscriptLine(line: string): boolean {
	return /\b(?:error|fatal|rejected|denied|abort(?:ed)?)\b/i.test(line);
}

function failureBlockLines(caps: Caps, failure: SubmitFailure): string[] {
	// The summary is the line the user must act on, so it carries the most weight: error color +
	// bold (bold survives mono, so it still stands out when color is gone). Within the transcript,
	// the salient cause lines render at normal foreground weight so they read clearly without piling
	// on more red; only the plumbing noise dims to supporting detail.
	const lines: string[] = ["", paint(caps, "error", bold(`${glyph(caps, "fail")} ${failure.summary}`))];
	for (const line of failure.transcriptTail) {
		const clipped = clip(caps, line, caps.columns - 4);
		lines.push(`    ${isSalientTranscriptLine(line) ? clipped : dim(clipped)}`);
	}
	lines.push(dim(`  full transcript: ${failure.logPath}`));
	return lines;
}

interface FlowSubmitOptions {
	fail: boolean;
	tickMs: number;
}

async function renderInPlace(caps: Caps, phases: readonly SubmitPhase[], opts: FlowSubmitOptions): Promise<void> {
	const states: PhaseState[] = phases.map((p) => (p.skipped ? "skipped" : "pending"));
	let tail: string | null = null;
	let tick = 0;
	let prevLines = 0;

	function frame(): string[] {
		const lines = phases.map((phase, index) => inPlacePhaseLine(caps, phase, states[index] ?? "pending", tick));
		if (tail !== null) lines.push(`       ${dim(clip(caps, tail, caps.columns - 7))}`);
		return lines;
	}

	// Live region redraw. A no-op without motion (non-tty / --static): the loop runs silently
	// and only the settled final frame is emitted once, which is what a pipe or CI log wants.
	function draw(): void {
		if (!caps.motion) return;
		const lines = frame();
		if (prevLines > 0) out(`\x1b[${prevLines}A\x1b[0J`);
		out(lines.join("\n") + "\n");
		prevLines = lines.length;
	}

	// Hold the current frame for ~ms while spinning, so a long network step keeps animating instead
	// of freezing on one spinner glyph. Without motion it collapses to a single settle-draw.
	async function hold(ms: number): Promise<void> {
		if (!caps.motion) {
			draw();
			return;
		}
		const frames = Math.max(1, Math.round(ms / SPINNER_FRAME_MS));
		for (let f = 0; f < frames; f += 1) {
			tick += 1;
			draw();
			await sleep(SPINNER_FRAME_MS);
		}
	}

	if (caps.motion) out("\x1b[?25l"); // hide cursor while we own the region
	try {
		for (let index = 0; index < phases.length; index += 1) {
			const phase = phases[index];
			if (phase === undefined || states[index] === "skipped") continue;
			states[index] = "active";
			const logLines = phase.logLines ?? [];
			if (logLines.length > 0) {
				for (const line of logLines) {
					tail = line;
					await hold(lineDwellMs(line, opts.tickMs));
				}
			} else {
				// Quick local phase (no subprocess output): a brief spin so the name is readable.
				await hold(Math.round(opts.tickMs * 1.4));
			}
			tail = null;
			if (opts.fail && phase.key === SUBMIT_FAILURE.phaseKey) {
				states[index] = "failed";
				draw();
				if (!caps.motion) out(frame().join("\n") + "\n");
				out(failureBlockLines(caps, SUBMIT_FAILURE).join("\n") + "\n");
				return;
			}
			states[index] = "done";
			draw();
		}
		if (!caps.motion) out(frame().join("\n") + "\n"); // settle to one final frame
		out(successBlockLines(caps, SUBMITTED_PRS).join("\n") + "\n");
	} finally {
		if (caps.motion) out("\x1b[?25h"); // restore cursor
	}
}

export async function renderFlowSubmit(
	caps: Caps,
	phases: readonly SubmitPhase[],
	opts: FlowSubmitOptions,
): Promise<void> {
	// In-place is the only streaming presentation: a live region in a TTY, a single settled frame
	// for non-TTY humans (`--static`), and machine `--format json` for CI/scripts at the real layer.
	await renderInPlace(caps, phases, opts);
}

// --- ladder matrix (buffered) ----------------------------------------------

const MATRIX_DEPTHS: readonly ColorDepth[] = ["truecolor", "ansi256", "ansi16", "none"];

export function renderMatrix(base: Caps): string {
	const blocks: string[] = [];
	for (const ladder of ["A", "B"] as const) {
		for (const colorDepth of MATRIX_DEPTHS) {
			const caps: Caps = { ...base, ladder, colorDepth, motion: false };
			const eff = effectiveDepth(caps);
			const note = eff === colorDepth ? "" : `  ->  renders as ${eff}`;
			blocks.push(
				dim(`${ruleChar(caps).repeat(Math.min(caps.columns, 72))}`),
				bold(`ladder ${ladder}   ·   --color ${colorDepth}${note}`),
				"",
				renderObjectiveList(caps, OBJECTIVE_ROWS).replace(/\n$/, ""),
				"",
			);
		}
	}
	return blocks.join("\n") + "\n";
}
