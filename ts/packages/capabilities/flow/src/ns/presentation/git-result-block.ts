// The caps-aware git/Graphite subprocess result/failure block for finite Flow command outcomes.
//
// The generic headline invariant now lives in `@nseng-ai/foundation/cli-theme` because the repeated result-block
// shape was proven across Flow and CCC. Git transcript plumbing stays flow-local: this renderer owns
// command/cwd/exit facts, cause-marker mining, refusal stdout detail, and inline stdout/stderr output.
//
// Reference renderer for the FINITE result-block shape in the consolidated house style; the
// normative rules (intent→glyph mapping, success-concise / failure-detailed tiers, refusal kind,
// transcript handling) live in `.ns/objectives/cli-ux-north-star/house-style.md`.
//
// Three-tier styling (house-style sign-off):
//   - headline: bold + intent-painted, with a leading status glyph;
//   - successful side effects stay concise: headline, human guidance, and dimmed command/cwd evidence;
//   - failure transcript cause lines (documented by CAUSE_MARKERS below) at normal foreground weight;
//   - failure plumbing (command / cwd / exit, and killed when true) and full stdout/stderr transcripts
//     dimmed.

import type { Caps } from "@nseng-ai/clinkr";
import { dim, resultBlockHeadline } from "@nseng-ai/foundation/cli-theme";
import type { ExecResult } from "@nseng-ai/kernel/sdk";

type GitTranscriptResult = ExecResult;

interface GitResultFacts {
	/** The leading one-line summary (already-phrased prose); rendered bold + intent-painted. */
	headline: string;
	/** The subprocess command line, shown as dimmed plumbing (e.g. `git push` or `gt trunk`). */
	command: string;
	/** The working directory, shown as dimmed plumbing. */
	cwd: string;
	/** Optional detail or "what to do next" line, rendered at normal weight after the cause/detail. */
	guidance?: string;
}

export type GitResultBlockInput =
	/** The git/Graphite subprocess succeeded; show a concise green headline plus command/cwd evidence. */
	| ({ kind: "success"; result: GitTranscriptResult } & GitResultFacts)
	/** The git/Graphite subprocess (or a preflight command) failed; surface cause lines + transcript. */
	| ({ kind: "failure"; result: GitTranscriptResult } & GitResultFacts)
	/** No subprocess failure — a guardrail refused to run git; `detail` carries the porcelain status. */
	| ({ kind: "refusal"; detail: string } & GitResultFacts);

// Lowercased substrings that mark a salient transcript line worth surfacing at normal weight.
// The broad `denied` marker predates this list and is kept for compatibility with push/pull failures.
const CAUSE_MARKERS = [
	"error:",
	"fatal:",
	"rejected",
	"not fast-forward",
	"denied",
	"permission denied",
	"could not resolve",
	"authentication failed",
];

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
function causeLines(result: GitTranscriptResult): string[] {
	const seen = new Set<string>();
	const causes: string[] = [];
	for (const raw of normalizeNewlines(`${result.stdout}\n${result.stderr}`).split("\n")) {
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
		facts.push(`Termination: ${terminationText(input.result)}`);
	}
	return facts.map((fact) => dim(fact));
}

function terminationText(result: GitTranscriptResult): string {
	switch (result.type) {
		case "spawn-failed":
			return `spawn failed: ${result.error}`;
		case "cancelled":
			return "cancelled";
		case "timed-out":
			return "timed out";
		case "exited":
			return result.signal === null
				? `exit ${result.code}`
				: `signal ${result.signal} (exit ${result.code})`;
	}
}

function transcriptLines(result: GitTranscriptResult): string[] {
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
	const normalized = normalizeNewlines(output);
	if (normalized === "") return "<empty>";
	return normalized.endsWith("\n") ? normalized.trimEnd() : normalized;
}

function normalizeNewlines(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
