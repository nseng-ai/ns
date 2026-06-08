import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";

import { chooseAvailableBranchName, findAvailableBranchName } from "./autobranch-branch-name.ts";
import type { ParsedAutobranchArgs } from "./autobranch-preparation.ts";
import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName } from "./branch-slug.ts";
import { shortSha } from "./land-stack/command-exec.ts";
import { formatCommandDetails, truncateText, withStatus } from "./autobranch-shared.ts";
import { inspectUpstreamHeadState } from "./autobranch-upstream.ts";
import { deriveSlugWithModel, formatSlugModelFailure, SLUG_MODEL_TIMEOUT_MS } from "./model-slug.ts";

const GIT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;
const MAX_DIFF_CHARS = 24_000;
const MAX_BACKUP_SEGMENT_CHARS = 32;

type NoticeLevel = "info" | "warning" | "error" | "success";

export interface LatestCommitAutobranchInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	notify: (message: string, level: NoticeLevel) => void;
	setStatus: (message: string | undefined) => void;
	now?: () => number;
}

interface LatestCommitFacts {
	sourceBranch: string;
	trunkBranch: string;
	originalHeadSha: string;
	parentSha: string;
	commitMessage: string;
	commitDiff: string;
	commitSummary: string;
	upstream?: string;
}

export interface LatestCommitAutobranchPlan extends LatestCommitFacts {
	branchName: string;
	baseSlug: string;
	hasSuffix: boolean;
	slugSource: "requested" | "model";
}

