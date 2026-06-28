import { failure, negative, ok, type RenderCapabilities } from "@sdl/clinkr";
import { z } from "zod";

import { deduplicateOrderedStrings } from "../collections.ts";
import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import { buildSlotInventory, findByBranch, poolSize, type SlotInventory } from "../inventory.ts";
import {
	executeFreePlan,
	planFreeSlots,
	type SlotFreeProgressReporter,
} from "../lifecycle/free.ts";
import {
	executeReleaseCleanup,
	planReleaseCleanup,
	SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
	type SlotFreeCleanupResult,
	type SlotReleaseCleanupProgressReporter,
} from "../lifecycle/release-cleanup.ts";
import type { FreedSlot } from "../lifecycle/release-target.ts";
import { resolveCurrent, resolveNum, resolveWt } from "../selectors.ts";
import { cleanupErrorCount, renderCleanupLines } from "./cleanup-rendering.ts";
import { renderSlotDestructiveResultBlock } from "./destructive-presentation.ts";
import { cleanupSchema, freedSlotSchema } from "./result-schemas.ts";

export const freeRequestSchema = z.object({
	num: z.array(z.string()).default([]).describe("Slot number. May be repeated."),
	wt: z.array(z.string()).default([]).describe("Slot worktree name. May be repeated."),
	branch: z.array(z.string()).default([]).describe("Branch assigned to a slot. May be repeated."),
	current: z.boolean().default(false).describe("Free the current slot worktree."),
	all: z.boolean().default(false).describe("Also close matching PRs and delete local branches."),
	dryRun: z.boolean().default(false).describe("Preview without mutating."),
	yes: z.boolean().default(false).describe("Skip destructive cleanup confirmation."),
});

export const freeResultSchema = z.object({
	freed: z.array(freedSlotSchema),
	would_free: z.array(freedSlotSchema),
	cleanup: z.array(cleanupSchema),
	skipped: z.array(z.string()),
	dry_run: z.boolean(),
	cancelled: z.boolean(),
});

export type FreeRequest = z.infer<typeof freeRequestSchema>;
export type FreeResult = z.infer<typeof freeResultSchema>;

interface FreeAllProgressReporter {
	checkingCleanup: (slotCount: number) => void;
	writePromptBreak: () => void;
	freeProgress: SlotFreeProgressReporter;
	cleanupProgress: SlotReleaseCleanupProgressReporter;
}

export async function runFree(ctx: SlotCliContext, request: FreeRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	if (poolSize(inventory) === 0)
		return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const resolved = resolveTargets(repoCtx, request, inventory);
	if (resolved.slotNames.length === 0 && resolved.errors.length === 0)
		return failure(
			"missing_slot_arg",
			"Pass one of -n/--num, -w/--wt, -b/--branch, or -c/--current to identify the slot.",
		);
	const cleanupActions = request.all ? SLOT_RELEASE_ALL_CLEANUP_ACTIONS : [];
	const plan = await planFreeSlots(repoCtx, resolved.slotNames, {
		preflightErrors: resolved.errors,
	});
	if (plan.type === "failure") return failure(plan.failure.error_type, plan.failure.message);
	const progress = createFreeAllProgressReporter(repoCtx, request, plan.outcome.targets.length);
	progress?.checkingCleanup(plan.outcome.targets.length);
	const previewCleanup = await planReleaseCleanup({
		ctx: repoCtx,
		targets: plan.outcome.targets,
		cleanupActions,
		trunkBranch: plan.outcome.trunk_branch,
	});
	if (request.dryRun)
		return ok(
			buildFreeResult({
				wouldFree: plan.outcome.targets,
				cleanup: previewCleanup,
				skipped: resolved.skipped,
				isDryRun: true,
				isCancelled: false,
			}),
		);
	if (request.all && plan.outcome.targets.length > 0 && !request.yes) {
		if (!ctx.shouldWriteCdDirective)
			return failure(
				"confirmation_required",
				"Destructive free --all requires --yes in JSON mode (or use --dry-run first).",
			);
		const confirmed = await repoCtx.interaction.confirm({
			message: `Free ${plan.outcome.targets.length} slot(s), close matching PRs, and delete local branches?`,
			defaultAnswer: "no",
		});
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
		if (confirmed.type === "declined")
			return ok(
				buildFreeResult({
					wouldFree: plan.outcome.targets,
					cleanup: previewCleanup,
					skipped: resolved.skipped,
					isDryRun: false,
					isCancelled: true,
				}),
			);
		progress?.writePromptBreak();
	}
	const executed = await executeFreePlan(repoCtx, plan.outcome, progress?.freeProgress);
	if (executed.type === "failure")
		return failure(executed.failure.error_type, executed.failure.message);
	const cleanup = await executeReleaseCleanup({
		ctx: repoCtx,
		targets: executed.outcome.freed,
		cleanupActions,
		trunkBranch: plan.outcome.trunk_branch,
		...(progress === null ? {} : { progress: progress.cleanupProgress }),
	});
	const result = buildFreeResult({
		freed: executed.outcome.freed,
		cleanup,
		skipped: resolved.skipped,
		isDryRun: false,
		isCancelled: false,
	});
	if (cleanupErrorCount(result.cleanup) > 0)
		return negative("Slot free completed with cleanup errors.", result, {
			human: renderFree(result),
		});
	return ok(result);
}

