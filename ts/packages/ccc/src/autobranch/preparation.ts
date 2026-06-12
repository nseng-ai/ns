import { Buffer } from "node:buffer";
import { readFile as nodeReadFile, stat as nodeStat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { formatErrorMessage } from "@asdl/core/primitives";
import type { CommandResult } from "asdl-dev/checkpoint-flow";
import type { PendingWorktreeSnapshot } from "asdl-dev/pending-worktree";

import { chooseAvailableBranchName } from "./branch-name.ts";
import { buildBranchSlugPrompt, deriveBranchSlug, MAX_DIFF_CHARS, prepareRequestedBranchSlug } from "./slug.ts";
import { sanitizeBranchName } from "@asdl/pi-extension-runtime/branch-slug";

const GIT_TIMEOUT_MS = 30_000;
const MAX_UNTRACKED_FILES = 12;
const MAX_UNTRACKED_FILE_CHARS = 4_000;

export interface ParsedAutobranchArgs {
	slug?: string;
}

export interface AutobranchSnapshot extends PendingWorktreeSnapshot {
	untracked: string;
}

export interface FileStat {
	size: number;
	isFile(): boolean;
}

export interface AutobranchPreparationInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
}

export interface AutobranchPlan {
	branchName: string;
	baseSlug: string;
	slugSource: "requested" | "model" | "fallback";
	hasSuffix: boolean;
	checkpointMessage: string;
}

export interface AutobranchPreparationWarning {
	kind: "slug_model_failed";
	fallbackSlug: string;
}

export type AutobranchPreparationResult =
	| { ok: true; plan: AutobranchPlan; warnings: AutobranchPreparationWarning[] }
	| { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
	| { ok: false; kind: "slug_generation_failed"; error: string }
	| { ok: false; kind: "branch_name_unavailable"; baseSlug: string }
	| { ok: false; kind: "checkpoint_prepare_failed"; error: string };

export async function prepareAutobranchPlan(input: AutobranchPreparationInput): Promise<AutobranchPreparationResult> {
	const warnings: AutobranchPreparationWarning[] = [];
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
			hasSuffix: branchName.hasSuffix,
			checkpointMessage: prepared.message,
		},
		warnings,
	};
}

type PreparedBaseSlugResult =
	| { ok: true; baseSlug: string; source: AutobranchPlan["slugSource"]; warning?: AutobranchPreparationWarning }
	| Extract<AutobranchPreparationResult, { kind: "invalid_requested_slug" | "slug_generation_failed" }>;

async function prepareBaseSlug(input: AutobranchPreparationInput): Promise<PreparedBaseSlugResult> {
	const requested = prepareRequestedBranchSlug(input.args.slug);
	if (requested.kind === "invalid_requested_slug") {
		return { ok: false, kind: "invalid_requested_slug", requestedSlug: requested.requestedSlug };
	}
	if (requested.kind === "slug") {
		return { ok: true, baseSlug: requested.baseSlug, source: requested.source };
	}

	const untracked = await readUntrackedSnippets(input, input.snapshot.root);
	return generateSlugFromChanges(input, { ...input.snapshot, untracked });
}

async function readUntrackedSnippets(input: AutobranchPreparationInput, root: string): Promise<string> {
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
			const isTruncated = text.length > MAX_UNTRACKED_FILE_CHARS;
			snippets.push(`## ${file}\n${text.slice(0, MAX_UNTRACKED_FILE_CHARS)}${isTruncated ? "\n...[truncated]" : ""}`);
		} catch (error) {
			snippets.push(`## ${file}\n[could not read: ${formatErrorMessage(error)}]`);
		}
	}
	return snippets.join("\n\n");
}

async function generateSlugFromChanges(input: AutobranchPreparationInput, snapshot: AutobranchSnapshot): Promise<PreparedBaseSlugResult> {
	const prompt = buildSlugPrompt(snapshot);
	const result = await deriveBranchSlug({ cwd: input.cwd, prompt, exec: input.exec });
	if (result.ok) {
		return { ok: true, baseSlug: result.baseSlug, source: result.source };
	}

	const fallbackSlug = fallbackSlugFromSnapshot(snapshot);
	if (fallbackSlug) {
		return { ok: true, baseSlug: fallbackSlug, source: "fallback", warning: { kind: "slug_model_failed", fallbackSlug } };
	}

	return { ok: false, kind: "slug_generation_failed", error: `Could not derive a branch slug.\n${result.formattedFailure}` };
}

function buildSlugPrompt(snapshot: AutobranchSnapshot): string {
	return buildBranchSlugPrompt({
		intro: "Generate a concise git branch slug for the pending changes below.",
		inference: "Infer the actual code, docs, or product change from the diff contents.",
		evidenceSections: [
			{ heading: "git status --porcelain", content: snapshot.status, emptyText: "(clean)" },
			{ heading: "git diff HEAD", content: snapshot.diff, emptyText: "(no tracked diff)", maxChars: MAX_DIFF_CHARS },
			...(snapshot.untracked ? [{ heading: "untracked file contents", content: snapshot.untracked, maxChars: MAX_DIFF_CHARS }] : []),
		],
	});
}

function fallbackSlugFromSnapshot(snapshot: AutobranchSnapshot): string | undefined {
	const changedPaths = snapshot.status
		.split("\n")
		.map((line) => line.slice(3).trim())
		.map((line) => line.replace(/^.* -> /, ""))
		.filter(Boolean);
	const basenameWords = changedPaths
		.slice(0, 4)
		.map((path) => path.split("/").pop() ?? path)
		.join(" ");
	return sanitizeBranchName(`update ${basenameWords.length > 0 ? basenameWords : snapshot.branch}`);
}