export type LatestCommitPreparationResult =
	| { ok: true; plan: LatestCommitAutobranchPlan }
	| { ok: false; kind: "trunk_lookup_failed"; error: string }
	| { ok: false; kind: "trunk_refusal"; branch: string }
	| { ok: false; kind: "upstream_check_failed"; error: string }
	| { ok: false; kind: "pushed_head_refusal"; upstream: string }
	| { ok: false; kind: "commit_parent_lookup_failed"; error: string }
	| { ok: false; kind: "root_commit_refusal"; headSha: string }
	| { ok: false; kind: "merge_commit_refusal"; headSha: string; parentCount: number }
	| { ok: false; kind: "commit_evidence_failed"; error: string }
	| { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
	| { ok: false; kind: "slug_generation_failed"; error: string }
	| { ok: false; kind: "branch_name_unavailable"; baseSlug: string };

type CreatedBranchRecovery =
	| { restored: true; createdBranchDeleted: true }
	| { restored: true; createdBranchDeleted: false; createdBranchDeleteError: string }
	| { restored: false; restoreError: string; createdBranchDeleted: false; createdBranchDeleteError: string };

export type LatestCommitTransactionResult =
	| { ok: true; commitSummary: string; backupDeleted: true }
	| { ok: true; commitSummary: string; backupDeleted: false; backupBranch: string; backupDeleteError: string }
	| { ok: false; kind: "backup_branch_name_unavailable"; sourceBranch: string }
	| { ok: false; kind: "backup_create_failed"; error: string }
	| { ok: false; kind: "source_reset_failed"; backupBranch: string; error: string }
	| { ok: false; kind: "graphite_create_failed"; backupBranch: string; createError: string; restored: true }
	| { ok: false; kind: "graphite_create_failed"; backupBranch: string; createError: string; restored: false; restoreError: string }
	| ({ ok: false; kind: "branch_reset_failed"; backupBranch: string; branchName: string; resetError: string } & CreatedBranchRecovery)
	| ({ ok: false; kind: "head_verify_failed"; backupBranch: string; branchName: string; actualHead: string } & CreatedBranchRecovery);

export async function createLatestCommitAutobranchFlow(input: LatestCommitAutobranchInput): Promise<void> {
	const prepared = await prepareLatestCommitAutobranchPlan(input);
	if (!prepared.ok) {
		input.notify(formatLatestCommitPreparationFailure(prepared), "error");
		return;
	}

	const transaction = await runLatestCommitAutobranchTransaction({
		cwd: input.cwd,
		plan: prepared.plan,
		exec: input.exec,
		setStatus: input.setStatus,
		...(input.now ? { now: input.now } : {}),
	});
	if (!transaction.ok) {
		input.notify(formatLatestCommitTransactionFailure(transaction), "error");
		return;
	}

	const cleanliness = await input.exec("git", ["status", "--porcelain=v1"], input.cwd, GIT_TIMEOUT_MS);
	const clean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
	const suffix = prepared.plan.hasSuffix ? ` (base slug ${prepared.plan.baseSlug} was unavailable)` : "";
	const lines = [
		`New branch: ${prepared.plan.branchName}${suffix}`,
		`Moved commit: ${transaction.commitSummary}`,
		`Source branch ${prepared.plan.sourceBranch} reset to ${shortSha(prepared.plan.parentSha)}.`,
		clean ? "Working directory is clean." : "Warning: working directory is not clean after latest-commit autobranch.",
	];
	if (!transaction.backupDeleted) {
		lines.push(`Warning: recovery branch ${transaction.backupBranch} could not be deleted: ${transaction.backupDeleteError}`);
	}
	input.notify(lines.join("\n"), clean && transaction.backupDeleted ? "success" : "warning");
}

export async function prepareLatestCommitAutobranchPlan(
	input: Pick<LatestCommitAutobranchInput, "args" | "cwd" | "exec" | "setStatus" | "snapshot">,
): Promise<LatestCommitPreparationResult> {
	const requestedSlug = prepareRequestedLatestCommitSlug(input.args);
	if (!requestedSlug.ok) {
		return requestedSlug;
	}

	const facts = await loadLatestCommitFacts(input);
	if (!facts.ok) {
		return facts;
	}

	const slug = requestedSlug.slug ?? (await prepareLatestCommitSlug(input, facts.facts));
	if (!slug.ok) {
		return slug;
	}

	const branchName = await chooseAvailableBranchName(input, slug.baseSlug);
	if (!branchName.ok) {
		return { ok: false, kind: "branch_name_unavailable", baseSlug: slug.baseSlug };
	}

	return {
		ok: true,
		plan: {
			...facts.facts,
			branchName: branchName.name,
			baseSlug: slug.baseSlug,
			hasSuffix: branchName.hasSuffix,
			slugSource: slug.source,
		},
	};
}

export interface LatestCommitTransactionInput {
	cwd: string;
	plan: LatestCommitAutobranchPlan;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	setStatus: (message: string | undefined) => void;
	now?: () => number;
}

export async function runLatestCommitAutobranchTransaction(input: LatestCommitTransactionInput): Promise<LatestCommitTransactionResult> {
	const backupBranch = await chooseAvailableBackupBranchName(input, input.plan.sourceBranch, input.now?.() ?? Date.now());
	if (!backupBranch.ok) {
		return { ok: false, kind: "backup_branch_name_unavailable", sourceBranch: input.plan.sourceBranch };
	}

	const backupCreated = await withStatus(input, "creating recovery branch…", () =>
		input.exec("git", ["branch", backupBranch.name, input.plan.originalHeadSha], input.cwd, GIT_TIMEOUT_MS),
	);
	if (backupCreated.code !== 0) {
		return { ok: false, kind: "backup_create_failed", error: formatCommandDetails(backupCreated) };
	}

	const resetSource = await resetSourceBranchToParent(input);
	if (!resetSource.ok) {
		return { ok: false, kind: "source_reset_failed", backupBranch: backupBranch.name, error: resetSource.error };
	}

	const created = await withStatus(input, `creating ${input.plan.branchName}…`, () =>
		input.exec("gt", ["create", input.plan.branchName, "--no-interactive", "--no-ai"], input.cwd, GT_TIMEOUT_MS),
	);
	if (created.code !== 0) {
		const restored = await restoreSourceBranch(input);
		if (restored.ok) {
			return { ok: false, kind: "graphite_create_failed", backupBranch: backupBranch.name, createError: formatCommandDetails(created), restored: true };
		}
		return {
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: backupBranch.name,
			createError: formatCommandDetails(created),
			restored: false,
			restoreError: restored.error,
		};
	}

	const resetBranch = await withStatus(input, `moving ${input.plan.branchName} to original commit…`, () =>
		input.exec("git", ["reset", "--hard", input.plan.originalHeadSha], input.cwd, GIT_TIMEOUT_MS),
	);
	if (resetBranch.code !== 0) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "branch_reset_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			resetError: formatCommandDetails(resetBranch),
			...recovery,
		};
	}

	const verified = await input.exec("git", ["rev-parse", "HEAD"], input.cwd, GIT_TIMEOUT_MS);
	const actualHead = verified.stdout.trim();
	if (verified.code !== 0 || actualHead !== input.plan.originalHeadSha) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "head_verify_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			actualHead: actualHead || formatCommandDetails(verified),
			...recovery,
		};
	}

	const deleted = await withStatus(input, "cleaning up recovery branch…", () => input.exec("git", ["branch", "-D", backupBranch.name], input.cwd, GIT_TIMEOUT_MS));
	if (deleted.code !== 0) {
		return { ok: true, commitSummary: input.plan.commitSummary, backupDeleted: false, backupBranch: backupBranch.name, backupDeleteError: formatCommandDetails(deleted) };
	}
	return { ok: true, commitSummary: input.plan.commitSummary, backupDeleted: true };
}

