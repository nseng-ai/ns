import { Buffer } from "node:buffer";
import { readFile as nodeReadFile, stat as nodeStat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { CommandResult } from "./checkpoint-flow.ts";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "./pending-worktree.ts";
import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName, trimBranchSlugToLength } from "./branch-slug.ts";
import { runNewBranchTransaction, type NewBranchTransactionResult } from "./newbr-transaction.ts";

export const NEWBR_COMMAND_NAME = "newbr";
const GPT_NANO_PROVIDER = "openai";
const GPT_NANO_MODEL = "gpt-5.4-nano";
const SLUG_TIMEOUT_MS = 60_000;
const GIT_TIMEOUT_MS = 30_000;
const MAX_DIFF_CHARS = 24_000;
const MAX_UNTRACKED_FILES = 12;
const MAX_UNTRACKED_FILE_CHARS = 4_000;

export type ParsedNewBranchArgs = {
	slug?: string;
};

export type NewBranchSnapshot = PendingWorktreeSnapshot & {
	untracked: string;
};

export type FileStat = {
	size: number;
	isFile(): boolean;
};

export type NewBranchFlowInput = {
	cwd: string;
	args: ParsedNewBranchArgs;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (message: string) => Promise<{ summary: string } | { error: string }>;
	notify: (message: string, level: "info" | "warning" | "error" | "success") => void;
	setStatus: (message: string | undefined) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
	now?: () => number;
};

export async function createNewBranchCheckpointFlow(input: NewBranchFlowInput): Promise<void> {
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: input.cwd,
		execGit: (args, timeout) => input.exec("git", args, input.cwd, timeout),
	});
	if (!loaded.ok) {
		input.notify(formatNewBranchSnapshotError(loaded.error), "error");
		return;
	}

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		input.notify("Working tree is clean; nothing to move to a new branch.", "warning");
		return;
	}

	const requestedSlug = input.args.slug ? sanitizeBranchName(input.args.slug) : undefined;
	if (input.args.slug && !requestedSlug) {
		input.notify(`Invalid branch slug: ${input.args.slug}`, "error");
		return;
	}

	let baseSlug: string;
	if (requestedSlug) {
		baseSlug = requestedSlug;
	} else {
		const untracked = await readUntrackedSnippets(input, snapshot.root);
		const generated = await generateSlugFromChanges(input, { ...snapshot, untracked });
		if ("error" in generated) {
			input.notify(generated.error, "error");
			return;
		}
		baseSlug = generated.slug;
	}

	const branchName = await chooseAvailableBranchName(input, baseSlug);
	if ("error" in branchName) {
		input.notify(branchName.error, "error");
		return;
	}

	const prepared = await input.prepareCheckpointMessage(snapshot);
	if (!prepared.ok) {
		input.notify(prepared.error, "error");
		return;
	}

	const transaction = await runNewBranchTransaction({
		cwd: input.cwd,
		branchName: branchName.name,
		checkpointMessage: prepared.message,
		exec: input.exec,
		commitPreparedCheckpointMessage: input.commitPreparedCheckpointMessage,
		setStatus: input.setStatus,
		...(input.now ? { now: input.now } : {}),
	});
	if (!transaction.ok) {
		input.notify(formatNewBranchTransactionFailure(transaction, branchName.name), "error");
		return;
	}

	const cleanliness = await input.exec("git", ["status", "--porcelain=v1"], input.cwd, GIT_TIMEOUT_MS);
	const clean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
	const suffix = branchName.usedSuffix ? ` (base slug ${baseSlug} was unavailable)` : "";

	input.notify(
		[
			`New branch: ${branchName.name}${suffix}`,
			`Stacked on: ${snapshot.branch}`,
			`Commit: ${transaction.commitSummary}`,
			clean ? "Working directory is clean." : "Warning: working directory is not clean after checkpoint.",
		].join("\n"),
		clean ? "success" : "warning",
	);
}

export function parseNewBranchArgs(argsText: string): ParsedNewBranchArgs {
	const parts = argsText.trim().split(/\s+/).filter(Boolean);
	const parsed: ParsedNewBranchArgs = {};
	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		const next = parts[index + 1];
		if (part === "--slug" && next) {
			parsed.slug = next;
			index += 1;
		} else if (part?.startsWith("--slug=")) {
			const value = part.slice("--slug=".length);
			if (value) {
				parsed.slug = value;
			}
		}
	}
	return parsed;
}

function formatNewBranchSnapshotError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Detached HEAD; check out a branch before running /${NEWBR_COMMAND_NAME}.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not read git status.\n${details}`;
	}
	return `Could not read git diff.\n${details}`;
}

async function readUntrackedSnippets(input: NewBranchFlowInput, root: string): Promise<string> {
	const listed = await input.exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], input.cwd, GIT_TIMEOUT_MS);
	if (listed.code !== 0 || listed.stdout.length === 0) {
		return "";
	}

	const readFile = input.readFile ?? nodeReadFile;
	const stat = input.stat ?? nodeStat;
	const files = listed.stdout.split("\0").filter(Boolean).slice(0, MAX_UNTRACKED_FILES);
	const snippets: string[] = [];
	for (const file of files) {
		const absolutePath = resolve(root, file);
		if (relative(root, absolutePath).startsWith("..")) {
			continue;
		}

		try {
			const info = await stat(absolutePath);
			if (!info.isFile()) {
				snippets.push(`## ${file}\n[not a regular file]`);
				continue;
			}
			const raw = await readFile(absolutePath);
			const buffer = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
			if (buffer.includes(0)) {
				snippets.push(`## ${file}\n[binary file, ${info.size} bytes]`);
				continue;
			}
			const text = buffer.toString("utf8");
			const truncated = text.length > MAX_UNTRACKED_FILE_CHARS;
			snippets.push(`## ${file}\n${text.slice(0, MAX_UNTRACKED_FILE_CHARS)}${truncated ? "\n...[truncated]" : ""}`);
		} catch (error) {
			snippets.push(`## ${file}\n[could not read: ${errorMessage(error)}]`);
		}
	}
	return snippets.join("\n\n");
}

