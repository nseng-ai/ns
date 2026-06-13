import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCheckpointMessage, formatCheckpointValidationFeedback, validateCheckpointMessage } from "./checkpoint-message.ts";
import type { TextGenerationGateway } from "./text-generation.ts";
import { prepareRepairedText } from "./text-repair.ts";

export const CHECKPOINT_SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

Given git status and diff, output exactly one git commit message:
- Subject line first, prefixed with "[cp]".
- Subject must be at most 52 characters total. Shorter is better. Use imperative mood with no trailing period.
- Then one blank line.
- Then 1 to 3 bullet lines, each starting with "- ".
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- No Co-Authored-By trailer.
- Mention untracked files by filename when they matter.
- When the diff is compacted, infer from status, paths, and excerpts without claiming exact unseen changes.
- Optimize for later agents scanning git log, not for a polished PR description.`;

const CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT = 24_000;
const CHECKPOINT_PER_FILE_EXCERPT_CHAR_LIMIT = 1_500;
const CHECKPOINT_CHANGED_PATH_LIMIT = 120;
const CHECKPOINT_CHANGED_PATH_CHAR_LIMIT = 6_000;
const CHECKPOINT_FINAL_SUMMARY_RESERVE_CHARS = 500;
const CHECKPOINT_REPAIR_PREVIOUS_DRAFT_CHAR_LIMIT = 4_000;
const CHECKPOINT_REPAIR_FEEDBACK_CHAR_LIMIT = 4_000;

interface CheckpointDiffPromptSection {
	text: string;
	wasCompacted: boolean;
}

interface DiffFileSection {
	path: string;
	text: string;
}

interface FileSectionCompactedDiffInput {
	diff: string;
	fileSections: readonly DiffFileSection[];
	maxChars: number;
	perFileExcerptChars: number;
}

export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
}

export interface CheckpointPromptInput {
	status: string;
	diff: string;
	previousDraft?: string;
	validationFeedback?: string;
}

export type PreparedCheckpointMessage =
	| { ok: true; message: string; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

export async function prepareCheckpointMessage(input: {
	status: string;
	diff: string;
	textGeneration: TextGenerationGateway;
	modelRef: string;
}): Promise<PreparedCheckpointMessage> {
	const initialPrompt = buildCheckpointUserPrompt({ status: input.status, diff: input.diff });
	const prepared = await prepareRepairedText({
		noun: "checkpoint message",
		initialPrompt,
		generate: (prompt) => generateCheckpointText(input.textGeneration, input.modelRef, prompt),
		validate: (text) => {
			const validation = validateCheckpointMessage(text);
			if (validation.ok) return { ok: true, value: formatCheckpointMessage(validation.message) };
			return { ok: false, feedback: formatCheckpointValidationFeedback(validation.issues) };
		},
		buildRepairPrompt: ({ previousDraft, feedback }) =>
			buildCheckpointUserPrompt({
				status: input.status,
				diff: input.diff,
				previousDraft,
				validationFeedback: feedback,
			}),
	});
	if (!prepared.ok) return prepared;
	return {
		ok: true,
		message: prepared.value,
		source: prepared.source,
		...(prepared.feedback === undefined ? {} : { feedback: prepared.feedback }),
	};
}

export function buildCheckpointUserPrompt(input: CheckpointPromptInput): string {
	const diffSection = buildCheckpointDiffPromptSection({ diff: input.diff });
	const diffHeading = diffSection.wasCompacted ? "## git diff HEAD (compacted)" : "## git diff HEAD";
	const base = `Draft a checkpoint commit message for this pending git state.\n\n## git status --porcelain\n\n${promptBlock(input.status, "(clean)")}\n\n${diffHeading}\n\n${diffSection.text}\n`;
	if (!input.previousDraft || !input.validationFeedback) {
		return base;
	}
	const previousDraft = compactPromptText(input.previousDraft, CHECKPOINT_REPAIR_PREVIOUS_DRAFT_CHAR_LIMIT, "previous invalid draft");
	const validationFeedback = compactPromptText(input.validationFeedback, CHECKPOINT_REPAIR_FEEDBACK_CHAR_LIMIT, "validation feedback");
	return `${base}\n## previous invalid draft\n\n${previousDraft}\n\n## validation feedback\n\n${validationFeedback}\n\nRewrite the checkpoint message so it satisfies every validation rule. Return only the corrected commit message.\n`;
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

function buildCheckpointDiffPromptSection(input: {
	diff: string;
	maxChars?: number;
	perFileExcerptChars?: number;
}): CheckpointDiffPromptSection {
	const maxChars = input.maxChars ?? CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT;
	const perFileExcerptChars = input.perFileExcerptChars ?? CHECKPOINT_PER_FILE_EXCERPT_CHAR_LIMIT;
	const trimmedDiff = input.diff.trimEnd();
	if (trimmedDiff.trim().length === 0) {
		return { text: "(no tracked diff; rely on untracked filenames in status)", wasCompacted: false };
	}
	if (trimmedDiff.length <= maxChars) {
		return { text: trimmedDiff, wasCompacted: false };
	}

	const fileSections = parseDiffFileSections(trimmedDiff);
	if (fileSections.length === 0) {
		return { text: buildHeadTailCompactedDiff(trimmedDiff, maxChars), wasCompacted: true };
	}

	return {
		text: buildFileSectionCompactedDiff({ diff: trimmedDiff, fileSections, maxChars, perFileExcerptChars }),
		wasCompacted: true,
	};
}

