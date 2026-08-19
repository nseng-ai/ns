import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type RenderCapabilities,
} from "@nseng-ai/clinkr/legacy";
import { cell, paint, renderTable } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../../core/context.ts";
import { buildSlotInventory } from "../../core/inventory.ts";
import type { GitCommandFailure } from "../../core/gateways/repository.ts";

const ffDetachedActionSchema = z.enum([
	"attached",
	"already-current",
	"advanced",
	"would-advance",
	"not-advanced",
]);

const ffDetachedReasonSchema = z.enum([
	"dirty",
	"non-fast-forward",
	"operation-in-progress",
	"state-changed",
	"git-failure",
]);

const ffDetachedSlotResultSchema = z.object({
	slotName: z.string(),
	worktreePath: z.string(),
	branch: z.string().nullable(),
	action: ffDetachedActionSchema,
	reason: ffDetachedReasonSchema.nullable(),
	message: z.string().nullable(),
});

export const ffDetachedRequestSchema = z.object({
	dryRun: z.boolean().default(false).describe("Inspect intended outcomes without modifying Slots."),
	force: z
		.boolean()
		.default(false)
		.describe("Skip Slots with Git operations in progress and process the remaining safe Slots."),
});

export const ffDetachedResultSchema = z.object({
	trunk: z.string(),
	dryRun: z.boolean(),
	force: z.boolean(),
	slots: z.array(ffDetachedSlotResultSchema),
	totalCount: z.number().int(),
	attachedCount: z.number().int(),
	alreadyCurrentCount: z.number().int(),
	advancedCount: z.number().int(),
	wouldAdvanceCount: z.number().int(),
	notAdvancedCount: z.number().int(),
});

export type FfDetachedRequest = z.infer<typeof ffDetachedRequestSchema>;
export type FfDetachedResult = z.infer<typeof ffDetachedResultSchema>;
type FfDetachedSlotResult = z.infer<typeof ffDetachedSlotResultSchema>;
type FfDetachedAction = FfDetachedSlotResult["action"];

