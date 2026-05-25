import { Buffer } from "node:buffer";
import { readFile as nodeReadFile, stat as nodeStat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { CommandResult } from "./checkpoint-flow.ts";
import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName, trimBranchSlugToLength } from "./branch-slug.ts";

export const NEWBR_COMMAND_NAME = "newbr";
const GPT_NANO_PROVIDER = "openai";
const GPT_NANO_MODEL = "gpt-5.4-nano";
const SLUG_TIMEOUT_MS = 60_000;
const GIT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;
const MAX_DIFF_CHARS = 24_000;
const MAX_UNTRACKED_FILES = 12;
const MAX_UNTRACKED_FILE_CHARS = 4_000;

export type ParsedNewBranchArgs = {
	slug?: string;
};

export type GitSnapshot = {
	root: string;
	branch: string;
	status: string;
	diff: string;
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
	prepareCheckpointMessage: (status: string, diff: string) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (message: string) => Promise<{ summary: string } | { error: string }>;
	notify: (message: string, level: "info" | "warning" | "error" | "success") => void;
	setStatus: (message: string | undefined) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
	now?: () => number;
};

export async function createNewBranchCheckpointFlow(input: NewBranchFlowInput): Promise<void> {
	const snapshot = await loadGitSnapshot(input);
	if ("error" in snapshot) {
		input.notify(snapshot.error, "error");
		return;
	}
	if (snapshot.status.trim().length === 0) {
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
		const generated = await generateSlugFromChanges(input, snapshot);
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

	const prepared = await input.prepareCheckpointMessage(snapshot.status, snapshot.diff);
	if (!prepared.ok) {
		input.notify(prepared.error, "error");
		return;
	}

	const stashMessage = `pi-newbr:${input.now?.() ?? Date.now()}:${branchName.name}`;
	const stashed = await stashPendingChanges(input, stashMessage);
	if ("error" in stashed) {
		input.notify(stashed.error, "error");
		return;
	}

	input.setStatus(`creating ${branchName.name}…`);
	try {
		const created = await input.exec("gt", ["create", branchName.name, "--no-interactive", "--no-ai"], input.cwd, GT_TIMEOUT_MS);
		if (created.code !== 0) {
			const restored = await restoreStash(input, stashed.ref);
			input.notify(
				[
					`Failed to create Graphite branch ${branchName.name}.`,
					formatCommandDetails(created),
					restored.ok ? "Restored pending changes to the original branch." : `Could not restore pending changes: ${restored.error}`,
				]
					.filter(Boolean)
					.join("\n"),
				"error",
			);
			return;
		}
	} finally {
		input.setStatus(undefined);
	}

	const restored = await restoreStash(input, stashed.ref);
	if (!restored.ok) {
		input.notify(
			[
				`Created branch ${branchName.name}, but failed to restore pending changes from the stash.`,
				restored.error,
				"Inspect `git stash list` before continuing.",
			].join("\n"),
			"error",
		);
		return;
	}

	input.notify(`Created ${branchName.name}; creating checkpoint commit…`, "info");
	const committed = await input.commitPreparedCheckpointMessage(prepared.message);
	if ("error" in committed) {
		input.notify(`Branch ${branchName.name} exists, but checkpoint commit failed. Pending changes remain on that branch.\n${committed.error}`, "error");
		return;
	}

	const cleanliness = await input.exec("git", ["status", "--porcelain=v1"], input.cwd, GIT_TIMEOUT_MS);
	const clean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
	const suffix = branchName.usedSuffix ? ` (base slug ${baseSlug} was unavailable)` : "";

	input.notify(
		[
			`New branch: ${branchName.name}${suffix}`,
			`Stacked on: ${snapshot.branch}`,
			`Commit: ${committed.summary}`,
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

async function loadGitSnapshot(input: NewBranchFlowInput): Promise<GitSnapshot | { error: string }> {
	const root = await input.exec("git", ["rev-parse", "--show-toplevel"], input.cwd, GIT_TIMEOUT_MS);
	if (root.code !== 0) {
		return { error: `Not inside a git repository.\n${formatCommandDetails(root)}` };
	}

	const branch = await input.exec("git", ["symbolic-ref", "--short", "HEAD"], input.cwd, GIT_TIMEOUT_MS);
	if (branch.code !== 0) {
		return { error: `Detached HEAD; check out a branch before running /${NEWBR_COMMAND_NAME}.\n${formatCommandDetails(branch)}` };
	}

	const status = await input.exec("git", ["status", "--porcelain=v1"], input.cwd, GIT_TIMEOUT_MS);
	if (status.code !== 0) {
		return { error: `Could not read git status.\n${formatCommandDetails(status)}` };
	}

	const diff = await input.exec("git", ["diff", "HEAD", "--no-ext-diff"], input.cwd, GIT_TIMEOUT_MS);
	if (diff.code !== 0) {
		return { error: `Could not read git diff.\n${formatCommandDetails(diff)}` };
	}

	const untracked = await readUntrackedSnippets(input, root.stdout.trim());
	return {
		root: root.stdout.trim(),
		branch: branch.stdout.trim(),
		status: status.stdout,
		diff: diff.stdout,
		untracked,
	};
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

async function generateSlugFromChanges(input: NewBranchFlowInput, snapshot: GitSnapshot): Promise<{ slug: string } | { error: string }> {
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

function buildSlugPrompt(snapshot: GitSnapshot): string {
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

function fallbackSlugFromSnapshot(snapshot: GitSnapshot): string | undefined {
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

async function stashPendingChanges(input: NewBranchFlowInput, message: string): Promise<{ ok: true; ref: string } | { error: string }> {
	input.setStatus("stashing pending changes…");
	try {
		const stashed = await input.exec("git", ["stash", "push", "--include-untracked", "-m", message], input.cwd, GT_TIMEOUT_MS);
		if (stashed.code !== 0) {
			return { error: `Failed to stash pending changes before branch creation.\n${formatCommandDetails(stashed)}` };
		}

		const ref = await findStashRef(input, message);
		if (!ref) {
			return { error: `Stashed pending changes, but could not find the new stash entry for ${message}. Inspect \`git stash list\`.` };
		}
		return { ok: true, ref };
	} finally {
		input.setStatus(undefined);
	}
}

async function findStashRef(input: NewBranchFlowInput, message: string): Promise<string | undefined> {
	const listed = await input.exec("git", ["stash", "list", "--format=%gd%x00%s"], input.cwd, GIT_TIMEOUT_MS);
	if (listed.code !== 0) {
		return undefined;
	}
	for (const line of listed.stdout.split("\n")) {
		const [ref, subject] = line.split("\0");
		if (ref && subject?.includes(message)) {
			return ref;
		}
	}
	return undefined;
}

async function restoreStash(input: NewBranchFlowInput, ref: string): Promise<{ ok: true } | { ok: false; error: string }> {
	input.setStatus("restoring pending changes…");
	try {
		const restored = await input.exec("git", ["stash", "pop", ref], input.cwd, GT_TIMEOUT_MS);
		if (restored.code !== 0) {
			return { ok: false, error: formatCommandDetails(restored) };
		}
		return { ok: true };
	} finally {
		input.setStatus(undefined);
	}
}

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function formatCommandDetails(result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