async function generateSlugFromChanges(input: NewBranchFlowInput, snapshot: NewBranchSnapshot): Promise<{ slug: string } | { error: string }> {
	input.setStatus("generating branch slug…");
	try {
		const prompt = buildSlugPrompt(snapshot);
		const result = await input.exec(
			"pi",
			[
				"--provider",
				GPT_NANO_PROVIDER,
				"--model",
				GPT_NANO_MODEL,
				"--thinking",
				"low",
				"--no-session",
				"--no-extensions",
				"--no-skills",
				"--no-prompt-templates",
				"--no-context-files",
				"--no-tools",
				"--mode",
				"text",
				"--print",
				prompt,
			],
			input.cwd,
			SLUG_TIMEOUT_MS,
		);

		const modelSlug = result.code === 0 ? sanitizeBranchName(result.stdout) : undefined;
		const fallbackSlug = fallbackSlugFromSnapshot(snapshot);
		const slug = modelSlug ?? fallbackSlug;
		if (!slug) {
			return { error: `Could not derive a branch slug.\n${formatCommandDetails(result)}` };
		}
		if (result.code !== 0) {
			input.notify(`Slug model failed; using fallback branch name ${slug}.`, "warning");
		}
		return { slug };
	} finally {
		input.setStatus(undefined);
	}
}

function buildSlugPrompt(snapshot: NewBranchSnapshot): string {
	return [
		"Generate a concise git branch slug for the pending changes below.",
		"Infer the actual code, docs, or product change from the diff contents.",
		"Rules:",
		"- Return only the slug, with no quotes, markdown, or explanation.",
		"- Use kebab-case lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural, such as add, fix, refactor, migrate, rename, remove, or update.",
		"- Do not use slashes, spaces, underscores, punctuation, or special characters.",
		"- Prefer concrete deliverables and specific nouns from the diff over broad words like changes or cleanup.",
		"",
		"## git status --porcelain",
		snapshot.status.trim() || "(clean)",
		"",
		"## git diff HEAD",
		truncate(snapshot.diff.trim() || "(no tracked diff)", MAX_DIFF_CHARS),
		snapshot.untracked ? "" : undefined,
		snapshot.untracked ? "## untracked file contents" : undefined,
		snapshot.untracked ? truncate(snapshot.untracked, MAX_DIFF_CHARS) : undefined,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function fallbackSlugFromSnapshot(snapshot: NewBranchSnapshot): string | undefined {
	const changedPaths = snapshot.status
		.split("\n")
		.map((line) => line.slice(3).trim())
		.map((line) => line.replace(/^.* -> /, ""))
		.filter(Boolean);
	const basenameWords = changedPaths
		.slice(0, 4)
		.map((path) => path.split("/").pop() ?? path)
		.join(" ");
	return sanitizeBranchName(`update ${basenameWords || snapshot.branch}`);
}

async function chooseAvailableBranchName(
	input: NewBranchFlowInput,
	baseSlug: string,
): Promise<{ name: string; usedSuffix: boolean } | { error: string }> {
	for (let index = 0; index < 50; index += 1) {
		const suffix = index === 0 ? "" : `-${index + 1}`;
		const candidate = trimBranchSlugToLength(baseSlug, MAX_BRANCH_SLUG_LENGTH - suffix.length) + suffix;
		const valid = await input.exec("git", ["check-ref-format", "--branch", candidate], input.cwd, GIT_TIMEOUT_MS);
		if (valid.code !== 0) {
			continue;
		}
		const exists = await input.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], input.cwd, GIT_TIMEOUT_MS);
		if (exists.code !== 0) {
			return { name: candidate, usedSuffix: index > 0 };
		}
	}
	return { error: `Could not find an available branch name based on ${baseSlug}.` };
}

type NewBranchTransactionFailure = Extract<NewBranchTransactionResult, { ok: false }>;

function formatNewBranchTransactionFailure(result: NewBranchTransactionFailure, branchName: string): string {
	if (result.kind === "stash_failed") {
		return [`Failed to stash pending changes before branch creation.`, result.error].join("\n");
	}
	if (result.kind === "stash_ref_missing") {
		return [
			`Stashed pending changes, but could not find the new stash entry for ${result.stashMessage}.`,
			"Inspect `git stash list` before continuing.",
			result.error,
		].join("\n");
	}
	if (result.kind === "graphite_create_failed") {
		return [
			`Failed to create Graphite branch ${branchName}.`,
			result.createError,
			result.restored ? "Restored pending changes to the original branch." : `Could not restore pending changes: ${result.restoreError}`,
		].join("\n");
	}
	if (result.kind === "restore_failed_after_branch_create") {
		return [
			`Created branch ${branchName}, but failed to restore pending changes from the stash.`,
			result.restoreError,
			"Inspect `git stash list` before continuing.",
		].join("\n");
	}
	return `Branch ${branchName} exists, but checkpoint commit failed. Pending changes remain on that branch.\n${result.commitError}`;
}

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function formatCommandDetails(result: CommandResult): string {
	return formatPendingWorktreeCommandDetails(result);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
