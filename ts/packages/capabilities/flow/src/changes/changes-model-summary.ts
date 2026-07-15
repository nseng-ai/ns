import { normalizeTextOutput } from "@nseng-ai/foundation/text-normalization";

import type { PendingWorktreeSnapshot } from "@nseng-ai/capability-kit/pending-worktree";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";

const CHANGES_SUMMARY_MAX_BULLETS = 4;
const CHANGES_SUMMARY_MAX_TOKENS = 512;
const INVALID_SUMMARY_ERROR =
	'Model returned an invalid changes summary (expected 1–4 "- " bullets, no headers or code fences).';

export const CHANGES_SUMMARY_SYSTEM_PROMPT = `You summarize a coding agent's outstanding worktree changes for a reviewer.

Given git status and diff, output a short bullet summary:
- Output 1 to 4 bullet lines, each starting with "- ".
- No subject line, no "[cp]" prefix, no commit-message format.
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- Group related files into a single bullet instead of listing every file separately.
- Untracked file contents are not provided. Name untracked files only; never claim to have read their contents.
- Optimize for a reviewer scanning the worktree to understand what changed.`;

export function buildChangesUserPrompt(
	snapshot: Pick<PendingWorktreeSnapshot, "branch" | "status" | "diff">,
): string {
	return `Summarize the outstanding changes in this worktree for a reviewer.\n\n## branch\n\n${snapshot.branch}\n\n## git status --porcelain=v1\n\n${snapshot.status.trim() || "(clean)"}\n\n## git diff HEAD\n\n${snapshot.diff.trim() || "(no tracked diff; rely on untracked filenames in status)"}\n`;
}

export function validateChangesSummary(
	output: string,
): { ok: true; summaryText: string } | { ok: false; error: string } {
	const normalized = normalizeChangesSummary(output);
	if (normalized.trim().length === 0) {
		return { ok: false, error: INVALID_SUMMARY_ERROR };
	}

	if (normalized.includes("[cp]")) {
		return { ok: false, error: INVALID_SUMMARY_ERROR };
	}

	const nonEmptyLines = normalized
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim().length > 0);
	if (nonEmptyLines.length === 0) {
		return { ok: false, error: INVALID_SUMMARY_ERROR };
	}
	if (nonEmptyLines.some((line) => line.trim().startsWith("```"))) {
		return { ok: false, error: INVALID_SUMMARY_ERROR };
	}
	if (nonEmptyLines.some((line) => !line.startsWith("- "))) {
		return { ok: false, error: INVALID_SUMMARY_ERROR };
	}
	if (nonEmptyLines.length > CHANGES_SUMMARY_MAX_BULLETS) {
		return { ok: false, error: INVALID_SUMMARY_ERROR };
	}

	return { ok: true, summaryText: nonEmptyLines.join("\n") };
}

export async function draftChangesSummary(input: {
	textGenerator: TextGenerator;
	modelRef: string;
	snapshot: Pick<PendingWorktreeSnapshot, "branch" | "status" | "diff">;
}): Promise<{ ok: true; summaryText: string } | { ok: false; error: string }> {
	const drafted = await input.textGenerator.generateText({
		modelRef: input.modelRef,
		system: CHANGES_SUMMARY_SYSTEM_PROMPT,
		prompt: buildChangesUserPrompt(input.snapshot),
		maxTokens: CHANGES_SUMMARY_MAX_TOKENS,
		reasoning: "low",
		operation: "changes-summary",
	});
	if (!drafted.ok) {
		return { ok: false, error: drafted.error };
	}

	return validateChangesSummary(drafted.text);
}

function normalizeChangesSummary(output: string): string {
	return normalizeTextOutput(output);
}
