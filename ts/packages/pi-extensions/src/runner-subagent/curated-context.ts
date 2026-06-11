import { spawnSync } from "node:child_process";
import { closeSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface BuildCuratedRunnerSubagentContextInput {
	title: string;
	prompt: string;
	cwd: string;
	sessionEntries?: readonly unknown[];
}

export interface CuratedRunnerSubagentContext {
	markdown: string;
	audit: CuratedRunnerSubagentContextAudit;
}

export interface CuratedRunnerSubagentContextAudit {
	enabled: true;
	includedPaths: readonly string[];
	omittedPaths: readonly string[];
	unreadablePaths: readonly string[];
	truncated: boolean;
	markdownChars: number;
	gitAvailable: boolean;
	notes: readonly string[];
}

type CandidateReason = "mentioned" | "git-status" | "git-diff";

type CandidateOutcomeReason = CandidateReason | "candidate-limit" | "outside-cwd" | "not-file";

interface FileCandidate {
	path: string;
	reasons: Set<CandidateReason>;
}

interface IncludedSource {
	path: string;
	reasons: readonly CandidateReason[];
	excerpt: string;
	truncated: boolean;
	chars: number;
}

interface CandidateNote {
	path: string;
	reason: CandidateOutcomeReason;
	note: string;
}

interface GitEvidence {
	available: boolean;
	statusShort?: string;
	diffNameOnly?: string;
	diffStat?: string;
	notes: readonly string[];
}

interface CommandResult {
	ok: boolean;
	stdout: string;
	diagnostic?: string;
}

interface ResolvedCandidatePath {
	absolutePath: string;
	relativePath: string;
}

interface TextExcerptResult {
	excerpt: string;
	truncated: boolean;
}

const MAX_MARKDOWN_CHARS = 48_000;
const MAX_INCLUDED_FILES = 6;
const MAX_FILE_READ_BYTES = 128_000;
const MAX_FILE_EXCERPT_CHARS = 4_000;
const MAX_TASK_PREVIEW_CHARS = 1_200;
const MAX_SESSION_DIGEST_CHARS = 3_000;
const MAX_SESSION_DIGEST_ITEMS = 6;
const MAX_SESSION_ENTRY_CHARS = 320;
const MAX_GIT_OUTPUT_CHARS = 4_000;

export function buildCuratedRunnerSubagentContext(input: BuildCuratedRunnerSubagentContextInput): CuratedRunnerSubagentContext {
	const cwd = resolve(input.cwd);
	const gitEvidence = collectGitEvidence(cwd);
	const candidates = collectFileCandidates(input, gitEvidence);
	const includedSources: IncludedSource[] = [];
	const omittedCandidates: CandidateNote[] = [];
	const unreadableCandidates: CandidateNote[] = [];
	let truncated = false;

	for (const candidate of candidates.values()) {
		if (includedSources.length >= MAX_INCLUDED_FILES) {
			omittedCandidates.push({
				path: candidate.path,
				reason: "candidate-limit",
				note: `Skipped after the first ${MAX_INCLUDED_FILES} readable candidates to keep the packet bounded.`,
			});
			truncated = true;
			continue;
		}

		const resolved = resolveCandidatePath(cwd, candidate.path);
		if (resolved === undefined) {
			omittedCandidates.push({ path: candidate.path, reason: "outside-cwd", note: "Rejected because it resolves outside cwd." });
			continue;
		}

		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(resolved.absolutePath);
		} catch (error) {
			unreadableCandidates.push({ path: resolved.relativePath, reason: primaryReason(candidate), note: errorMessage(error) });
			continue;
		}

		if (!stat.isFile()) {
			omittedCandidates.push({ path: resolved.relativePath, reason: "not-file", note: "Candidate exists but is not a regular file." });
			continue;
		}

		const excerpt = readTextExcerpt(resolved.absolutePath, stat.size);
		if (typeof excerpt === "string") {
			unreadableCandidates.push({ path: resolved.relativePath, reason: primaryReason(candidate), note: excerpt });
			continue;
		}

		if (excerpt.truncated) truncated = true;
		includedSources.push({
			path: resolved.relativePath,
			reasons: [...candidate.reasons],
			excerpt: excerpt.excerpt,
			truncated: excerpt.truncated,
			chars: excerpt.excerpt.length,
		});
	}

	const digest = buildParentSessionDigest({ entries: input.sessionEntries ?? [], title: input.title, prompt: input.prompt });
	const notes = [...gitEvidence.notes];
	const draft = renderCuratedContextMarkdown({
		input,
		cwd,
		gitEvidence,
		includedSources,
		omittedCandidates,
		unreadableCandidates,
		parentSessionDigest: digest,
		truncated,
	});
	const markdown = boundMarkdown(draft);
	const wasMarkdownTruncated = markdown.length !== draft.length;
	const audit: CuratedRunnerSubagentContextAudit = {
		enabled: true,
		includedPaths: includedSources.map((source) => source.path),
		omittedPaths: omittedCandidates.map((candidate) => candidate.path),
		unreadablePaths: unreadableCandidates.map((candidate) => candidate.path),
		truncated: truncated || wasMarkdownTruncated,
		markdownChars: markdown.length,
		gitAvailable: gitEvidence.available,
		notes: wasMarkdownTruncated ? [...notes, `Auto-curated context was truncated to ${MAX_MARKDOWN_CHARS} characters.`] : notes,
	};
	return { markdown, audit };
}

