import type { TextGenerator } from "@sdl/sdl/sdk";
import { prepareRepairedText } from "./text-helpers.ts";

const CHECKPOINT_SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

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

const CHECKPOINT_SUBJECT_MAX_LENGTH = 52;
const CHECKPOINT_MAX_BULLETS = 3;
const CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT = 24_000;
const CHECKPOINT_PER_FILE_EXCERPT_CHAR_LIMIT = 1_500;
const CHECKPOINT_CHANGED_PATH_LIMIT = 120;
const CHECKPOINT_CHANGED_PATH_CHAR_LIMIT = 6_000;
const CHECKPOINT_REPAIR_PREVIOUS_DRAFT_CHAR_LIMIT = 4_000;
const CHECKPOINT_REPAIR_FEEDBACK_CHAR_LIMIT = 4_000;

interface CheckpointMessage {
	subject: string;
	bullets: string[];
}

type CheckpointMessageIssue =
	| { code: "missing_subject" }
	| { code: "missing_blank_line" }
	| { code: "missing_cp_prefix"; subject: string }
	| { code: "subject_too_long"; length: number; maxLength: number; subject: string }
	| { code: "subject_trailing_period"; subject: string }
	| { code: "no_bullets" }
	| { code: "too_many_bullets"; count: number; maxCount: number }
	| { code: "invalid_bullet_prefix"; lineNumber: number; line: string }
	| { code: "extra_prose"; lineNumber: number; line: string }
	| { code: "code_fence" }
	| { code: "trailer"; lineNumber: number; line: string };

type CheckpointValidationResult =
	| { ok: true; message: CheckpointMessage }
	| { ok: false; normalizedText: string; issues: CheckpointMessageIssue[] };

