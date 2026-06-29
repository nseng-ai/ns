import type { RepoSlotContext } from "../context.ts";
import { prFailureMessage } from "../gateways/pr.ts";
import type { FreedSlot } from "./release-target.ts";

export type SlotFreeCleanupAction = "pr" | "local-branch";
export type SlotFreeCleanupStatus = "planned" | "success" | "skipped" | "error";

export interface SlotFreeCleanupResult {
	slotName: string;
	branchName: string;
	action: SlotFreeCleanupAction;
	status: SlotFreeCleanupStatus;
	prNumber: number | null;
	message: string | null;
}

export const SLOT_RELEASE_ALL_CLEANUP_ACTIONS = [
	"pr",
	"local-branch",
] as const satisfies readonly SlotFreeCleanupAction[];

export interface PlanReleaseCleanupOptions {
	ctx: RepoSlotContext;
	targets: readonly FreedSlot[];
	cleanupActions: readonly SlotFreeCleanupAction[];
	trunkBranch?: string | undefined;
}

export interface ExecuteReleaseCleanupOptions {
	ctx: RepoSlotContext;
	targets: readonly FreedSlot[];
	cleanupActions: readonly SlotFreeCleanupAction[];
	trunkBranch?: string | undefined;
	progress?: SlotReleaseCleanupProgressReporter | undefined;
}

export type SlotReleaseCleanupProgressEvent =
	| { type: "pr_lookup_started"; target: FreedSlot }
	| { type: "pr_close_started"; target: FreedSlot; prNumber: number }
	| { type: "local_branch_lookup_started"; target: FreedSlot }
	| { type: "local_branch_delete_started"; target: FreedSlot }
	| { type: "cleanup_finished"; result: SlotFreeCleanupResult };

export type SlotReleaseCleanupProgressReporter = (event: SlotReleaseCleanupProgressEvent) => void;

interface CleanupForTargetsOptions {
	ctx: RepoSlotContext;
	targets: readonly FreedSlot[];
	cleanupActions: readonly SlotFreeCleanupAction[];
	trunkBranch?: string | undefined;
	shouldExecute: boolean;
	progress?: SlotReleaseCleanupProgressReporter | undefined;
}

interface CleanupPrOptions {
	ctx: RepoSlotContext;
	target: FreedSlot;
	shouldExecute: boolean;
	progress?: SlotReleaseCleanupProgressReporter | undefined;
}

interface CleanupLocalBranchOptions {
	ctx: RepoSlotContext;
	target: FreedSlot;
	trunkBranch: string;
	shouldExecute: boolean;
	progress?: SlotReleaseCleanupProgressReporter | undefined;
}

interface CleanupResultOptions {
	target: FreedSlot;
	action: SlotFreeCleanupAction;
	status: SlotFreeCleanupStatus;
	prNumber?: number | undefined;
	message?: string | undefined;
}

export async function planReleaseCleanup(
	options: PlanReleaseCleanupOptions,
): Promise<readonly SlotFreeCleanupResult[]> {
	return await cleanupForTargets({ ...options, shouldExecute: false });
}

export async function executeReleaseCleanup(
	options: ExecuteReleaseCleanupOptions,
): Promise<readonly SlotFreeCleanupResult[]> {
	return await cleanupForTargets({ ...options, shouldExecute: true });
}

async function cleanupForTargets(
	options: CleanupForTargetsOptions,
): Promise<readonly SlotFreeCleanupResult[]> {
	if (options.targets.length === 0 || options.cleanupActions.length === 0) return [];
	const needsTrunk = options.cleanupActions.includes("local-branch");
	const trunkBranch = needsTrunk
		? (options.trunkBranch ?? (await options.ctx.git.getTrunkBranch()))
		: null;
	const results: SlotFreeCleanupResult[] = [];
	for (const target of options.targets) {
		for (const action of options.cleanupActions) {
			const result =
				action === "pr"
					? await cleanupPr({
							ctx: options.ctx,
							target,
							shouldExecute: options.shouldExecute,
							...(options.progress === undefined ? {} : { progress: options.progress }),
						})
					: await cleanupLocalBranch({
							ctx: options.ctx,
							target,
							trunkBranch: requireTrunkBranch(trunkBranch),
							shouldExecute: options.shouldExecute,
							...(options.progress === undefined ? {} : { progress: options.progress }),
						});
			results.push(result);
			options.progress?.({ type: "cleanup_finished", result });
			if (result.status === "error") return results;
		}
	}
	return results;
}