function collectGitEvidence(cwd: string): GitEvidence {
	const status = runGit(cwd, ["status", "--short"]);
	const diffNameOnly = runGit(cwd, ["diff", "--name-only"]);
	const diffStat = runGit(cwd, ["diff", "--stat"]);
	const commands = [status, diffNameOnly, diffStat];
	const notes = commands.flatMap((command) => (command.ok ? [] : [command.diagnostic ?? "git command failed"]));
	return {
		available: commands.some((command) => command.ok),
		...(status.ok ? { statusShort: truncateText(status.stdout.trim(), MAX_GIT_OUTPUT_CHARS) } : {}),
		...(diffNameOnly.ok ? { diffNameOnly: truncateText(diffNameOnly.stdout.trim(), MAX_GIT_OUTPUT_CHARS) } : {}),
		...(diffStat.ok ? { diffStat: truncateText(diffStat.stdout.trim(), MAX_GIT_OUTPUT_CHARS) } : {}),
		notes,
	};
}

function runGit(cwd: string, args: readonly string[]): CommandResult {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8", timeout: 1_500, maxBuffer: 64_000 });
	if (result.error !== undefined) {
		return { ok: false, stdout: "", diagnostic: `git ${args.join(" ")} unavailable: ${errorMessage(result.error)}` };
	}
	if (result.status !== 0) {
		const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
		return { ok: false, stdout: "", diagnostic: `git ${args.join(" ")} failed${stderr.length === 0 ? "" : `: ${truncateText(stderr, 240)}`}` };
	}
	return { ok: true, stdout: typeof result.stdout === "string" ? result.stdout : "" };
}

function collectFileCandidates(input: BuildCuratedRunnerSubagentContextInput, gitEvidence: GitEvidence): Map<string, FileCandidate> {
	const candidates = new Map<string, FileCandidate>();
	for (const path of extractMentionedPaths(`${input.title}\n${input.prompt}`)) addCandidate(candidates, path, "mentioned");
	for (const path of parseGitStatusPaths(gitEvidence.statusShort ?? "")) addCandidate(candidates, path, "git-status");
	for (const path of lines(gitEvidence.diffNameOnly ?? "")) addCandidate(candidates, path, "git-diff");
	return candidates;
}

function addCandidate(candidates: Map<string, FileCandidate>, path: string, reason: CandidateReason): void {
	const normalized = normalizeMentionedPath(path);
	if (normalized.length === 0) return;
	const existing = candidates.get(normalized);
	if (existing !== undefined) {
		existing.reasons.add(reason);
		return;
	}
	candidates.set(normalized, { path: normalized, reasons: new Set([reason]) });
}

