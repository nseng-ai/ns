export const CHECKPOINT_SUBJECT_MAX_LENGTH = 52;
export const CHECKPOINT_MAX_BULLETS = 3;

export interface CheckpointMessage {
	subject: string;
	bullets: string[];
}

export type CheckpointMessageIssue =
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

export type CheckpointValidationResult =
	| { ok: true; message: CheckpointMessage }
	| { ok: false; normalizedText: string; issues: CheckpointMessageIssue[] };

export function normalizeCheckpointDraft(output: string): string {
	const withoutCarriageReturns = output.replace(/\r\n?/g, "\n");
	const trimmed = trimOuterBlankLines(withoutCarriageReturns);
	return stripOuterCodeFence(trimmed);
}

export function validateCheckpointMessage(output: string): CheckpointValidationResult {
	const normalizedText = normalizeCheckpointDraft(output);
	const lines = normalizedText.split("\n").map((line) => line.trimEnd());
	const issues: CheckpointMessageIssue[] = [];

	if (normalizedText.trim().length === 0) {
		return { ok: false, normalizedText, issues: [{ code: "missing_subject" }, { code: "no_bullets" }] };
	}

	for (const line of lines) {
		if (line.trim().startsWith("```")) {
			pushUniqueCodeFence(issues);
		}
	}

	const subjectIndex = findSubjectIndex(lines);
	for (let index = 0; index < subjectIndex; index += 1) {
		if (lines[index]?.trim()) {
			issues.push({ code: "extra_prose", lineNumber: index + 1, line: lines[index] ?? "" });
		}
	}

	const subject = lines[subjectIndex] ?? "";
	if (!subject.trim()) {
		issues.push({ code: "missing_subject" });
	} else {
		if (!subject.startsWith("[cp] ")) {
			issues.push({ code: "missing_cp_prefix", subject });
		}
		if (subject.length > CHECKPOINT_SUBJECT_MAX_LENGTH) {
			issues.push({ code: "subject_too_long", length: subject.length, maxLength: CHECKPOINT_SUBJECT_MAX_LENGTH, subject });
		}
		if (subject.endsWith(".")) {
			issues.push({ code: "subject_trailing_period", subject });
		}
	}

	const blankLineIndex = subjectIndex + 1;
	const hasBlankLine = lines[blankLineIndex] === "";
	if (!hasBlankLine) {
		issues.push({ code: "missing_blank_line" });
	}

	const bodyStart = hasBlankLine ? blankLineIndex + 1 : blankLineIndex;
	const bodyLines = lines.slice(bodyStart);
	let bulletCount = 0;
	for (let offset = 0; offset < bodyLines.length; offset += 1) {
		const lineNumber = bodyStart + offset + 1;
		const line = bodyLines[offset] ?? "";
		const trimmed = line.trim();
		if (!trimmed) {
			issues.push({ code: "extra_prose", lineNumber, line });
			continue;
		}
		if (trimmed.startsWith("```")) {
			pushUniqueCodeFence(issues);
			continue;
		}
		if (isTrailerLine(trimmed)) {
			issues.push({ code: "trailer", lineNumber, line });
			continue;
		}
		if (line.startsWith("- ")) {
			bulletCount += 1;
			continue;
		}
		if (line.startsWith("-")) {
			issues.push({ code: "invalid_bullet_prefix", lineNumber, line });
			continue;
		}
		issues.push({ code: "extra_prose", lineNumber, line });
	}

	if (bulletCount === 0) {
		issues.push({ code: "no_bullets" });
	}
	if (bulletCount > CHECKPOINT_MAX_BULLETS) {
		issues.push({ code: "too_many_bullets", count: bulletCount, maxCount: CHECKPOINT_MAX_BULLETS });
	}

	if (issues.length > 0) {
		return { ok: false, normalizedText, issues };
	}

	return { ok: true, message: { subject, bullets: bodyLines } };
}

export function formatCheckpointMessage(message: CheckpointMessage): string {
	return [message.subject, "", ...message.bullets].join("\n");
}

export function formatCheckpointValidationFeedback(issues: CheckpointMessageIssue[]): string {
	return issues.map(formatIssue).join("\n");
}

export function fallbackCheckpointMessage(input: { status: string; diff: string }): CheckpointMessage {
	const paths = collectChangedPaths(input);
	const subject = chooseFallbackSubject(paths);
	const bullets = chooseFallbackBullets(paths);
	const candidate = { subject, bullets };
	const validation = validateCheckpointMessage(formatCheckpointMessage(candidate));
	if (validation.ok) {
		return candidate;
	}
	return {
		subject: "[cp] Update checkpoint changes",
		bullets: ["- Record pending worktree changes"],
	};
}