async function cleanupPr(options: CleanupPrOptions): Promise<SlotFreeCleanupResult> {
	options.progress?.({ type: "pr_lookup_started", target: options.target });
	const lookup = await options.ctx.pr.getPrForBranch(options.target.branchName);
	if (lookup.type === "miss")
		return cleanupResult({
			target: options.target,
			action: "pr",
			status: "skipped",
			message: "no matching PR",
		});
	if (lookup.type === "failure")
		return cleanupResult({
			target: options.target,
			action: "pr",
			status: "error",
			message: prFailureMessage(lookup.failure),
		});
	if (lookup.pr.state === "CLOSED" || lookup.pr.state === "MERGED")
		return cleanupResult({
			target: options.target,
			action: "pr",
			status: "skipped",
			prNumber: lookup.pr.number,
			message: `PR is already ${lookup.pr.state.toLowerCase()}`,
		});
	if (!options.shouldExecute)
		return cleanupResult({
			target: options.target,
			action: "pr",
			status: "planned",
			prNumber: lookup.pr.number,
		});
	options.progress?.({
		type: "pr_close_started",
		target: options.target,
		prNumber: lookup.pr.number,
	});
	const close = await options.ctx.pr.closePr(lookup.pr.number);
	if (close.type === "failure")
		return cleanupResult({
			target: options.target,
			action: "pr",
			status: "error",
			prNumber: lookup.pr.number,
			message: prFailureMessage(close.failure),
		});
	return cleanupResult({
		target: options.target,
		action: "pr",
		status: "success",
		prNumber: lookup.pr.number,
	});
}

async function cleanupLocalBranch(
	options: CleanupLocalBranchOptions,
): Promise<SlotFreeCleanupResult> {
	if (options.target.branchName === options.trunkBranch)
		return cleanupResult({
			target: options.target,
			action: "local-branch",
			status: "error",
			message: `refusing to delete trunk branch ${options.trunkBranch}`,
		});
	if (!options.shouldExecute)
		return cleanupResult({ target: options.target, action: "local-branch", status: "planned" });
	options.progress?.({ type: "local_branch_lookup_started", target: options.target });
	if (!(await options.ctx.git.branchExists(options.target.branchName)))
		return cleanupResult({
			target: options.target,
			action: "local-branch",
			status: "skipped",
			message: "already absent",
		});
	options.progress?.({ type: "local_branch_delete_started", target: options.target });
	const failure = await options.ctx.git.deleteLocalBranch(options.target.branchName, {
		shouldForce: true,
	});
	if (failure === null)
		return cleanupResult({ target: options.target, action: "local-branch", status: "success" });
	if (isMissingLocalBranchFailure(failure.message, options.target.branchName))
		return cleanupResult({
			target: options.target,
			action: "local-branch",
			status: "skipped",
			message: "already absent",
		});
	return cleanupResult({
		target: options.target,
		action: "local-branch",
		status: "error",
		message: failure.message,
	});
}

function cleanupResult(options: CleanupResultOptions): SlotFreeCleanupResult {
	return {
		slotName: options.target.slotName,
		branchName: options.target.branchName,
		action: options.action,
		status: options.status,
		prNumber: options.prNumber ?? null,
		message: options.message ?? null,
	};
}

function requireTrunkBranch(trunkBranch: string | null): string {
	if (trunkBranch === null)
		throw new Error("local branch cleanup requires a resolved trunk branch");
	return trunkBranch;
}

function isMissingLocalBranchFailure(message: string, branch: string): boolean {
	return message.toLowerCase().includes(`branch '${branch.toLowerCase()}' not found`);
}