function parseDiffFileSections(diff: string): DiffFileSection[] {
	const headers = [...diff.matchAll(/^diff --git .*$/gm)];
	return headers.map((header, index) => {
		const start = header.index ?? 0;
		const next = headers[index + 1];
		const end = next?.index ?? diff.length;
		const text = diff.slice(start, end).trimEnd();
		return { path: parseDiffHeaderPath(header[0]), text };
	});
}

function parseDiffHeaderPath(header: string): string {
	const match = header.match(/^diff --git a\/(.+?) b\/(.+)$/);
	if (!match) return header.replace(/^diff --git\s+/, "");
	const before = match[1] ?? "";
	const after = match[2] ?? "";
	return before === after ? after : `${before} -> ${after}`;
}

function buildFileSectionCompactedDiff(input: FileSectionCompactedDiffInput): string {
	const paths = input.fileSections.map((section) => section.path);
	let output = `Large diff compacted for checkpoint message generation.\nOriginal diff character count: ${input.diff.length}\nDetected file sections: ${input.fileSections.length}\n\n${buildChangedPathList(paths)}\n\nPer-file excerpts:\n`;
	let omittedFileSections = 0;
	let omittedCharacters = 0;
	let includedFileSections = 0;

	for (const section of input.fileSections) {
		const finalReserve = CHECKPOINT_FINAL_SUMMARY_RESERVE_CHARS;
		const remainingChars = input.maxChars - output.length - finalReserve;
		const blockOverhead = `\n### ${section.path}\n\n\`\`\`diff\n\n\`\`\`\n`.length + 80;
		const availableExcerptChars = Math.min(input.perFileExcerptChars, remainingChars - blockOverhead);
		if (availableExcerptChars <= 0) {
			omittedFileSections += 1;
			omittedCharacters += section.text.length;
			continue;
		}
		const excerpt = section.text.slice(0, availableExcerptChars).trimEnd();
		const omittedFromSection = section.text.length - excerpt.length;
		omittedCharacters += omittedFromSection;
		includedFileSections += 1;
		const omission = omittedFromSection > 0 ? `\n[... omitted ${omittedFromSection} chars from this file ...]` : "";
		output += `\n### ${section.path}\n\n\`\`\`diff\n${excerpt}${omission}\n\`\`\`\n`;
	}

	output += `\nOmitted summary: ${omittedFileSections} file sections not excerpted; ${omittedCharacters} characters omitted from excerpted or omitted file sections; ${includedFileSections} file sections excerpted.\n`;
	return truncateToMaxChars(output, input.maxChars);
}

function buildChangedPathList(paths: readonly string[]): string {
	let output = `Changed paths (showing 0 of ${paths.length}):`;
	let shown = 0;
	for (const path of paths.slice(0, CHECKPOINT_CHANGED_PATH_LIMIT)) {
		const line = `\n- ${path}`;
		if (output.length + line.length > CHECKPOINT_CHANGED_PATH_CHAR_LIMIT) break;
		output += line;
		shown += 1;
	}
	if (shown < paths.length) {
		output += `\n- ... omitted ${paths.length - shown} more paths`;
	}
	return output.replace(`showing 0 of ${paths.length}`, `showing ${shown} of ${paths.length}`);
}

function buildHeadTailCompactedDiff(diff: string, maxChars: number): string {
	const marker = `\n[... omitted ${diff.length - maxChars} chars from compacted diff without file sections ...]\n`;
	const header = `Large diff compacted for checkpoint message generation.\nOriginal diff character count: ${diff.length}\nDetected file sections: 0\nNo diff --git file sections were detected; using head/tail excerpt.\n\n\`\`\`diff\n`;
	const footer = `\n\`\`\`\n`;
	const excerptBudget = Math.max(0, maxChars - header.length - marker.length - footer.length);
	const headChars = Math.ceil(excerptBudget / 2);
	const tailChars = Math.floor(excerptBudget / 2);
	return `${header}${diff.slice(0, headChars).trimEnd()}${marker}${diff.slice(diff.length - tailChars).trimStart()}${footer}`;
}

function truncateToMaxChars(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	const marker = "\n[... compacted checkpoint diff section truncated to prompt budget ...]\n";
	return `${value.slice(0, Math.max(0, maxChars - marker.length)).trimEnd()}${marker}`;
}

function compactPromptText(value: string, maxChars: number, label: string): string {
	const trimmed = value.trim();
	if (trimmed.length <= maxChars) return trimmed;
	let preservedChars = Math.max(0, maxChars - 80);
	let marker = `\n[... omitted ${trimmed.length - preservedChars} chars from ${label} ...]\n`;
	preservedChars = Math.max(0, maxChars - marker.length);
	marker = `\n[... omitted ${trimmed.length - preservedChars} chars from ${label} ...]\n`;
	return `${trimmed.slice(0, preservedChars).trimEnd()}${marker}`;
}

function promptBlock(value: string, emptyPlaceholder: string): string {
	return value.trim().length === 0 ? emptyPlaceholder : value.trimEnd();
}

async function generateCheckpointText(
	textGeneration: TextGenerationGateway,
	modelRef: string,
	prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	return textGeneration.generateText({
		modelRef,
		system: CHECKPOINT_SYSTEM_PROMPT,
		prompt,
		maxTokens: 512,
		reasoning: "low",
		operation: "checkpoint-message",
	});
}

function formatCommandError(summary: string, result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return [summary, details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`].filter(Boolean).join("\n");
}