async function loadLatestCommitFacts(
	input: Pick<LatestCommitAutobranchInput, "cwd" | "exec" | "snapshot">,
): Promise<
	| { ok: true; facts: LatestCommitFacts }
	| Extract<
			LatestCommitPreparationResult,
			{
				kind:
					| "trunk_lookup_failed"
					| "trunk_refusal"
					| "upstream_check_failed"
					| "pushed_head_refusal"
					| "commit_parent_lookup_failed"
					| "root_commit_refusal"
					| "merge_commit_refusal"
					| "commit_evidence_failed";
			}
		>
> {
	const trunk = await input.exec("gt", ["trunk", "--no-interactive"], input.cwd, GT_TIMEOUT_MS);
	if (trunk.code !== 0) {
		return { ok: false, kind: "trunk_lookup_failed", error: formatCommandDetails(trunk) };
	}
	const trunkBranch = trunk.stdout.trim().split("\n").find((line) => line.trim().length > 0)?.trim();
	if (!trunkBranch) {
		return { ok: false, kind: "trunk_lookup_failed", error: "gt trunk returned no branch name." };
	}
	if (input.snapshot.branch === trunkBranch) {
		return { ok: false, kind: "trunk_refusal", branch: input.snapshot.branch };
	}

	const upstream = await inspectUpstreamHeadState(input);
	if (upstream.type === "failed") {
		return { ok: false, kind: "upstream_check_failed", error: upstream.error };
	}
	if (upstream.type === "upstream_contains_head") {
		return { ok: false, kind: "pushed_head_refusal", upstream: upstream.upstream };
	}

	const parents = await input.exec("git", ["rev-list", "--parents", "-n", "1", "HEAD"], input.cwd, GIT_TIMEOUT_MS);
	if (parents.code !== 0) {
		return { ok: false, kind: "commit_parent_lookup_failed", error: formatCommandDetails(parents) };
	}
	const [headSha, ...parentShas] = parents.stdout.trim().split(/\s+/).filter(Boolean);
	if (!headSha) {
		return { ok: false, kind: "commit_parent_lookup_failed", error: "git rev-list returned no HEAD commit." };
	}
	if (parentShas.length === 0) {
		return { ok: false, kind: "root_commit_refusal", headSha };
	}
	if (parentShas.length > 1) {
		return { ok: false, kind: "merge_commit_refusal", headSha, parentCount: parentShas.length };
	}

	const message = await input.exec("git", ["log", "-1", "--format=%B"], input.cwd, GIT_TIMEOUT_MS);
	if (message.code !== 0) {
		return { ok: false, kind: "commit_evidence_failed", error: formatCommandDetails(message) };
	}
	const diff = await input.exec("git", ["diff", "HEAD^", "HEAD", "--no-ext-diff"], input.cwd, GIT_TIMEOUT_MS);
	if (diff.code !== 0) {
		return { ok: false, kind: "commit_evidence_failed", error: formatCommandDetails(diff) };
	}
	const commitSubject = message.stdout.split("\n")[0]?.trim();
	const commitSummary = commitSubject ? `${shortSha(headSha)} ${commitSubject}` : shortSha(headSha);

	return {
		ok: true,
		facts: {
			sourceBranch: input.snapshot.branch,
			trunkBranch,
			originalHeadSha: headSha,
			parentSha: parentShas[0] as string,
			commitMessage: message.stdout,
			commitDiff: diff.stdout,
			commitSummary,
			...(upstream.type === "head_not_in_upstream" ? { upstream: upstream.upstream } : {}),
		},
	};
}