function extractMentionedPaths(text: string): readonly string[] {
	const paths = new Set<string>();
	for (const match of text.matchAll(/`([^`]+)`/g)) {
		const value = match[1];
		if (value !== undefined && looksLikePath(value)) paths.add(value);
	}
	for (const match of text.matchAll(/(?:^|[\s"'(<])((?:\.?\.?\/?[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\.[A-Za-z0-9][A-Za-z0-9_.-]*)(?=$|[\s"'),;:>])/g)) {
		const value = match[1];
		if (value !== undefined && looksLikePath(value)) paths.add(value);
	}
	return [...paths];
}

function looksLikePath(value: string): boolean {
	const normalized = normalizeMentionedPath(value);
	if (normalized.length === 0) return false;
	if (normalized.startsWith("-") || normalized.includes("://")) return false;
	return normalized.includes("/") || /\.[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(normalized);
}

function normalizeMentionedPath(value: string): string {
	return value.trim().replace(/^[<([{"']+/, "").replace(/[>)\]}"'.,;:]+$/, "");
}

function parseGitStatusPaths(statusShort: string): readonly string[] {
	return lines(statusShort).map((line) => {
		const path = line.slice(3).trim();
		const renameIndex = path.lastIndexOf(" -> ");
		return renameIndex === -1 ? path : path.slice(renameIndex + 4);
	});
}

function resolveCandidatePath(cwd: string, rawPath: string): ResolvedCandidatePath | undefined {
	const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(cwd, rawPath);
	if (!isInsideRoot(cwd, absolutePath)) return undefined;
	const relativePath = toPosixPath(relative(cwd, absolutePath));
	try {
		const realRoot = realpathSync(cwd);
		const realCandidate = realpathSync(absolutePath);
		if (!isInsideRoot(realRoot, realCandidate)) return undefined;
		return { absolutePath: realCandidate, relativePath };
	} catch {
		// Missing or unreadable candidates are classified by the later stat/read step.
		return { absolutePath, relativePath };
	}
}

function isInsideRoot(root: string, path: string): boolean {
	const relativePath = relative(root, path);
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function readTextExcerpt(path: string, sizeBytes: number): TextExcerptResult | string {
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		const readBytes = Math.min(sizeBytes, MAX_FILE_READ_BYTES);
		const buffer = Buffer.alloc(readBytes);
		const bytesRead = readSync(fd, buffer, 0, readBytes, 0);
		const data = buffer.subarray(0, bytesRead);
		if (data.includes(0)) return "Skipped because the file appears to be binary.";
		const text = data.toString("utf8").replace(/\r\n?/g, "\n");
		const truncated = sizeBytes > bytesRead || text.length > MAX_FILE_EXCERPT_CHARS;
		return { excerpt: truncateText(text, MAX_FILE_EXCERPT_CHARS), truncated };
	} catch (error) {
		return errorMessage(error);
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

function buildParentSessionDigest(options: { entries: readonly unknown[]; title: string; prompt: string }): string[] {
	if (options.entries.length === 0) return [];
	const terms = taskTerms(`${options.title}\n${options.prompt}`);
	const recentEntries = options.entries.slice(-30).reverse();
	const selected: string[] = [];
	let chars = 0;

	for (const entry of recentEntries) {
		const summary = summarizeSessionEntry(entry);
		if (summary === undefined) continue;
		if (selected.length >= MAX_SESSION_DIGEST_ITEMS) break;
		if (selected.length > 0 && !matchesTerms(summary, terms)) continue;
		const bounded = truncateText(summary, MAX_SESSION_ENTRY_CHARS);
		if (chars + bounded.length > MAX_SESSION_DIGEST_CHARS) break;
		selected.push(bounded);
		chars += bounded.length;
	}

	return selected.reverse();
}

function summarizeSessionEntry(entry: unknown): string | undefined {
	const message = messageFromEntry(entry);
	if (message !== undefined) {
		const role = typeof message.role === "string" ? message.role : "message";
		const text = textFromContent(message.content);
		if (text.length > 0) return `${role}: ${compactWhitespace(text)}`;
		if (typeof message.toolName === "string") return `${role} ${message.toolName}: ${compactWhitespace(JSON.stringify(message.details ?? {}))}`;
		return undefined;
	}
	if (isRecord(entry) && typeof entry.type === "string") {
		return `${entry.type}: ${truncateText(compactWhitespace(JSON.stringify(entry)), MAX_SESSION_ENTRY_CHARS)}`;
	}
	return undefined;
}

function messageFromEntry(entry: unknown): Record<string, unknown> | undefined {
	if (!isRecord(entry)) return undefined;
	if (entry.type === "message" && isRecord(entry.message)) return entry.message;
	if (typeof entry.role === "string") return entry;
	return undefined;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const textParts: string[] = [];
	for (const item of content) {
		if (isRecord(item) && item.type === "text" && typeof item.text === "string") textParts.push(item.text);
	}
	return textParts.join("\n");
}

function taskTerms(text: string): readonly string[] {
	const terms = new Set<string>();
	for (const path of extractMentionedPaths(text)) terms.add(path.toLowerCase());
	for (const match of text.toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{3,}/g)) {
		const value = match[0];
		if (!COMMON_WORDS.has(value)) terms.add(value);
	}
	return [...terms].slice(0, 40);
}

function matchesTerms(text: string, terms: readonly string[]): boolean {
	if (terms.length === 0) return true;
	const normalized = text.toLowerCase();
	return terms.some((term) => normalized.includes(term));
}

function renderCuratedContextMarkdown(options: {
	input: BuildCuratedRunnerSubagentContextInput;
	cwd: string;
	gitEvidence: GitEvidence;
	includedSources: readonly IncludedSource[];
	omittedCandidates: readonly CandidateNote[];
	unreadableCandidates: readonly CandidateNote[];
	parentSessionDigest: readonly string[];
	truncated: boolean;
}): string {
	const linesOut = [
		"## Auto-curated context",
		"",
		"This context was generated by the parent `dispatch_runner_subagent` tool. Treat it as orientation, not ground truth. Read cited files before editing.",
		"",
		"### Task focus",
		`- Title: ${options.input.title}`,
		"- Delegated prompt preview:",
		blockquote(truncateText(options.input.prompt.trim(), MAX_TASK_PREVIEW_CHARS)),
		"",
		"### Repo/worktree facts",
		`- Cwd: \`${options.cwd}\``,
		...renderGitEvidence(options.gitEvidence),
		"",
		"### Included sources",
		...renderIncludedSources(options.includedSources),
		"",
		"### Parent-session digest",
		...renderParentSessionDigest(options.parentSessionDigest),
		"",
		"### Omitted or unreadable candidates",
		...renderCandidateNotes(options.omittedCandidates, options.unreadableCandidates),
		"",
		"### Budget and truncation notes",
		`- Approximate packet characters before final bounding: ${options.truncated ? "truncated" : "not truncated by file/session budgets"}.`,
	];
	return linesOut.join("\n");
}

