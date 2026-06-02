import { Buffer } from "node:buffer";
import { readFile as nodeReadFile, stat as nodeStat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName, trimBranchSlugToLength } from "./branch-slug.ts";
import type { CommandResult } from "./checkpoint-flow.ts";
import { deriveSlugWithModel, formatSlugModelFailure, SLUG_MODEL_TIMEOUT_MS } from "./model-slug.ts";
import type { PendingWorktreeSnapshot } from "./pending-worktree.ts";
const GIT_TIMEOUT_MS = 30_000;
const MAX_DIFF_CHARS = 24_000;
const MAX_UNTRACKED_FILES = 12;
const MAX_UNTRACKED_FILE_CHARS = 4_000;

export interface ParsedNewBranchArgs {
	slug?: string;
}

export interface NewBranchSnapshot extends PendingWorktreeSnapshot {
	untracked: string;
}

export interface FileStat {
	size: number;
	isFile(): boolean;
}

export interface NewBranchPreparationInput {
	cwd: string;
	args: ParsedNewBranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	setStatus: (message: string | undefined) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
}

export interface NewBranchPlan {
	branchName: string;
	baseSlug: string;
	slugSource: "requested" | "model" | "fallback";
	usedSuffix: boolean;
	checkpointMessage: string;
}

export interface NewBranchPreparationWarning {
	kind: "slug_model_failed";
	fallbackSlug: string;
}

export type NewBranchPreparationResult =
	| { ok: true; plan: NewBranchPlan; warnings: NewBranchPreparationWarning[] }
	| { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
	| { ok: false; kind: "slug_generation_failed"; error: string }
	| { ok: false; kind: "branch_name_unavailable"; baseSlug: string }
	| { ok: false; kind: "checkpoint_prepare_failed"; error: string };

export async function prepareNewBranchPlan(input: NewBranchPreparationInput): Promise<NewBranchPreparationResult> {
	const warnings: NewBranchPreparationWarning[] = [];
	const slug = await prepareBaseSlug(input);
	if (!slug.ok) {
		return slug;
	}
	if (slug.warning) {
		warnings.push(slug.warning);
	}

	const branchName = await chooseAvailableBranchName(input, slug.baseSlug);
	if (!branchName.ok) {
		return { ok: false, kind: "branch_name_unavailable", baseSlug: slug.baseSlug };
	}

	const prepared = await input.prepareCheckpointMessage(input.snapshot);
	if (!prepared.ok) {
		return { ok: false, kind: "checkpoint_prepare_failed", error: prepared.error };
	}

	return {
		ok: true,
		plan: {
			branchName: branchName.name,
			baseSlug: slug.baseSlug,
			slugSource: slug.source,
			usedSuffix: branchName.usedSuffix,
			checkpointMessage: prepared.message,
		},
		warnings,
	};
}

type PreparedBaseSlugResult =
	| { ok: true; baseSlug: string; source: NewBranchPlan["slugSource"]; warning?: NewBranchPreparationWarning }
	| Extract<NewBranchPreparationResult, { kind: "invalid_requested_slug" | "slug_generation_failed" }>;

async function prepareBaseSlug(input: NewBranchPreparationInput): Promise<PreparedBaseSlugResult> {
	if (input.args.slug) {
		const requestedSlug = sanitizeBranchName(input.args.slug);
		if (!requestedSlug) {
			return { ok: false, kind: "invalid_requested_slug", requestedSlug: input.args.slug };
		}
		return { ok: true, baseSlug: requestedSlug, source: "requested" };
	}

	const untracked = await readUntrackedSnippets(input, input.snapshot.root);
	return generateSlugFromChanges(input, { ...input.snapshot, untracked });
}

async function readUntrackedSnippets(input: NewBranchPreparationInput, root: string): Promise<string> {
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

async function generateSlugFromChanges(input: NewBranchPreparationInput, snapshot: NewBranchSnapshot): Promise<PreparedBaseSlugResult> {
	input.setStatus("generating branch slug…");
	try {
		const prompt = buildSlugPrompt(snapshot);
		const result = await deriveSlugWithModel({
			cwd: input.cwd,
			prompt,
			slugKind: "branch slug",
			normalizeOutput: sanitizeBranchName,
			exec: (command, args, options) =>
				input.exec(command, args, options.cwd ?? input.cwd, options.timeout ?? SLUG_MODEL_TIMEOUT_MS),
		});

		if (result.ok) {
			return { ok: true, baseSlug: result.evidence.slug, source: "model" };
		}

		const fallbackSlug = fallbackSlugFromSnapshot(snapshot);
		if (fallbackSlug) {
			return { ok: true, baseSlug: fallbackSlug, source: "fallback", warning: { kind: "slug_model_failed", fallbackSlug } };
		}

		return { ok: false, kind: "slug_generation_failed", error: `Could not derive a branch slug.\n${formatSlugModelFailure(result.failure)}` };
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

async function chooseAvailableBranchName(input: NewBranchPreparationInput, baseSlug: string): Promise<{ ok: true; name: string; usedSuffix: boolean } | { ok: false }> {
	for (let index = 0; index < 50; index += 1) {
		const suffix = index === 0 ? "" : `-${index + 1}`;
		const candidate = trimBranchSlugToLength(baseSlug, MAX_BRANCH_SLUG_LENGTH - suffix.length) + suffix;
		const valid = await input.exec("git", ["check-ref-format", "--branch", candidate], input.cwd, GIT_TIMEOUT_MS);
		if (valid.code !== 0) {
			continue;
		}
		const exists = await input.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], input.cwd, GIT_TIMEOUT_MS);
		if (exists.code !== 0) {
			return { ok: true, name: candidate, usedSuffix: index > 0 };
		}
	}
	return { ok: false };
}

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