export function renderFree(
	result: FreeResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const targets = result.dry_run ? result.would_free : result.freed;
	if (result.cancelled) {
		return renderSlotDestructiveResultBlock(caps, {
			kind: "refusal",
			headline: "Cancelled slot free.",
			body: renderFreeDetails(result, targets),
		});
	}
	const cleanupErrors = cleanupErrorCount(result.cleanup);
	if (cleanupErrors > 0) {
		return renderSlotDestructiveResultBlock(caps, {
			kind: "failure",
			headline: "Slot free completed with cleanup errors.",
			body: renderFreeDetails(result, targets),
		});
	}
	const headline = result.dry_run
		? dryRunHeadline(targets.length)
		: freeSuccessHeadline(targets.length);
	return renderSlotDestructiveResultBlock(caps, {
		kind: "success",
		headline,
		body: renderFreeDetails(result, targets),
	});
}

function renderFreeDetails(result: FreeResult, targets: readonly FreedSlot[]): string | undefined {
	const lines: string[] = [];
	for (const slot of targets)
		lines.push(
			`${result.dry_run ? "Would free" : "Freed"} ${slot.slot_name} -> ${slot.branch_name}`,
		);
	lines.push(...result.skipped);
	lines.push(...renderCleanupLines(result.cleanup, { isDryRun: result.dry_run }));
	return lines.length === 0 ? undefined : lines.join("\n");
}

function dryRunHeadline(targetCount: number): string {
	return targetCount === 0 ? "No slots would be freed." : `Would free ${targetCount} slot(s).`;
}

function freeSuccessHeadline(targetCount: number): string {
	return targetCount === 0 ? "No slots freed." : `Freed ${targetCount} slot(s).`;
}

function resolveTargets(
	ctx: RepoSlotContext,
	request: FreeRequest,
	inventory: SlotInventory,
): { slotNames: readonly string[]; errors: readonly string[]; skipped: readonly string[] } {
	const slotNames: string[] = [];
	const errors: string[] = [];
	const skipped: string[] = [];
	for (const raw of request.num) {
		const parsed = /^\d+$/.test(raw) ? Number(raw) : null;
		const result =
			parsed === null
				? { type: "error" as const, message: `--num must be an integer (got ${raw}).` }
				: resolveNum(parsed, poolSize(inventory));
		if (result.type === "ok") slotNames.push(result.slotName);
		else errors.push(result.message);
	}
	for (const wt of request.wt) {
		const result = resolveWt(wt);
		if (result.type === "ok") slotNames.push(result.slotName);
		else errors.push(result.message);
	}
	for (const branch of request.branch) {
		const match = findByBranch(inventory, branch);
		if (match?.kind === "slot") slotNames.push(match.record.slotName);
		else if (match?.kind === "main")
			skipped.push(
				`Branch '${branch}' is checked out in the main worktree at ${match.worktree.path}; nothing to free.`,
			);
		else skipped.push(`Branch '${branch}' is not assigned to a managed slot; nothing to free.`);
	}
	if (request.current) {
		const result = resolveCurrent(ctx.cwd);
		if (result.type === "ok") slotNames.push(result.slotName);
		else errors.push(result.message);
	}
	return { slotNames: deduplicateOrderedStrings(slotNames), errors, skipped };
}

function createFreeAllProgressReporter(
	ctx: RepoSlotContext,
	request: FreeRequest,
	targetCount: number,
): FreeAllProgressReporter | null {
	if (!request.all || !ctx.shouldWriteCdDirective || targetCount === 0) return null;
	return {
		checkingCleanup: (slotCount) => {
			ctx.stderr(`Checking cleanup actions for ${slotCount} slot(s)…\n`);
		},
		writePromptBreak: () => {
			ctx.stderr("\n");
		},
		freeProgress: (event) => {
			ctx.stderr(`Freeing ${event.target.slot_name} (${event.target.branch_name})…\n`);
		},
		cleanupProgress: (event) => {
			switch (event.type) {
				case "pr_lookup_started":
					ctx.stderr(`Checking PR for ${event.target.branch_name}…\n`);
					return;
				case "pr_close_started":
					ctx.stderr(`Closing PR #${event.prNumber}…\n`);
					return;
				case "local_branch_lookup_started":
					ctx.stderr(`Checking local branch ${event.target.branch_name}…\n`);
					return;
				case "local_branch_delete_started":
					ctx.stderr(`Deleting local branch ${event.target.branch_name}…\n`);
					return;
				case "cleanup_finished":
					return;
			}
		},
	};
}

function buildFreeResult(options: {
	freed?: readonly FreedSlot[] | undefined;
	wouldFree?: readonly FreedSlot[] | undefined;
	cleanup: readonly SlotFreeCleanupResult[];
	skipped: readonly string[];
	isDryRun: boolean;
	isCancelled: boolean;
}): FreeResult {
	return {
		freed: [...(options.freed ?? [])],
		would_free: [...(options.wouldFree ?? [])],
		cleanup: [...options.cleanup],
		skipped: [...options.skipped],
		dry_run: options.isDryRun,
		cancelled: options.isCancelled,
	};
}