export type PreparedCheckpointMessage =
	| { ok: true; message: string; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

export async function prepareCheckpointMessage(input: {
	status: string;
	diff: string;
	textGenerator: TextGenerator;
	modelRef: string;
}): Promise<PreparedCheckpointMessage> {
	const initialPrompt = buildCheckpointUserPrompt({ status: input.status, diff: input.diff });
	const prepared = await prepareRepairedText({
		noun: "checkpoint message",
		initialPrompt,
		generate: (prompt) => generateCheckpointText(input.textGenerator, input.modelRef, prompt),
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

function generateCheckpointText(
	textGenerator: TextGenerator,
	modelRef: string,
	prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	return textGenerator.generateText({
		modelRef,
		system: CHECKPOINT_SYSTEM_PROMPT,
		prompt,
		maxTokens: 512,
		reasoning: "low",
		operation: "checkpoint-message",
	});
}

function buildCheckpointUserPrompt(input: {
	status: string;
	diff: string;
	previousDraft?: string;
	validationFeedback?: string;
}): string {
	const diffSection = buildCheckpointDiffPromptSection({ diff: input.diff });
	const diffHeading = diffSection.isCompacted ? "## git diff HEAD (compacted)" : "## git diff HEAD";
	const base = `Draft a checkpoint commit message for this pending git state.\n\n## git status --porcelain\n\n${promptBlock(input.status, "(clean)")}\n\n${diffHeading}\n\n${diffSection.text}\n`;
	if (!input.previousDraft || !input.validationFeedback) {
		return base;
	}
	const previousDraft = truncateTextHead(
		input.previousDraft,
		CHECKPOINT_REPAIR_PREVIOUS_DRAFT_CHAR_LIMIT,
		"previous invalid draft",
	);
	const validationFeedback = truncateTextHead(
		input.validationFeedback,
		CHECKPOINT_REPAIR_FEEDBACK_CHAR_LIMIT,
		"validation feedback",
	);
	return `${base}\n## previous invalid draft\n\n${previousDraft}\n\n## validation feedback\n\n${validationFeedback}\n\nRewrite the checkpoint message so it satisfies every validation rule. Return only the corrected commit message.\n`;
}

function validateCheckpointMessage(text: string): CheckpointValidationResult {
	const normalized = normalizeTextOutput(text);
	const issues: CheckpointMessageIssue[] = [];
	if (normalized.trim().length === 0) {
		return { ok: false, normalizedText: normalized, issues: [{ code: "missing_subject" }] };
	}
	if (normalized.includes("```")) {
		issues.push({ code: "code_fence" });
	}
	const lines = normalized.split("\n");
	const subject = lines[0]?.trimEnd() ?? "";
	if (subject === "") {
		issues.push({ code: "missing_subject" });
	} else {
		if (!subject.startsWith("[cp] ")) issues.push({ code: "missing_cp_prefix", subject });
		if (subject.length > CHECKPOINT_SUBJECT_MAX_LENGTH) {
			issues.push({
				code: "subject_too_long",
				length: subject.length,
				maxLength: CHECKPOINT_SUBJECT_MAX_LENGTH,
				subject,
			});
		}
		if (subject.endsWith(".")) issues.push({ code: "subject_trailing_period", subject });
	}
	if (lines.length < 2 || lines[1]?.trim() !== "") {
		issues.push({ code: "missing_blank_line" });
	}

	const bodyLines = lines.slice(2).filter((line) => line.trim().length > 0);
	const bullets: string[] = [];
	for (const [index, line] of bodyLines.entries()) {
		const lineNumber = index + 3;
		if (/^(Co-authored-by|Signed-off-by):/i.test(line.trim())) {
			issues.push({ code: "trailer", lineNumber, line });
			continue;
		}
		if (!line.startsWith("- ")) {
			issues.push({ code: "invalid_bullet_prefix", lineNumber, line });
			continue;
		}
		const bullet = line.slice(2).trim();
		if (bullet === "") {
			issues.push({ code: "extra_prose", lineNumber, line });
		} else {
			bullets.push(bullet);
		}
	}
	if (bullets.length === 0) issues.push({ code: "no_bullets" });
	if (bullets.length > CHECKPOINT_MAX_BULLETS) {
		issues.push({
			code: "too_many_bullets",
			count: bullets.length,
			maxCount: CHECKPOINT_MAX_BULLETS,
		});
	}

	if (issues.length > 0) return { ok: false, normalizedText: normalized, issues };
	return { ok: true, message: { subject, bullets } };
}

function formatCheckpointMessage(message: CheckpointMessage): string {
	return `${message.subject}\n\n${message.bullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

function formatCheckpointValidationFeedback(issues: readonly CheckpointMessageIssue[]): string {
	return issues
		.map((issue) => {
			switch (issue.code) {
				case "missing_subject":
					return "- missing_subject: Missing subject line.";
				case "missing_blank_line":
					return "- missing_blank_line: Missing blank line between subject and bullet body.";
				case "missing_cp_prefix":
					return `- missing_cp_prefix: Subject must start with \"[cp] \": ${issue.subject}`;
				case "subject_too_long":
					return `- subject_too_long: Subject is ${issue.length} characters; maximum is ${issue.maxLength}: ${issue.subject}`;
				case "subject_trailing_period":
					return `- subject_trailing_period: Subject must not end with a period: ${issue.subject}`;
				case "no_bullets":
					return "- no_bullets: Body must contain 1 to 3 bullet lines.";
				case "too_many_bullets":
					return `- too_many_bullets: Body has ${issue.count} bullets; maximum is ${issue.maxCount}.`;
				case "invalid_bullet_prefix":
					return `- invalid_bullet_prefix: Line ${issue.lineNumber} must be a bullet starting with \"- \": ${issue.line}`;
				case "extra_prose":
					return `- extra_prose: Line ${issue.lineNumber} is not valid bullet content: ${issue.line}`;
				case "code_fence":
					return "- code_fence: Output must not include markdown code fences.";
				case "trailer":
					return `- trailer: Line ${issue.lineNumber} must not be a trailer: ${issue.line}`;
			}
		})
		.join("\n");
}

function buildCheckpointDiffPromptSection(input: { diff: string }): {
	text: string;
	isCompacted: boolean;
} {
	const trimmedDiff = input.diff.trimEnd();
	if (trimmedDiff.trim().length === 0) {
		return { text: "(no tracked diff; rely on untracked filenames in status)", isCompacted: false };
	}
	if (trimmedDiff.length <= CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT) {
		return { text: trimmedDiff, isCompacted: false };
	}

	const fileSections = parseDiffFileSections(trimmedDiff);
	if (fileSections.length === 0) {
		return {
			text: truncateTextHeadTail(
				trimmedDiff,
				CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT,
				"compacted diff without file sections",
			),
			isCompacted: true,
		};
	}

	const usedSections = fileSections.slice(0, CHECKPOINT_CHANGED_PATH_LIMIT);
	const paths = truncateTextHead(
		usedSections.map((section) => `- ${section.path}`).join("\n"),
		CHECKPOINT_CHANGED_PATH_CHAR_LIMIT,
		"changed path list",
	);
	const excerpts = usedSections
		.map(
			(section) =>
				`### ${section.path}\n\n${truncateTextHead(section.text, CHECKPOINT_PER_FILE_EXCERPT_CHAR_LIMIT, `${section.path} diff`)}`,
		)
		.join("\n\n");
	const omittedCount = fileSections.length - usedSections.length;
	const omittedLine =
		omittedCount > 0 ? `\n\n[... omitted ${omittedCount} additional file sections ...]` : "";
	return {
		text: `Large diff compacted for checkpoint message generation.\nDetected file sections: ${fileSections.length}\n\nChanged paths:\n${paths}\n\nOmitted summary:\n${excerpts}${omittedLine}`,
		isCompacted: true,
	};
}

function parseDiffFileSections(diff: string): Array<{ path: string; text: string }> {
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
	if (match?.[2] !== undefined) return match[2];
	if (match?.[1] !== undefined) return match[1];
	return header.replace(/^diff --git\s+/, "");
}

function normalizeTextOutput(output: string): string {
	return stripOuterCodeFence(trimOuterBlankLines(output.replace(/\r\n?/g, "\n")));
}

function trimOuterBlankLines(text: string): string {
	const lines = text.split("\n");
	while (lines.length > 0 && (lines[0]?.trim() ?? "") === "") {
		lines.shift();
	}
	while (lines.length > 0 && (lines[lines.length - 1]?.trim() ?? "") === "") {
		lines.pop();
	}
	return lines.join("\n");
}

function stripOuterCodeFence(text: string): string {
	const trimmed = trimOuterBlankLines(text);
	const lines = trimmed.split("\n");
	const first = lines[0]?.trim() ?? "";
	const last = lines[lines.length - 1]?.trim() ?? "";
	if (lines.length >= 2 && /^```[\w-]*$/.test(first) && last === "```") {
		return trimOuterBlankLines(lines.slice(1, -1).join("\n"));
	}
	return trimmed;
}

function promptBlock(value: string, fallback: string): string {
	const trimmed = value.trimEnd();
	return trimmed.length === 0 ? fallback : trimmed;
}

function truncateTextHead(value: string, maxChars: number, label: string): string {
	if (value.length <= maxChars) return value;
	const omitted = value.length - maxChars;
	return `${value.slice(0, maxChars).trimEnd()}\n[... omitted ${omitted} chars from ${label} ...]`;
}

function truncateTextHeadTail(
	value: string,
	maxChars: number,
	label: string,
	headRatio = 0.5,
	markerPrefix = "[... omitted",
): string {
	if (value.length <= maxChars) return value;
	const marker = (omitted: number) =>
		markerPrefix === "[... TRUNCATED"
			? `\n[... TRUNCATED ${omitted} chars ...]\n`
			: `\n[... omitted ${omitted} chars from ${label} ...]\n`;
	const markerBudget = marker(value.length).length;
	const contentBudget = Math.max(0, maxChars - markerBudget);
	const headChars = Math.ceil(contentBudget * headRatio);
	const tailChars = contentBudget - headChars;
	const omitted = value.length - headChars - tailChars;
	return `${value.slice(0, headChars).trimEnd()}${marker(omitted)}${value.slice(value.length - tailChars).trimStart()}`;
}