type PreparedLatestCommitSlugResult =
	| { ok: true; baseSlug: string; source: LatestCommitAutobranchPlan["slugSource"] }
	| Extract<LatestCommitPreparationResult, { kind: "invalid_requested_slug" | "slug_generation_failed" }>;

function prepareRequestedLatestCommitSlug(args: ParsedAutobranchArgs):
	| { ok: true; slug?: Extract<PreparedLatestCommitSlugResult, { ok: true }> }
	| Extract<LatestCommitPreparationResult, { kind: "invalid_requested_slug" }> {
	if (!args.slug) {
		return { ok: true };
	}
	const requestedSlug = sanitizeBranchName(args.slug);
	if (!requestedSlug) {
		return { ok: false, kind: "invalid_requested_slug", requestedSlug: args.slug };
	}
	return { ok: true, slug: { ok: true, baseSlug: requestedSlug, source: "requested" } };
}

async function prepareLatestCommitSlug(
	input: Pick<LatestCommitAutobranchInput, "cwd" | "exec" | "setStatus">,
	facts: LatestCommitFacts,
): Promise<PreparedLatestCommitSlugResult> {
	input.setStatus("generating branch slug…");
	try {
		const result = await deriveSlugWithModel({
			cwd: input.cwd,
			prompt: buildLatestCommitSlugPrompt(facts),
			slugKind: "branch slug",
			normalizeOutput: sanitizeBranchName,
			exec: (command, args, options) => input.exec(command, args, options.cwd ?? input.cwd, options.timeout ?? SLUG_MODEL_TIMEOUT_MS),
		});
		if (result.ok) {
			return { ok: true, baseSlug: result.evidence.slug, source: "model" };
		}
		return {
			ok: false,
			kind: "slug_generation_failed",
			error: `Could not derive a branch slug for the latest commit. Rerun with --slug <name>.\n${formatSlugModelFailure(result.failure)}`,
		};
	} finally {
		input.setStatus(undefined);
	}
}

function buildLatestCommitSlugPrompt(facts: LatestCommitFacts): string {
	return [
		"Generate a concise git branch slug for the latest commit below.",
		"Rules:",
		"- Return only the slug, with no quotes, markdown, or explanation.",
		"- Use kebab-case lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural, such as add, fix, refactor, migrate, rename, remove, or update.",
		"- Do not use slashes, spaces, underscores, punctuation, or special characters.",
		"- Prefer concrete deliverables and specific nouns from the commit or diff over broad words like changes or cleanup.",
		"",
		"## commit message",
		facts.commitMessage.trim() || "(empty commit message)",
		"",
		"## git diff HEAD^ HEAD",
		truncateText(facts.commitDiff.trim() || "(no diff)", MAX_DIFF_CHARS),
	].join("\n");
}

