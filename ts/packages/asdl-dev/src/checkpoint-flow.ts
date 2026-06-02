import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCheckpointMessage, formatCheckpointValidationFeedback, validateCheckpointMessage } from "./checkpoint-message.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

export const CHECKPOINT_SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

Given git status and diff, output exactly one git commit message:
- Subject line first, prefixed with "[cp]".
- Subject must be at most 52 characters total. Shorter is better. Use imperative mood with no trailing period.
- Then one blank line.
- Then 1 to 3 bullet lines, each starting with "- ".
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- No Co-Authored-By trailer.
- Mention untracked files by filename when they matter.
- Optimize for later agents scanning git log, not for a polished PR description.`;

export type CommandResult = {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
};

export type CheckpointPromptInput = {
	status: string;
	diff: string;
	previousDraft?: string;
	validationFeedback?: string;
};

export type PreparedCheckpointMessage =
	| { ok: true; message: string; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

export async function prepareCheckpointMessage(input: {
	status: string;
	diff: string;
	textGeneration: TextGenerationGateway;
	modelRef: string;
	maxAttempts?: number;
}): Promise<PreparedCheckpointMessage> {
	const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
	const first = await generateCheckpointText(input.textGeneration, input.modelRef, {
		status: input.status,
		diff: input.diff,
	});
	if (!first.ok) {
		return { ok: false, error: first.error };
	}

	const firstValidation = validateCheckpointMessage(first.text);
	if (firstValidation.ok) {
		return { ok: true, message: formatCheckpointMessage(firstValidation.message), source: "model" };
	}

	const firstFeedback = formatCheckpointValidationFeedback(firstValidation.issues);
	if (maxAttempts <= 1) {
		return invalidAfterAttempts(maxAttempts, firstFeedback);
	}

	const second = await generateCheckpointText(input.textGeneration, input.modelRef, {
		status: input.status,
		diff: input.diff,
		previousDraft: first.text,
		validationFeedback: firstFeedback,
	});
	if (!second.ok) {
		return { ok: false, error: second.error };
	}

	const secondValidation = validateCheckpointMessage(second.text);
	if (secondValidation.ok) {
		return {
			ok: true,
			message: formatCheckpointMessage(secondValidation.message),
			source: "repaired_model",
			feedback: firstFeedback,
		};
	}

	return invalidAfterAttempts(2, formatCheckpointValidationFeedback(secondValidation.issues));
}

export function buildCheckpointUserPrompt(input: CheckpointPromptInput): string {
	const base = `Draft a checkpoint commit message for this pending git state.\n\n## git status --porcelain\n\n${promptBlock(input.status, "(clean)")}\n\n## git diff HEAD\n\n${promptBlock(input.diff, "(no tracked diff; rely on untracked filenames in status)")}\n`;
	if (!input.previousDraft || !input.validationFeedback) {
		return base;
	}
	return `${base}\n## previous invalid draft\n\n${input.previousDraft.trim()}\n\n## validation feedback\n\n${input.validationFeedback}\n\nRewrite the checkpoint message so it satisfies every validation rule. Return only the corrected commit message.\n`;
}

export async function createCommitWithPreparedMessage(input: {
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	cwd: string;
	message: string;
}): Promise<{ summary: string } | { error: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-cp-commit-"));
	try {
		const messagePath = join(tempDir, "message.txt");
		await writeFile(messagePath, `${input.message}\n`, "utf8");

		const add = await input.exec("git", ["add", "-A"], input.cwd, 30_000);
		if (add.code !== 0) {
			return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
		}

		const commit = await input.exec("git", ["commit", "-F", messagePath], input.cwd, 120_000);
		if (commit.code !== 0) {
			return { error: formatCommandError("Checkpoint commit failed.", commit) };
		}

		const log = await input.exec("git", ["log", "-1", "--oneline"], input.cwd, 5_000);
		if (log.code !== 0) {
			return { error: formatCommandError("Created checkpoint commit, but failed to read it back.", log) };
		}

		return { summary: log.stdout.trim() };
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function promptBlock(value: string, emptyPlaceholder: string): string {
	return value.trim().length === 0 ? emptyPlaceholder : value.trimEnd();
}

async function generateCheckpointText(
	textGeneration: TextGenerationGateway,
	modelRef: string,
	input: CheckpointPromptInput,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	return textGeneration.generateText({
		modelRef,
		system: CHECKPOINT_SYSTEM_PROMPT,
		prompt: buildCheckpointUserPrompt(input),
		maxTokens: 512,
		reasoning: "low",
		operation: "checkpoint-message",
	});
}

function invalidAfterAttempts(attempts: number, feedback: string): PreparedCheckpointMessage {
	return {
		ok: false,
		error: `Model produced an invalid checkpoint message after ${attempts} attempt${attempts === 1 ? "" : "s"}.\n${feedback}`,
	};
}

function formatCommandError(summary: string, result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return [summary, details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`].filter(Boolean).join("\n");
}