function formatIssue(issue: CheckpointMessageIssue): string {
	switch (issue.code) {
		case "missing_subject":
			return "- missing_subject: first non-blank line must be the [cp] subject";
		case "missing_blank_line":
			return "- missing_blank_line: subject must be followed by exactly one blank separator line";
		case "missing_cp_prefix":
			return `- missing_cp_prefix: subject must start with \"[cp] \"; found ${JSON.stringify(issue.subject)}`;
		case "subject_too_long":
			return `- subject_too_long: length ${issue.length}, max ${issue.maxLength}: ${JSON.stringify(issue.subject)}`;
		case "subject_trailing_period":
			return `- subject_trailing_period: remove trailing period from ${JSON.stringify(issue.subject)}`;
		case "no_bullets":
			return "- no_bullets: include 1 to 3 bullet lines after the blank line";
		case "too_many_bullets":
			return `- too_many_bullets: found ${issue.count}, max ${issue.maxCount}`;
		case "invalid_bullet_prefix":
			return `- invalid_bullet_prefix: line ${issue.lineNumber} must start with \"- \"; found ${JSON.stringify(issue.line)}`;
		case "extra_prose":
			return `- extra_prose: line ${issue.lineNumber} is outside the checkpoint message structure: ${JSON.stringify(issue.line)}`;
		case "code_fence":
			return "- code_fence: return only the commit message, without markdown fences";
		case "trailer":
			return `- trailer: line ${issue.lineNumber} looks like a commit trailer and is not allowed: ${JSON.stringify(issue.line)}`;
	}
}

function trimOuterBlankLines(text: string): string {
	const lines = text.split("\n");
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]?.trim() === "") {
		start += 1;
	}
	while (end > start && lines[end - 1]?.trim() === "") {
		end -= 1;
	}
	return lines.slice(start, end).join("\n");
}

function stripOuterCodeFence(text: string): string {
	const lines = text.split("\n");
	if (lines.length < 2) {
		return text;
	}
	const firstLine = lines[0]?.trim() ?? "";
	const lastLine = lines[lines.length - 1]?.trim() ?? "";
	if (!/^```[a-zA-Z0-9_-]*$/.test(firstLine) || lastLine !== "```") {
		return text;
	}
	return trimOuterBlankLines(lines.slice(1, -1).join("\n"));
}

function findSubjectIndex(lines: string[]): number {
	const prefixedIndex = lines.findIndex((line) => line.startsWith("[cp] "));
	return prefixedIndex >= 0 ? prefixedIndex : 0;
}

function pushUniqueCodeFence(issues: CheckpointMessageIssue[]): void {
	if (!issues.some((issue) => issue.code === "code_fence")) {
		issues.push({ code: "code_fence" });
	}
}

function isTrailerLine(line: string): boolean {
	return /^[A-Za-z][A-Za-z0-9-]*: .+/.test(line);
}

function collectChangedPaths(input: { status: string; diff: string }): string[] {
	const seen = new Set<string>();
	for (const path of [...pathsFromStatus(input.status), ...pathsFromDiff(input.diff)]) {
		const cleaned = path.trim().replace(/^"|"$/g, "");
		if (cleaned && !seen.has(cleaned)) {
			seen.add(cleaned);
		}
	}
	return [...seen];
}

function pathsFromStatus(status: string): string[] {
	return status
		.split("\n")
		.map((line) => line.slice(3).trim())
		.map((path) => path.replace(/^.* -> /, ""))
		.filter(Boolean);
}

function pathsFromDiff(diff: string): string[] {
	const paths: string[] = [];
	for (const line of diff.split("\n")) {
		const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
		if (match?.[2] && match[2] !== "/dev/null") {
			paths.push(match[2]);
		}
	}
	return paths;
}

function chooseFallbackSubject(paths: string[]): string {
	const scope = chooseScope(paths);
	const candidates = [
		`[cp] Update ${scope}`,
		`[cp] Refresh ${scope}`,
		"[cp] Update checkpoint files",
		"[cp] Update worktree changes",
	];
	return candidates.find((candidate) => candidate.length <= CHECKPOINT_SUBJECT_MAX_LENGTH) ?? "[cp] Update worktree changes";
}

function chooseScope(paths: string[]): string {
	if (paths.length === 0) {
		return "worktree changes";
	}
	const first = paths[0] ?? "changes";
	if (paths.length === 1) {
		return readablePathName(first);
	}
	const commonDirectory = commonPathPrefix(paths);
	if (commonDirectory) {
		return `${readablePathName(commonDirectory)} files`;
	}
	return "changed files";
}

function chooseFallbackBullets(paths: string[]): string[] {
	if (paths.length === 0) {
		return ["- Record pending worktree changes"];
	}
	return paths.slice(0, CHECKPOINT_MAX_BULLETS).map((path) => `- Update ${truncatePathForBullet(path)}`);
}

function readablePathName(path: string): string {
	const basename = path.split("/").filter(Boolean).at(-1) ?? path;
	const withoutExtension = basename.replace(/\.[^.]+$/g, "");
	const words = withoutExtension.replace(/[^A-Za-z0-9]+/g, " ").trim().toLowerCase();
	return words || "changed files";
}

function commonPathPrefix(paths: string[]): string | undefined {
	const splitPaths = paths.map((path) => path.split("/").filter(Boolean));
	const first = splitPaths[0];
	if (!first || first.length < 2) {
		return undefined;
	}
	const prefix: string[] = [];
	for (let index = 0; index < first.length - 1; index += 1) {
		const segment = first[index];
		if (!segment || splitPaths.some((parts) => parts[index] !== segment)) {
			break;
		}
		prefix.push(segment);
	}
	return prefix.length > 0 ? prefix.join("/") : undefined;
}

function truncatePathForBullet(path: string): string {
	if (path.length <= 96) {
		return path;
	}
	return `...${path.slice(-93)}`;
}