async function resetSourceBranchToParent(input: LatestCommitTransactionInput): Promise<{ ok: true } | { ok: false; error: string }> {
	const currentBranch = await input.exec("git", ["branch", "--show-current"], input.cwd, GIT_TIMEOUT_MS);
	if (currentBranch.code !== 0) {
		return { ok: false, error: formatCommandDetails(currentBranch) };
	}
	if (currentBranch.stdout.trim() !== input.plan.sourceBranch) {
		return { ok: false, error: `Expected to be on ${input.plan.sourceBranch}, but current branch is ${currentBranch.stdout.trim() || "(detached)"}.` };
	}

	const currentHead = await input.exec("git", ["rev-parse", "HEAD"], input.cwd, GIT_TIMEOUT_MS);
	if (currentHead.code !== 0) {
		return { ok: false, error: formatCommandDetails(currentHead) };
	}
	if (currentHead.stdout.trim() !== input.plan.originalHeadSha) {
		return { ok: false, error: `Expected HEAD ${input.plan.originalHeadSha}, but found ${currentHead.stdout.trim()}.` };
	}

	const reset = await withStatus(input, "resetting source branch…", () => input.exec("git", ["reset", "--hard", input.plan.parentSha], input.cwd, GIT_TIMEOUT_MS));
	if (reset.code !== 0) {
		return { ok: false, error: formatCommandDetails(reset) };
	}
	return { ok: true };
}

async function restoreSourceBranch(input: LatestCommitTransactionInput): Promise<{ ok: true } | { ok: false; error: string }> {
	const checkedOut = await input.exec("git", ["checkout", input.plan.sourceBranch], input.cwd, GIT_TIMEOUT_MS);
	if (checkedOut.code !== 0) {
		return { ok: false, error: formatCommandDetails(checkedOut) };
	}
	const restored = await input.exec("git", ["reset", "--hard", input.plan.originalHeadSha], input.cwd, GIT_TIMEOUT_MS);
	if (restored.code !== 0) {
		return { ok: false, error: formatCommandDetails(restored) };
	}
	return { ok: true };
}

async function restoreSourceAndDeleteCreatedBranch(input: LatestCommitTransactionInput): Promise<CreatedBranchRecovery> {
	const restored = await restoreSourceBranch(input);
	if (!restored.ok) {
		return {
			restored: false,
			restoreError: restored.error,
			createdBranchDeleted: false,
			createdBranchDeleteError: `Skipped deleting incomplete branch ${input.plan.branchName} because source branch restoration failed.`,
		};
	}

	const deleted = await input.exec("git", ["branch", "-D", input.plan.branchName], input.cwd, GIT_TIMEOUT_MS);
	if (deleted.code !== 0) {
		return {
			restored: true,
			createdBranchDeleted: false,
			createdBranchDeleteError: formatCommandDetails(deleted),
		};
	}
	return { restored: true, createdBranchDeleted: true };
}

async function chooseAvailableBackupBranchName(input: LatestCommitTransactionInput, sourceBranch: string, timestamp: number): Promise<{ ok: true; name: string } | { ok: false }> {
	const sanitizedSource = sourceBranch
		.split("/")
		.map((segment) => sanitizeBackupBranchSegment(segment))
		.filter((segment) => segment.length > 0)
		.join("/") || "branch";
	const base = `autobranch-backup/${sanitizedSource}/${timestamp}`;
	const available = await findAvailableBranchName(input, backupBranchNameCandidates(base));
	if (!available) {
		return { ok: false };
	}
	return { ok: true, name: available.name };
}

