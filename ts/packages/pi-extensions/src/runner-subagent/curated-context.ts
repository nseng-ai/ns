import { closeSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ExecResult } from "@asdl/core/exec";

export type CuratedContextExecGit = (args: readonly string[], timeoutMs: number) => Promise<ExecResult>;

export interface BuildCuratedRunnerSubagentContextInput {
	title: string;
	prompt: string;
	cwd: string;
	execGit: CuratedContextExecGit;
}

export interface CuratedRunnerSubagentContext {
	markdown: string;
	audit: CuratedRunnerSubagentContextAudit;
}

export interface CuratedRunnerSubagentContextAudit {
	includedPaths: readonly string[];
	omittedPaths: readonly string[];
	unreadablePaths: readonly string[];
	isTruncated: boolean;
	markdownChars: number;
	isGitAvailable: boolean;
	notes: readonly string[];
}

type CandidateReason = "mentioned" | "git-status";

type CandidateOutcomeReason = CandidateReason | "candidate-limit" | "outside-cwd" | "not-file";

interface IncludedSource {
	path: string;
	reasons: readonly CandidateReason[];
	excerpt: string;
	isTruncated: boolean;
	chars: number;
}

interface CandidateNote {
	path: string;
	reason: CandidateOutcomeReason;
	reasons: readonly CandidateReason[];
	note: string;
}

interface GitEvidence {
	isAvailable: boolean;
	statusShort?: string;
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

type TextExcerptResult = { ok: true; excerpt: string; isTruncated: boolean } | { ok: false; note: string };

const MAX_MARKDOWN_CHARS = 48_000;
const MAX_INCLUDED_FILES = 6;
const MAX_CANDIDATES = 30;
const MAX_FILE_READ_BYTES = 128_000;
const MAX_FILE_EXCERPT_CHARS = 4_000;
const MAX_TASK_PREVIEW_CHARS = 1_200;
const MAX_GIT_OUTPUT_CHARS = 4_000;
const GIT_TIMEOUT_MS = 2_000;

export async function buildCuratedRunnerSubagentContext(
	input: BuildCuratedRunnerSubagentContextInput,
): Promise<CuratedRunnerSubagentContext> {
	const cwd = resolve(input.cwd);
	const gitEvidence = await collectGitEvidence(input.execGit);
	const candidates = collectFileCandidates(input, gitEvidence);
	const includedSources: IncludedSource[] = [];
	const omittedCandidates: CandidateNote[] = [];
	const unreadableCandidates: CandidateNote[] = [];
	let isTruncated = false;

	for (const [candidatePath, candidateReasons] of candidates) {
		const reasons = [...candidateReasons];
		if (includedSources.length >= MAX_INCLUDED_FILES) {
			omittedCandidates.push({
				path: candidatePath,
				reason: "candidate-limit",
				reasons,
				note: `Skipped after the first ${MAX_INCLUDED_FILES} readable candidates to keep the packet bounded.`,
			});
			isTruncated = true;
			continue;
		}

		const resolved = resolveCandidatePath(cwd, candidatePath);
		if (resolved === undefined) {
			omittedCandidates.push({
				path: candidatePath,
				reason: "outside-cwd",
				reasons,
				note: "Rejected because it resolves outside cwd.",
			});
			continue;
		}

		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(resolved.absolutePath);
		} catch (error) {
			unreadableCandidates.push({ path: resolved.relativePath, reason: reasons[0] ?? "mentioned", reasons, note: errorMessage(error) });
			continue;
		}

		if (!stat.isFile()) {
			omittedCandidates.push({
				path: resolved.relativePath,
				reason: "not-file",
				reasons,
				note: "Candidate exists but is not a regular file.",
			});
			continue;
		}

		const loaded = readTextExcerpt(resolved.absolutePath, stat.size);
		if (!loaded.ok) {
			unreadableCandidates.push({ path: resolved.relativePath, reason: reasons[0] ?? "mentioned", reasons, note: loaded.note });
			continue;
		}

		if (loaded.isTruncated) isTruncated = true;
		includedSources.push({
			path: resolved.relativePath,
			reasons,
			excerpt: loaded.excerpt,
			isTruncated: loaded.isTruncated,
			chars: loaded.excerpt.length,
		});
	}

