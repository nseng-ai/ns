import type { RepoSlotContext } from "../context.ts";
import { buildSlotInventory, findBySlot, type SlotInventory } from "../inventory.ts";
import { slotOperationMessage, type LifecycleResult } from "./common.ts";
import {
	freedSlotFromRecord,
	releaseAssignedSlotTarget,
	type FreedSlot,
	type ReleaseTargetFailure,
} from "./release-target.ts";

export interface SlotFreePlan {
	targets: readonly FreedSlot[];
	trunkBranch: string;
}

export interface SlotFreeOutcome {
	freed: readonly FreedSlot[];
}

export interface SlotFreeProgressEvent {
	type: "release_started";
	target: FreedSlot;
}

export type SlotFreeProgressReporter = (event: SlotFreeProgressEvent) => void;

export async function planFreeSlots(
	ctx: RepoSlotContext,
	slotNames: readonly string[],
	options: {
		preflightErrors?: readonly string[] | undefined;
		trunkBranch?: string | undefined;
	} = {},
): Promise<LifecycleResult<SlotFreePlan>> {
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const validation = await validatedFreeTargets(ctx, inventory, slotNames);
	const errors = [...(options.preflightErrors ?? []), ...validation.errors];
	if (errors.length > 0)
		return {
			type: "failure",
			failure: { errorType: "invalid-slot-args", message: errors.join("\n") },
		};
	return {
		type: "ok",
		outcome: {
			targets: validation.targets,
			trunkBranch: options.trunkBranch ?? (await ctx.git.getTrunkBranch()),
		},
	};
}

export async function executeFreePlan(
	ctx: RepoSlotContext,
	plan: SlotFreePlan,
	progress?: SlotFreeProgressReporter | undefined,
): Promise<LifecycleResult<SlotFreeOutcome>> {
	if (plan.targets.length === 0) return { type: "ok", outcome: { freed: [] } };
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const freed: FreedSlot[] = [];
	for (const target of plan.targets) {
		progress?.({ type: "release_started", target });
		const result = await releaseAssignedSlotTarget({
			git: ctx.git,
			inventory,
			target,
			trunkBranch: plan.trunkBranch,
		});
		if ("reason" in result)
			return {
				type: "failure",
				failure: {
					errorType: result.errorType,
					message: partialFailureMessage(freeExecutionFailureMessage(result), freed),
				},
			};
		freed.push(result);
	}
	return { type: "ok", outcome: { freed } };
}

async function validatedFreeTargets(
	ctx: RepoSlotContext,
	inventory: SlotInventory,
	slotNames: readonly string[],
): Promise<{ targets: readonly FreedSlot[]; errors: readonly string[] }> {
	const errors: string[] = [];
	const targets: FreedSlot[] = [];
	for (const slotName of slotNames) {
		const record = findBySlot(inventory, slotName);
		if (record === null) {
			errors.push(`${slotName} is not currently assigned. Run \`slot list\` to see the pool.`);
			continue;
		}
		if (record.operation !== null) {
			errors.push(slotOperationMessage(record, { action: "freeing" }));
			continue;
		}
		if (record.branch === null) {
			errors.push(`${slotName} is not currently assigned. Run \`slot list\` to see the pool.`);
			continue;
		}
		if (await ctx.git.hasUncommittedChanges(record.path)) {
			errors.push(
				`${slotName} has uncommitted changes at ${record.path}. Commit or stash before freeing.`,
			);
			continue;
		}
		targets.push(freedSlotFromRecord(record));
	}
	return { targets, errors };
}

function freeExecutionFailureMessage(failure: ReleaseTargetFailure): string {
	switch (failure.reason) {
		case "slot-not-assigned":
			return `${failure.slotName} is not currently assigned (state changed during free).`;
		case "operation-in-progress":
			return `${failure.slotName} holds '${failure.branchName}' with a ${failure.operation ?? "operation"} in progress at ${failure.worktreePath}; cannot continue freeing.`;
		case "dirty-worktree":
			return `${failure.slotName} has uncommitted changes at ${failure.worktreePath} (state changed during free).`;
		case "detach-failed":
			return detachFailureMessage(failure);
	}
}

export function detachFailureMessage(failure: ReleaseTargetFailure): string {
	const detachRef = failure.detachRef ?? "target ref";
	const detail = failure.detachError === null ? "" : `: ${failure.detachError}`;
	return `Failed to detach ${failure.slotName} at ${failure.worktreePath} to ${detachRef}${detail}`;
}

function partialFailureMessage(base: string, freed: readonly FreedSlot[]): string {
	if (freed.length === 0) return base;
	return `${base} Already freed: ${freed.map((slot) => slot.slotName).join(", ")}.`;
}