export async function runFfDetached(ctx: SlotCliContext, request: FfDetachedRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	let trunk: string;
	let inventory: Awaited<ReturnType<typeof buildSlotInventory>>;
	try {
		[trunk, inventory] = await Promise.all([
			repoCtx.git.getTrunkBranch(),
			buildSlotInventory(repoCtx.git, { mainRepoRoot: repoCtx.repo.mainRepoRoot }),
		]);
	} catch (error) {
		return failure(
			"ff-detached-failed",
			`Cannot resolve Slot inventory and configured trunk: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const plannedSlots: FfDetachedSlotResult[] = [];
	for (const record of inventory.records) {
		plannedSlots.push(await planSlot(repoCtx, trunk, record));
	}
	const hasGitFailure = plannedSlots.some((slot) => slot.reason === "git-failure");
	if (hasGitFailure) {
		const result = buildResult(trunk, request, plannedSlots);
		return failure(
			"ff-detached-failed",
			"Detached Slot fast-forward planning failed; no Slots were modified.",
			result,
		);
	}
	const hasOperationInProgress = plannedSlots.some(
		(slot) => slot.reason === "operation-in-progress",
	);
	if (!request.dryRun && !request.force && hasOperationInProgress) {
		const result = buildResult(trunk, request, plannedSlots);
		return negative(
			"A Git operation is in progress. Resolve it or pass --force to skip that Slot.",
			{ data: result, human: renderFfDetached(result, ctx.renderCapabilities) },
		);
	}
	const slots = request.dryRun
		? plannedSlots
		: await executeFastForwards(repoCtx, trunk, plannedSlots);
	const result = buildResult(trunk, request, slots);
	if (slots.some((slot) => slot.reason === "git-failure" || slot.reason === "state-changed"))
		return failure(
			"ff-detached-failed",
			"Detached Slot fast-forward inspection or mutation failed; see Slot results.",
			result,
		);
	return ok(result);
}

export function renderFfDetached(
	result: FfDetachedResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const renderCaps = resolveRenderCapabilities(caps);
	const mode = result.dryRun ? "Dry run" : "Fast-forward";
	if (result.slots.length === 0)
		return `${mode}: no managed Slots configured. Trunk: ${result.trunk}.`;
	return [
		`${mode} detached Slots to ${result.trunk}`,
		`${result.advancedCount} advanced; ${result.wouldAdvanceCount} would advance; ${result.alreadyCurrentCount} current; ${result.attachedCount} attached; ${result.notAdvancedCount} not advanced`,
		"",
		...renderTable({
			caps: renderCaps,
			columns: [
				{ header: "SLOT", width: "auto" },
				{ header: "BRANCH", width: "auto" },
				{ header: "RESULT", width: "auto" },
				{ header: "DETAIL", width: "auto" },
			],
			rows: result.slots.map((slot) => [
				cell(paint(renderCaps, "accent", slot.slotName), slot.slotName),
				cell(slot.branch ?? "detached"),
				actionCell(renderCaps, slot.action),
				cell(slot.message ?? slot.reason ?? "—"),
			]),
		}),
	].join("\n");
}

async function planSlot(
	ctx: RepoSlotContext,
	trunk: string,
	record: { slotName: string; path: string; branch: string | null; operation: string | null },
): Promise<FfDetachedSlotResult> {
	if (record.operation !== null)
		return slotResult(record, "not-advanced", "operation-in-progress", record.operation);
	const currentBranch = await ctx.git.getCurrentBranch(record.path);
	if (currentBranch.type === "failure") return gitFailureResult(record, currentBranch.failure);
	if (currentBranch.type === "branch")
		return slotResult(
			{ ...record, branch: currentBranch.branch },
			"attached",
			null,
			`Attached to ${currentBranch.branch}`,
		);
	const changes = await ctx.git.hasUncommittedChanges(record.path);
	if (changes.type === "failure") return gitFailureResult(record, changes.failure);
	if (changes.hasUncommittedChanges)
		return slotResult(record, "not-advanced", "dirty", "Worktree has uncommitted changes");
	const inspection = await ctx.git.inspectDetachedHeadFastForward(record.path, trunk);
	switch (inspection.type) {
		case "already-current":
			return slotResult(record, "already-current", null, null);
		case "non-fast-forward":
			return slotResult(
				record,
				"not-advanced",
				"non-fast-forward",
				`HEAD cannot fast-forward to ${trunk}`,
			);
		case "failure":
			return gitFailureResult(record, inspection.failure);
		case "can-fast-forward":
			return slotResult(record, "would-advance", null, null);
	}
}

function slotResult(
	record: { slotName: string; path: string; branch: string | null },
	action: FfDetachedAction,
	reason: FfDetachedSlotResult["reason"],
	message: string | null,
): FfDetachedSlotResult {
	return {
		slotName: record.slotName,
		worktreePath: record.path,
		branch: record.branch,
		action,
		reason,
		message,
	};
}

function gitFailureResult(
	record: { slotName: string; path: string; branch: string | null },
	failureResult: GitCommandFailure,
): FfDetachedSlotResult {
	return slotResult(record, "not-advanced", "git-failure", failureResult.message);
}

async function executeFastForwards(
	ctx: RepoSlotContext,
	trunk: string,
	plannedSlots: readonly FfDetachedSlotResult[],
): Promise<readonly FfDetachedSlotResult[]> {
	const slots: FfDetachedSlotResult[] = [];
	for (const slot of plannedSlots) {
		if (slot.action !== "would-advance") {
			slots.push(slot);
			continue;
		}
		const mutation = await ctx.git.fastForwardDetachedHead(slot.worktreePath, trunk);
		if (mutation.type === "advanced") {
			slots.push({ ...slot, action: "advanced" });
			continue;
		}
		if (mutation.type === "attached") {
			slots.push({
				...slot,
				branch: mutation.branch,
				action: "not-advanced",
				reason: "state-changed",
				message: `Slot became attached to ${mutation.branch} after planning`,
			});
			continue;
		}
		slots.push({
			...slot,
			action: "not-advanced",
			reason: "git-failure",
			message: mutation.failure.message,
		});
	}
	return slots;
}

function buildResult(
	trunk: string,
	request: FfDetachedRequest,
	slots: readonly FfDetachedSlotResult[],
): FfDetachedResult {
	const count = (action: FfDetachedAction) => slots.filter((slot) => slot.action === action).length;
	return {
		trunk,
		dryRun: request.dryRun,
		force: request.force,
		slots: [...slots],
		totalCount: slots.length,
		attachedCount: count("attached"),
		alreadyCurrentCount: count("already-current"),
		advancedCount: count("advanced"),
		wouldAdvanceCount: count("would-advance"),
		notAdvancedCount: count("not-advanced"),
	};
}

function actionCell(caps: ReturnType<typeof resolveRenderCapabilities>, action: FfDetachedAction) {
	const intent =
		action === "advanced" || action === "already-current"
			? "success"
			: action === "not-advanced"
				? "warn"
				: "muted";
	return cell(paint(caps, intent, action), action);
}
