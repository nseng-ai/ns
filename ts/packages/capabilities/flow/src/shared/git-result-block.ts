// The caps-aware "git/Graphite subprocess result/failure block" — the one reusable house-style
// primitive `sdl flow push` exercises (CLI UX North Star, first audited side-effect slice). It renders a
// single success / failure / refusal block for a subprocess and degrades across the caps ladder for free,
// because it is built entirely on the opt-in `@sdl/clinkr/theme` colorizers and glyphs (paint/bold/dim/
// glyph) which already fold truecolor → 256 → 16 → mono and unicode → ascii.
//
// Narrow home by design (the Objective's anti-generalization rule): this lives in flow, not clinkr
// core/theme, until a second side-effect command proves the shape. `flow pull-trunk` — and parts of
// `flow autobranch` / `flow branch-latest-commit` — have the identical need and are the expected next
// consumers; generalize then, not now.
//
// Reference renderer for the FINITE result-block shape in the consolidated house style; the
// normative rules (intent→glyph mapping, success-concise / failure-detailed tiers, refusal kind,
// transcript handling) live in `.sdl/objectives/cli-ux-north-star/house-style.md`.
//
// Three-tier styling (house-style sign-off):
//   - headline: bold + intent-painted, with a leading status glyph;
//   - successful side effects stay concise: headline, human guidance, and dimmed command/cwd evidence;
//   - failure transcript cause lines (error: / fatal: / rejected / not fast-forward / denied) at normal
//     foreground weight;
//   - failure plumbing (command / cwd / exit / killed) and full stdout/stderr transcripts dimmed.

import type { Caps } from "@sdl/clinkr";
import { bold, dim, glyph, paint } from "@sdl/clinkr/theme";
import type { ExecResult } from "sdl-sdk";

interface GitResultFacts {
	/** The leading one-line summary (already-phrased prose); rendered bold + intent-painted. */
	headline: string;
	/** The subprocess command line, shown as dimmed plumbing (e.g. `git push` or `gt trunk`). */
	command: string;
	/** The working directory, shown as dimmed plumbing. */
	cwd: string;
	/** Optional detail or "what to do next" line, rendered at normal weight after the cause/detail. */
	guidance?: string | undefined;
}

export type GitResultBlockInput =
	/** The git/Graphite subprocess succeeded; show a concise green headline plus command/cwd evidence. */
	| ({ kind: "success"; result: ExecResult } & GitResultFacts)
	/** The git/Graphite subprocess (or a preflight command) failed; surface cause lines + transcript. */
	| ({ kind: "failure"; result: ExecResult } & GitResultFacts)
	/** No subprocess failure — a guardrail refused to run git; `detail` carries the porcelain status. */
	| ({ kind: "refusal"; detail: string } & GitResultFacts);

// Lowercased substrings that mark a salient transcript line worth surfacing at normal weight.
const CAUSE_MARKERS = ["error:", "fatal:", "rejected", "not fast-forward", "denied"];

/** Render a git result/failure block to a string, styled and degraded for `caps`. */
export function renderGitResultBlock(caps: Caps, input: GitResultBlockInput): string {
	const lines: string[] = [headlineLine(caps, input)];

	if (input.kind === "failure") {
		lines.push(...causeLines(input.result));
	}
	if (input.kind === "refusal") {
		lines.push(dim("stdout:"), detailBody(input.detail));
	}
	if (input.guidance !== undefined) {
		lines.push(input.guidance);
	}
	lines.push(...plumbingLines(input));
	if (input.kind === "failure") {
		lines.push(...transcriptLines(input.result));
	}

	return lines.join("\n");
}

function headlineLine(caps: Caps, input: GitResultBlockInput): string {
	switch (input.kind) {
		case "success":
			return bold(paint(caps, "success", `${glyph(caps, "done")} ${input.headline}`));
		case "failure":
			return bold(paint(caps, "error", `${glyph(caps, "fail")} ${input.headline}`));
		case "refusal":
			return bold(paint(caps, "warn", `${glyph(caps, "fail")} ${input.headline}`));
	}
}

// Salient transcript lines (matching a cause marker), de-duplicated, at normal foreground weight so the
// real cause reads above the dimmed plumbing. Scans both streams since git splits errors across them.
function causeLines(result: ExecResult): string[] {
	const seen = new Set<string>();
	const causes: string[] = [];
	for (const raw of `${result.stdout}\n${result.stderr}`.split("\n")) {
		const line = raw.trim();
		if (line === "") continue;
		const lower = line.toLowerCase();
		if (!CAUSE_MARKERS.some((marker) => lower.includes(marker))) continue;
		if (seen.has(line)) continue;
		seen.add(line);
		causes.push(line);
	}
	return causes;
}

function plumbingLines(input: GitResultBlockInput): string[] {
	const facts = [`Command: ${input.command}`, `Cwd: ${input.cwd}`];
	if (input.kind === "failure") {
		facts.push(`Exit: ${input.result.code}`, `Killed: ${input.result.killed}`);
	}
	return facts.map((fact) => dim(fact));
}

function transcriptLines(result: ExecResult): string[] {
	return [
		dim("stdout:"),
		dim(formatOutput(result.stdout)),
		dim("stderr:"),
		dim(formatOutput(result.stderr)),
	];
}

// The refusal's porcelain detail is the actionable content (which paths are dirty), so it stays at
// normal weight under a dimmed `stdout:` label rather than being dimmed with the plumbing.
function detailBody(detail: string): string {
	return formatOutput(detail);
}

function formatOutput(output: string): string {
	if (output === "") return "<empty>";
	return output.endsWith("\n") ? output.trimEnd() : output;
}