function renderGitEvidence(gitEvidence: GitEvidence): string[] {
	if (!gitEvidence.available) return ["- Git evidence unavailable; continue with explicit task context and read files directly."];
	return [
		"- Git evidence collected with `git status --short`, `git diff --name-only`, and `git diff --stat`.",
		codeListItem("status --short", gitEvidence.statusShort),
		codeListItem("diff --name-only", gitEvidence.diffNameOnly),
		codeListItem("diff --stat", gitEvidence.diffStat),
	];
}

function renderIncludedSources(sources: readonly IncludedSource[]): string[] {
	if (sources.length === 0) return ["- No readable mentioned or changed source files were included."];
	return sources.flatMap((source) => [
		`#### \`${source.path}\``,
		`- Reason: ${source.reasons.join(", ")}`,
		`- Excerpt characters: ${source.chars}${source.truncated ? " (truncated)" : ""}`,
		"```text",
		escapeFence(source.excerpt),
		"```",
	]);
}

function renderParentSessionDigest(digest: readonly string[]): string[] {
	if (digest.length === 0) return ["- No parent-session entries were available or selected for this bounded deterministic digest."];
	return ["Generated deterministic digest of recent relevant parent entries; it may be stale or incomplete.", ...digest.map((item) => `- ${item}`)];
}

function renderCandidateNotes(omitted: readonly CandidateNote[], unreadable: readonly CandidateNote[]): string[] {
	const notes = [
		...omitted.map((candidate) => `- Omitted \`${candidate.path}\` (${candidate.reason}): ${candidate.note}`),
		...unreadable.map((candidate) => `- Unreadable \`${candidate.path}\` (${candidate.reason}): ${candidate.note}`),
	];
	return notes.length === 0 ? ["- None."] : notes;
}

function codeListItem(label: string, value: string | undefined): string {
	const body = value === undefined || value.length === 0 ? "(no output)" : value;
	return `- ${label}: ${inlineCodeBlock(body)}`;
}

function inlineCodeBlock(value: string): string {
	return `\n\`\`\`text\n${escapeFence(value)}\n\`\`\``;
}

function blockquote(value: string): string {
	if (value.length === 0) return "> (empty)";
	return value.split("\n").map((line) => `> ${line}`).join("\n");
}

function boundMarkdown(markdown: string): string {
	if (markdown.length <= MAX_MARKDOWN_CHARS) return markdown;
	return `${markdown.slice(0, MAX_MARKDOWN_CHARS)}\n\n[Auto-curated context truncated at ${MAX_MARKDOWN_CHARS} characters.]`;
}

function primaryReason(candidate: FileCandidate): CandidateReason {
	return candidate.reasons.values().next().value ?? "mentioned";
}

function truncateText(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function escapeFence(value: string): string {
	return value.replaceAll("```", "`\u200b``");
}

function lines(value: string): string[] {
	return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

function toPosixPath(value: string): string {
	return sep === "/" ? value : value.split(sep).join("/");
}

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "unknown error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const COMMON_WORDS = new Set([
	"about",
	"after",
	"before",
	"context",
	"focused",
	"from",
	"implement",
	"into",
	"please",
	"report",
	"task",
	"that",
	"this",
	"with",
	"work",
]);