	const notes = [...gitEvidence.notes];
	const draft = renderCuratedContextMarkdown({
		input,
		cwd,
		gitEvidence,
		includedSources,
		omittedCandidates,
		unreadableCandidates,
	});
	const markdown = boundMarkdown(draft);
	const wasMarkdownTruncated = markdown.length !== draft.length;
	const audit: CuratedRunnerSubagentContextAudit = {
		includedPaths: includedSources.map((source) => source.path),
		omittedPaths: omittedCandidates.map((candidate) => candidate.path),
		unreadablePaths: unreadableCandidates.map((candidate) => candidate.path),
		isTruncated: isTruncated || wasMarkdownTruncated,
		markdownChars: markdown.length,
		isGitAvailable: gitEvidence.isAvailable,
		notes: wasMarkdownTruncated ? [...notes, `Auto-curated context was truncated to ${MAX_MARKDOWN_CHARS} characters.`] : notes,
	};
	return { markdown, audit };
}

async function collectGitEvidence(execGit: CuratedContextExecGit): Promise<GitEvidence> {
	const [status, diffStat] = await Promise.all([runGit(execGit, ["status", "--short"]), runGit(execGit, ["diff", "--stat"])]);
	const commands = [status, diffStat];
	const notes = commands.flatMap((command) => (command.ok ? [] : [command.diagnostic ?? "git command failed"]));
	return {
		isAvailable: commands.some((command) => command.ok),
		...(status.ok ? { statusShort: status.stdout.trim() } : {}),
		...(diffStat.ok ? { diffStat: diffStat.stdout.trim() } : {}),
		notes,
	};
}

async function runGit(execGit: CuratedContextExecGit, args: readonly string[]): Promise<CommandResult> {
	let result: ExecResult;
	try {
		result = await execGit(args, GIT_TIMEOUT_MS);
	} catch (error) {
		return { ok: false, stdout: "", diagnostic: `git ${args.join(" ")} failed: ${errorMessage(error)}` };
	}
	if (result.startupError !== undefined) {
		return { ok: false, stdout: "", diagnostic: `git ${args.join(" ")} unavailable: ${result.startupError}` };
	}
	if (result.killed) {
		return { ok: false, stdout: "", diagnostic: `git ${args.join(" ")} timed out after ${GIT_TIMEOUT_MS}ms.` };
	}
	if (result.code !== 0) {
		const stderr = result.stderr.trim();
		return { ok: false, stdout: "", diagnostic: `git ${args.join(" ")} failed${stderr.length === 0 ? "" : `: ${truncateText(stderr, 240)}`}` };
	}
	return { ok: true, stdout: result.stdout };
}

function collectFileCandidates(input: BuildCuratedRunnerSubagentContextInput, gitEvidence: GitEvidence): Map<string, Set<CandidateReason>> {
	const candidates = new Map<string, Set<CandidateReason>>();
	for (const path of extractMentionedPaths(`${input.title}\n${input.prompt}`)) addCandidate(candidates, path, "mentioned");
	for (const path of parseGitStatusPaths(gitEvidence.statusShort ?? "")) addCandidate(candidates, path, "git-status");
	return candidates;
}

function addCandidate(candidates: Map<string, Set<CandidateReason>>, path: string, reason: CandidateReason): void {
	const normalized = normalizeMentionedPath(path);
	if (normalized.length === 0) return;
	const existing = candidates.get(normalized);
	if (existing !== undefined) {
		existing.add(reason);
		return;
	}
	if (candidates.size >= MAX_CANDIDATES) return;
	candidates.set(normalized, new Set([reason]));
}

