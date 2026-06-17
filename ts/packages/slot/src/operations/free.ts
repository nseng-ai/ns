import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import { buildSlotInventory, findByBranch, poolSize, type SlotInventory } from "../inventory.ts";
import { SLOT_RELEASE_ALL_CLEANUP_ACTIONS, type SlotFreeCleanupResult } from "../lifecycle/release-cleanup.ts";
import { executeFreeRelease, planFreeRelease } from "../lifecycle/release.ts";
import type { FreedSlot } from "../lifecycle/release-target.ts";
import { resolveCurrent, resolveNum, resolveWt } from "../selectors.ts";
import { cleanupErrorCount, renderCleanupLines } from "./cleanup-rendering.ts";
import { confirmFromStdin } from "./confirmation.ts";

const freedSlotSchema = z.object({ slot_name: z.string(), branch_name: z.string(), worktree_path: z.string() });
const cleanupSchema = z.object({ slot_name: z.string(), branch_name: z.string(), action: z.union([z.literal("pr"), z.literal("local_branch")]), status: z.union([z.literal("planned"), z.literal("success"), z.literal("skipped"), z.literal("error")]), pr_number: z.number().int().nullable(), message: z.string().nullable() });

export const freeRequestSchema = z.object({
	num: z.array(z.string()).default([]).describe("Slot number. May be repeated."),
	wt: z.array(z.string()).default([]).describe("Slot worktree name. May be repeated."),
	branch: z.array(z.string()).default([]).describe("Branch assigned to a slot. May be repeated."),
	current: z.boolean().default(false).describe("Free the current slot worktree."),
	all: z.boolean().default(false).describe("Also close matching PRs and delete local branches."),
	dry_run: z.boolean().default(false).describe("Preview without mutating."),
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

export async function runFree(ctx: SlotCliContext, request: FreeRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const inventory = await buildSlotInventory(repoCtx.git, { mainRepoRoot: repoCtx.repo.mainRepoRoot });
	if (poolSize(inventory) === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const resolved = resolveTargets(repoCtx, request, inventory);
	if (resolved.slotNames.length === 0 && resolved.errors.length === 0) return failure("missing_slot_arg", "Pass one of -n/--num, -w/--wt, -b/--branch, or -c/--current to identify the slot.");
	const cleanupActions = request.all ? SLOT_RELEASE_ALL_CLEANUP_ACTIONS : [];
	const preview = await planFreeRelease(repoCtx, resolved.slotNames, { preflightErrors: resolved.errors, cleanupActions });
	if (preview.type === "failure") return failure(preview.failure.error_type, preview.failure.message);
	if (request.dry_run) return ok(buildFreeResult({ wouldFree: preview.outcome.plan.targets, cleanup: preview.outcome.cleanup, skipped: resolved.skipped, dryRun: true, cancelled: false }));
	if (request.all && preview.outcome.plan.targets.length > 0 && !request.yes) {
		if (!ctx.shouldWriteCdDirective) return failure("confirmation_required", "Destructive free --all requires --yes in JSON mode (or use --dry-run first).");
		const confirmed = await confirmFromStdin({ stdin: repoCtx.stdin, stderr: repoCtx.stderr, prompt: `Free ${preview.outcome.plan.targets.length} slot(s), close matching PRs, and delete local branches? [y/N]: `, defaultAnswer: "no" });
		if (typeof confirmed !== "string") return confirmed;
		if (confirmed === "no") return ok(buildFreeResult({ wouldFree: preview.outcome.plan.targets, cleanup: preview.outcome.cleanup, skipped: resolved.skipped, dryRun: false, cancelled: true }));
	}
	const executed = await executeFreeRelease(repoCtx, preview.outcome.plan, cleanupActions);
	if (executed.type === "failure") return failure(executed.failure.error_type, executed.failure.message);
	const result = buildFreeResult({ freed: executed.outcome.outcome.freed, cleanup: executed.outcome.cleanup, skipped: resolved.skipped, dryRun: false, cancelled: false });
	if (cleanupErrorCount(result.cleanup) > 0) return negative("Slot free completed with cleanup errors.", result);
	return ok(result);
}

export function renderFree(result: FreeResult): string {
	if (result.cancelled) return "Cancelled slot free.";
	const lines: string[] = [];
	for (const slot of result.dry_run ? result.would_free : result.freed) lines.push(`${result.dry_run ? "Would free" : "Freed"} ${slot.slot_name} -> ${slot.branch_name}`);
	lines.push(...result.skipped);
	lines.push(...renderCleanupLines(result.cleanup));
	if (lines.length === 0) return result.dry_run ? "No slots would be freed." : "No slots freed.";
	return lines.join("\n");
}

function resolveTargets(ctx: RepoSlotContext, request: FreeRequest, inventory: SlotInventory): { slotNames: readonly string[]; errors: readonly string[]; skipped: readonly string[] } {
	const slotNames: string[] = [];
	const errors: string[] = [];
	const skipped: string[] = [];
	for (const raw of request.num) {
		const parsed = /^\d+$/.test(raw) ? Number(raw) : null;
		const result = parsed === null ? { type: "error" as const, message: `--num must be an integer (got ${raw}).` } : resolveNum(parsed, poolSize(inventory));
		if (result.type === "ok") slotNames.push(result.slotName); else errors.push(result.message);
	}
	for (const wt of request.wt) {
		const result = resolveWt(wt);
		if (result.type === "ok") slotNames.push(result.slotName); else errors.push(result.message);
	}
	for (const branch of request.branch) {
		const match = findByBranch(inventory, branch);
		if (match?.kind === "slot") slotNames.push(match.record.slotName);
		else if (match?.kind === "main") skipped.push(`Branch '${branch}' is checked out in the main worktree at ${match.worktree.path}; nothing to free.`);
		else skipped.push(`Branch '${branch}' is not assigned to a managed slot; nothing to free.`);
	}
	if (request.current) {
		const result = resolveCurrent(ctx.cwd);
		if (result.type === "ok") slotNames.push(result.slotName); else errors.push(result.message);
	}
	return { slotNames: dedupe(slotNames), errors, skipped };
}

function dedupe(values: readonly string[]): readonly string[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		if (seen.has(value)) return false;
		seen.add(value);
		return true;
	});
}

function buildFreeResult(options: { freed?: readonly FreedSlot[] | undefined; wouldFree?: readonly FreedSlot[] | undefined; cleanup: readonly SlotFreeCleanupResult[]; skipped: readonly string[]; dryRun: boolean; cancelled: boolean }): FreeResult {
	return { freed: [...(options.freed ?? [])], would_free: [...(options.wouldFree ?? [])], cleanup: [...options.cleanup], skipped: [...options.skipped], dry_run: options.dryRun, cancelled: options.cancelled };
}

