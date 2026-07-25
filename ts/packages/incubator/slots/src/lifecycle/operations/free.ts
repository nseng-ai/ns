import {
	confirmInteractiveOrUsageError,
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { deduplicateOrderedStrings } from "../../core/collections.ts";
import type { RepoSlotContext, SlotCliContext } from "../../core/context.ts";
import {
	buildSlotInventory,
	findByBranch,
	poolSize,
	type SlotInventory,
} from "../../core/inventory.ts";
import { executeFreePlan, planFreeSlots, type SlotFreeProgressReporter } from "../free.ts";
import {
	executeReleaseCleanup,
	planReleaseCleanup,
	SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
	type SlotFreeCleanupResult,
	type SlotReleaseCleanupProgressReporter,
} from "../release-cleanup.ts";
import type { FreedSlot } from "../release-target.ts";
import { resolveCurrent, resolveNum, resolveWt } from "../../core/selectors.ts";
import { cleanupErrorCount, renderCleanupLines } from "./cleanup-rendering.ts";
import {
	buildSlotDestructiveResultBlock,
	renderSlotDestructiveResultBlock,
} from "./destructive-presentation.ts";
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
	wouldFree: z.array(freedSlotSchema),
	cleanup: z.array(cleanupSchema),
	skipped: z.array(z.string()),
	dryRun: z.boolean(),
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
		return failure("pool-empty", "No managed slots configured. Run `slot init --size N` first.");
	const resolved = resolveTargets(repoCtx, request, inventory);
	if (!resolved.hasSelector)
		return failure(
			"missing-slot-arg",
			"Pass one of -n/--num, -w/--wt, -b/--branch, or -c/--current to identify the slot.",
		);
	const cleanupActions = request.all ? SLOT_RELEASE_ALL_CLEANUP_ACTIONS : [];
	const plan = await planFreeSlots(repoCtx, resolved.slotNames, {
		preflightErrors: resolved.errors,
	});
	if (plan.type === "failure") return failure(plan.failure.errorType, plan.failure.message);
	const progress = createFreeAllProgressReporter(repoCtx, request, plan.outcome.targets.length);
	progress?.checkingCleanup(plan.outcome.targets.length);
	const previewCleanup = await planReleaseCleanup({
		ctx: repoCtx,
		targets: plan.outcome.targets,
		cleanupActions,
		trunkBranch: plan.outcome.trunkBranch,
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
		const confirmed = await confirmInteractiveOrUsageError(repoCtx.interaction, {
			nonInteractive: {
				message:
					"Destructive free --all requires --yes when non-interactive (or use --dry-run first).",
				missingFlag: "--yes",
				howToSupply: "Pass --yes (or -y) to free slots without prompting, or run --dry-run first.",
			},
			confirmation: {
				message: `Free ${plan.outcome.targets.length} slot(s), close matching PRs, and delete local branches?`,
				defaultAnswer: "no",
			},
		});
		if (confirmed.type === "usageError") return confirmed;
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
		return failure(executed.failure.errorType, executed.failure.message);
	const cleanup = await executeReleaseCleanup({
		ctx: repoCtx,
		targets: executed.outcome.freed,
		cleanupActions,
		trunkBranch: plan.outcome.trunkBranch,
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
		return negative("Slot free completed with cleanup errors.", {
			data: result,
			human: renderFree(result),
		});
	return ok(result);
}

export function renderFree(
	result: FreeResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const targets = result.dryRun ? result.wouldFree : result.freed;
	const body = renderFreeDetails(result, targets, resolveRenderCapabilities(caps));
	if (result.cancelled) {
		return renderSlotDestructiveResultBlock(
			caps,
			buildSlotDestructiveResultBlock({
				kind: "refusal",
				headline: "Cancelled slot free.",
				...optionalEntry("body", body),
			}),
		);
	}
	const cleanupErrors = cleanupErrorCount(result.cleanup);
	if (cleanupErrors > 0) {
		return renderSlotDestructiveResultBlock(
			caps,
			buildSlotDestructiveResultBlock({
				kind: "failure",
				headline: "Slot free completed with cleanup errors.",
				...optionalEntry("body", body),
			}),
		);
	}
	const headline = result.dryRun
		? dryRunHeadline(targets.length)
		: freeSuccessHeadline(targets.length);
	return renderSlotDestructiveResultBlock(
		caps,
		buildSlotDestructiveResultBlock({
			kind: "success",
			headline,
			...optionalEntry("body", body),
		}),
	);
}

function renderFreeDetails(
	result: FreeResult,
	targets: readonly FreedSlot[],
	caps: ReturnType<typeof resolveRenderCapabilities>,
): string | undefined {
	const lines: string[] = [];
	for (const slot of targets)
		lines.push(`${result.dryRun ? "Would free" : "Freed"} ${slot.slotName} -> ${slot.branchName}`);
	lines.push(...result.skipped);
	lines.push(...renderCleanupLines(result.cleanup, { isDryRun: result.dryRun, caps }));
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
): {
	slotNames: readonly string[];
	errors: readonly string[];
	skipped: readonly string[];
	hasSelector: boolean;
} {
	const slotNames: string[] = [];
	const errors: string[] = [];
	const skipped: string[] = [];
	const hasSelector =
		request.num.length > 0 || request.wt.length > 0 || request.branch.length > 0 || request.current;
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
	return { slotNames: deduplicateOrderedStrings(slotNames), errors, skipped, hasSelector };
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
			ctx.stderr(`Freeing ${event.target.slotName} (${event.target.branchName})…\n`);
		},
		cleanupProgress: (event) => {
			switch (event.type) {
				case "pr_lookup_started":
					ctx.stderr(`Checking PR for ${event.target.branchName}…\n`);
					return;
				case "pr_close_started":
					ctx.stderr(`Closing PR #${event.prNumber}…\n`);
					return;
				case "local_branch_lookup_started":
					ctx.stderr(`Checking local branch ${event.target.branchName}…\n`);
					return;
				case "local_branch_delete_started":
					ctx.stderr(`Deleting local branch ${event.target.branchName}…\n`);
					return;
				case "cleanup_finished":
					return;
			}
		},
	};
}

function buildFreeResult(options: {
	freed?: readonly FreedSlot[];
	wouldFree?: readonly FreedSlot[];
	cleanup: readonly SlotFreeCleanupResult[];
	skipped: readonly string[];
	isDryRun: boolean;
	isCancelled: boolean;
}): FreeResult {
	return {
		freed: [...(options.freed ?? [])],
		wouldFree: [...(options.wouldFree ?? [])],
		cleanup: [...options.cleanup],
		skipped: [...options.skipped],
		dryRun: options.isDryRun,
		cancelled: options.isCancelled,
	};
}