function extractMentionedPaths(text: string): readonly string[] {
	const paths = new Set<string>();
	for (const match of text.matchAll(/`([^`]+)`/g)) {
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
	return statusShort.split("\n").flatMap((line) => {
		if (line.trim().length === 0) return [];
		const path = line.slice(3).trim();
		const renameIndex = path.lastIndexOf(" -> ");
		return [renameIndex === -1 ? path : path.slice(renameIndex + 4)];
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

function readTextExcerpt(path: string, sizeBytes: number): TextExcerptResult {
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		const readBytes = Math.min(sizeBytes, MAX_FILE_READ_BYTES);
		const buffer = Buffer.alloc(readBytes);
		const bytesRead = readSync(fd, buffer, 0, readBytes, 0);
		const data = buffer.subarray(0, bytesRead);
		if (data.includes(0)) return { ok: false, note: "Skipped because the file appears to be binary." };
		const text = data.toString("utf8").replace(/\r\n?/g, "\n");
		const isTruncated = sizeBytes > bytesRead || text.length > MAX_FILE_EXCERPT_CHARS;
		return { ok: true, excerpt: truncateText(text, MAX_FILE_EXCERPT_CHARS), isTruncated };
	} catch (error) {
		return { ok: false, note: errorMessage(error) };
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

function renderCuratedContextMarkdown(options: {
	input: BuildCuratedRunnerSubagentContextInput;
	cwd: string;
	gitEvidence: GitEvidence;
	includedSources: readonly IncludedSource[];
	omittedCandidates: readonly CandidateNote[];
	unreadableCandidates: readonly CandidateNote[];
}): string {
	const sections = [
		[
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
		],
		...optionalSection("### Included sources", renderIncludedSources(options.includedSources)),
		...optionalSection("### Omitted or unreadable candidates", renderCandidateNotes(options.omittedCandidates, options.unreadableCandidates)),
	];
	return sections.flatMap((section, index) => (index === 0 ? section : ["", ...section])).join("\n");
}

function optionalSection(heading: string, body: readonly string[]): readonly string[][] {
	return body.length === 0 ? [] : [[heading, ...body]];
}

function renderGitEvidence(gitEvidence: GitEvidence): string[] {
	if (!gitEvidence.isAvailable) return ["- Git evidence unavailable; continue with explicit task context and read files directly."];
	return [
		"- Git evidence collected with `git status --short` and `git diff --stat`.",
		codeListItem("status --short", truncateText(gitEvidence.statusShort ?? "", MAX_GIT_OUTPUT_CHARS)),
		codeListItem("diff --stat", truncateText(gitEvidence.diffStat ?? "", MAX_GIT_OUTPUT_CHARS)),
	];
}

function renderIncludedSources(sources: readonly IncludedSource[]): string[] {
	return sources.flatMap((source) => [
		`#### \`${source.path}\``,
		`- Reason: ${source.reasons.join(", ")}`,
		`- Excerpt characters: ${source.chars}${source.isTruncated ? " (truncated)" : ""}`,
		"```text",
		escapeFence(source.excerpt),
		"```",
	]);
}

function renderCandidateNotes(omitted: readonly CandidateNote[], unreadable: readonly CandidateNote[]): string[] {
	const candidateLimitedCount = omitted.filter((candidate) => candidate.reason === "candidate-limit").length;
	const visibleOmitted = omitted.filter((candidate) => candidate.reason !== "candidate-limit");
	const visibleUnreadable = unreadable.filter((candidate) => candidate.reasons.includes("git-status"));
	return [
		...visibleOmitted.map((candidate) => `- Omitted \`${candidate.path}\` (${candidate.reason}): ${candidate.note}`),
		...(candidateLimitedCount === 0 ? [] : [`- Omitted ${candidateLimitedCount} candidate(s) after the first ${MAX_INCLUDED_FILES} readable files.`]),
		...visibleUnreadable.map((candidate) => `- Unreadable \`${candidate.path}\` (${candidate.reasons.join(", ")}): ${candidate.note}`),
	];
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

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "unknown error";
}
