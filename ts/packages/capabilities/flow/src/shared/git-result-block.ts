// The caps-aware git/Graphite subprocess result/failure block for finite Flow command outcomes.
//
// The generic headline invariant now lives in `@sdl/clinkr/theme` because the repeated result-block
// shape was proven across Flow and CCC. Git transcript plumbing stays flow-local: this renderer owns
// command/cwd/exit facts, cause-marker mining, refusal stdout detail, and inline stdout/stderr output.
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
import { dim, resultBlockHeadline } from "@sdl/clinkr/theme";
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
	const lines: string[] = [resultBlockHeadline(caps, input)];

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