function* backupBranchNameCandidates(base: string): Iterable<{ name: string; hasSuffix: boolean }> {
	for (let index = 0; index < 50; index += 1) {
		const suffix = index === 0 ? "" : `-${index + 1}`;
		yield { name: `${base}${suffix}`, hasSuffix: index > 0 };
	}
}

function sanitizeBackupBranchSegment(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_BACKUP_SEGMENT_CHARS)
		.replace(/-+$/g, "");
}

function formatLatestCommitPreparationFailure(result: Extract<LatestCommitPreparationResult, { ok: false }>): string {
	switch (result.kind) {
		case "trunk_lookup_failed":
			return `Could not resolve Graphite trunk; refusing to move latest commit.\n${result.error}`;
		case "trunk_refusal":
			return `Refusing to move latest commit from Graphite trunk branch ${result.branch}.`;
		case "upstream_check_failed":
			return `Could not determine whether HEAD is already in the current branch upstream.\n${result.error}`;
		case "pushed_head_refusal":
			return `Refusing to move latest commit because upstream ${result.upstream} already contains HEAD.`;
		case "commit_parent_lookup_failed":
			return `Could not inspect latest commit parents.\n${result.error}`;
		case "root_commit_refusal":
			return `Refusing to move root commit ${shortSha(result.headSha)}; latest-commit autobranch requires a single-parent commit.`;
		case "merge_commit_refusal":
			return `Refusing to move merge commit ${shortSha(result.headSha)} with ${result.parentCount} parents; latest-commit autobranch supports only single-parent commits.`;
		case "commit_evidence_failed":
			return `Could not read latest commit evidence for branch slug generation.\n${result.error}`;
		case "invalid_requested_slug":
			return `Invalid branch slug: ${result.requestedSlug}`;
		case "slug_generation_failed":
			return result.error;
		case "branch_name_unavailable":
			return `Could not find an available branch name based on ${result.baseSlug}.`;
	}
}

function formatLatestCommitTransactionFailure(result: Extract<LatestCommitTransactionResult, { ok: false }>): string {
	switch (result.kind) {
		case "backup_branch_name_unavailable":
			return `Could not find an available recovery branch name for ${result.sourceBranch}; refusing to move latest commit.`;
		case "backup_create_failed":
			return [`Failed to create recovery branch before moving latest commit.`, result.error].join("\n");
		case "source_reset_failed":
			return [`Failed to reset source branch before Graphite branch creation.`, `Recovery branch: ${result.backupBranch}`, result.error].join("\n");
		case "graphite_create_failed":
			return [
				`Failed to create Graphite branch after resetting source branch.`,
				`Recovery branch: ${result.backupBranch}`,
				result.createError,
				result.restored ? "Restored source branch to the original HEAD." : `Could not restore source branch: ${result.restoreError}`,
			].join("\n");
		case "branch_reset_failed":
			return [
				`Created Graphite branch ${result.branchName}, but failed to move it to the original commit.`,
				`Recovery branch: ${result.backupBranch}`,
				result.resetError,
				result.restored ? "Restored source branch to the original HEAD." : `Could not restore source branch: ${result.restoreError}`,
				formatCreatedBranchCleanup(result),
			].join("\n");
		case "head_verify_failed":
			return [
				`Created Graphite branch ${result.branchName}, but HEAD verification failed after moving it.`,
				`Expected original commit, found: ${result.actualHead}`,
				`Recovery branch: ${result.backupBranch}`,
				result.restored ? "Restored source branch to the original HEAD." : `Could not restore source branch: ${result.restoreError}`,
				formatCreatedBranchCleanup(result),
			].join("\n");
	}
}

function formatCreatedBranchCleanup(result: CreatedBranchRecovery & { branchName: string }): string {
	if (result.createdBranchDeleted) {
		return `Deleted incomplete branch ${result.branchName}.`;
	}
	return `Could not delete incomplete branch ${result.branchName}: ${result.createdBranchDeleteError}`;
}
