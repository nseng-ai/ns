import { commandSucceeded } from "@nseng-ai/foundation/command";
import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { truncateText, type AutobranchExec, type PendingWorktreeSnapshot } from "./shared.ts";
import type { AutobranchGitGateway } from "./git-gateway.ts";
import type { AutobranchFlowResult } from "./flow-result.ts";
import { chooseAvailableBranchName } from "./branch-name.ts";
import {
	buildBranchSlugPrompt,
	deriveBranchSlug,
	MAX_DIFF_CHARS,
	prepareRequestedBranchSlug,
} from "./slug.ts";
import { sanitizeBranchName } from "@nseng-ai/foundation/branch-slug";
import {
	AUTOBRANCH_GIT_TIMEOUT_MS,
	DIRTY_AUTOBRANCH_WORKTREE_WARNING,
	summarizeAutobranchCompletion,
} from "./completion.ts";
import {
	formatAutobranchTransactionFailure,
	runAutobranchTransaction,
} from "./dirty-transaction.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

export type { AutobranchFlowOutcome, AutobranchFlowResult } from "./flow-result.ts";
export type { CommandResult, PendingWorktreeSnapshot } from "./shared.ts";

export {
	runAutobranchTransaction,
	type AutobranchTransactionInput,
	type AutobranchTransactionResult,
} from "./dirty-transaction.ts";

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
	modelSelection: ModelSelection;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: AutobranchExec;
	git: Pick<AutobranchGitGateway, "isBranchNameAvailable">;
	prepareCheckpointMessage: (
		snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	onPhase?: (message: string) => void;
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

export async function prepareAutobranchPlan(
	input: AutobranchPreparationInput,
): Promise<AutobranchPreparationResult> {
	const warnings: AutobranchPreparationWarning[] = [];
	if (input.args.slug === undefined) {
		input.onPhase?.("Deriving branch name…");
	}
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

	input.onPhase?.("Drafting checkpoint message…");
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
	| {
			ok: true;
			baseSlug: string;
			source: AutobranchPlan["slugSource"];
			warning?: AutobranchPreparationWarning;
	  }
	| Extract<
			AutobranchPreparationResult,
			{ kind: "invalid_requested_slug" | "slug_generation_failed" }
	  >;

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

async function readUntrackedSnippets(
	input: AutobranchPreparationInput,
	root: string,
): Promise<string> {
	const listed = await input.exec(
		"git",
		["ls-files", "--others", "--exclude-standard", "-z"],
		AUTOBRANCH_GIT_TIMEOUT_MS,
	);
	if (!commandSucceeded(listed) || listed.stdout.length === 0) {
		return "";
	}

	const readFileImpl = input.readFile ?? readFile;
	const statImpl = input.stat ?? stat;
	const files = listed.stdout.split("\0").filter(Boolean).slice(0, MAX_UNTRACKED_FILES);
	const snippets: string[] = [];
	for (const file of files) {
		const absolutePath = resolve(root, file);
		if (relative(root, absolutePath).startsWith("..")) {
			continue;
		}

		try {
			const info = await statImpl(absolutePath);
			if (!info.isFile()) {
				snippets.push(`## ${file}\n[not a regular file]`);
				continue;
			}
			const raw = await readFileImpl(absolutePath);
			const buffer = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
			if (buffer.includes(0)) {
				snippets.push(`## ${file}\n[binary file, ${info.size} bytes]`);
				continue;
			}
			const text = buffer.toString("utf8");
			snippets.push(`## ${file}\n${truncateText(text, MAX_UNTRACKED_FILE_CHARS)}`);
		} catch (error) {
			snippets.push(`## ${file}\n[could not read: ${formatErrorMessage(error)}]`);
		}
	}
	return snippets.join("\n\n");
}

async function generateSlugFromChanges(
	input: AutobranchPreparationInput,
	snapshot: AutobranchSnapshot,
): Promise<PreparedBaseSlugResult> {
	const prompt = buildSlugPrompt(snapshot);
	const result = await deriveBranchSlug({
		cwd: input.cwd,
		prompt,
		modelSelection: input.modelSelection,
		exec: input.exec,
	});
	if (result.ok) {
		return { ok: true, baseSlug: result.baseSlug, source: result.source };
	}

	const fallbackSlug = fallbackSlugFromSnapshot(snapshot);
	if (fallbackSlug) {
		return {
			ok: true,
			baseSlug: fallbackSlug,
			source: "fallback",
			warning: { kind: "slug_model_failed", fallbackSlug },
		};
	}

	return {
		ok: false,
		kind: "slug_generation_failed",
		error: `Could not derive a branch slug.\n${result.formattedFailure}`,
	};
}

function buildSlugPrompt(snapshot: AutobranchSnapshot): string {
	return buildBranchSlugPrompt({
		intro: "Generate a concise git branch slug for the pending changes below.",
		inference: "Infer the actual code, docs, or product change from the diff contents.",
		evidenceSections: [
			{ heading: "git status --porcelain", content: snapshot.status, emptyText: "(clean)" },
			{
				heading: "git diff HEAD",
				content: snapshot.diff,
				emptyText: "(no tracked diff)",
				maxChars: MAX_DIFF_CHARS,
			},
			...(snapshot.untracked
				? [
						{
							heading: "untracked file contents",
							content: snapshot.untracked,
							maxChars: MAX_DIFF_CHARS,
						},
					]
				: []),
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

export interface AutobranchFlowInput {
	cwd: string;
	modelSelection: ModelSelection;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: AutobranchExec;
	git: AutobranchGitGateway;
	prepareCheckpointMessage: (
		snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	onPhase?: (message: string) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
	now?: () => number;
}

export async function runDirtyAutobranchFlow(
	input: AutobranchFlowInput,
): Promise<AutobranchFlowResult> {
	const prepared = await prepareAutobranchPlan({
		cwd: input.cwd,
		modelSelection: input.modelSelection,
		args: input.args,
		snapshot: input.snapshot,
		exec: input.exec,
		git: input.git,
		prepareCheckpointMessage: input.prepareCheckpointMessage,
		...(input.onPhase ? { onPhase: input.onPhase } : {}),
		...(input.readFile ? { readFile: input.readFile } : {}),
		...(input.stat ? { stat: input.stat } : {}),
	});
	if (!prepared.ok) {
		// The dirty-worktree preparation failures (invalid slug, slug generation, branch name, checkpoint
		// prep) are all real failures, not declined guardrails — the clean-worktree guardrail is checked
		// by the caller before this flow runs.
		return { ok: false, outcome: "failure", error: formatAutobranchPreparationFailure(prepared) };
	}

	const warnings = prepared.warnings.map(formatAutobranchPreparationWarning);
	input.onPhase?.("Creating Graphite branch and checkpoint…");
	const transaction = await runAutobranchTransaction({
		cwd: input.cwd,
		branchName: prepared.plan.branchName,
		checkpointMessage: prepared.plan.checkpointMessage,
		exec: input.exec,
		git: input.git,
		commitPreparedCheckpointMessage: input.commitPreparedCheckpointMessage,
		...(input.now ? { now: input.now } : {}),
	});
	if (!transaction.ok) {
		return {
			ok: false,
			outcome: "failure",
			error: formatAutobranchTransactionFailure(transaction, prepared.plan.branchName),
		};
	}

	const completion = await summarizeAutobranchCompletion({
		exec: input.exec,
		plan: prepared.plan,
		dirtyWarning: DIRTY_AUTOBRANCH_WORKTREE_WARNING,
	});

	return {
		ok: true,
		isClean: completion.isClean,
		summary: [
			`New branch: ${prepared.plan.branchName}${completion.suffix}`,
			`Stacked on: ${input.snapshot.branch}`,
			`Commit: ${transaction.commitSummary}`,
			completion.cleanlinessLine,
		].join("\n"),
		warnings,
	};
}

type AutobranchPreparationFailure = Extract<AutobranchPreparationResult, { ok: false }>;

export function formatAutobranchPreparationFailure(result: AutobranchPreparationFailure): string {
	if (result.kind === "invalid_requested_slug") {
		return `Invalid branch slug: ${result.requestedSlug}`;
	}
	if (result.kind === "slug_generation_failed") {
		return result.error;
	}
	if (result.kind === "branch_name_unavailable") {
		return `Could not find an available branch name based on ${result.baseSlug}.`;
	}
	return result.error;
}

export function formatAutobranchPreparationWarning(warning: AutobranchPreparationWarning): string {
	return `Slug model failed; using fallback branch name ${warning.fallbackSlug}.`;
}
