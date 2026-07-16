import { buildEntryLocator, buildSnapshotRef, validateEntryKey } from "@nseng-ai/brmem";
import type { SavedPlanFileEvidence } from "@nseng-ai/plans/api";

export const DISPATCH_CONTEXT_NAMESPACE = "dispatch-context";

export type ResolvedDispatchSavedPlan = Readonly<
	Pick<SavedPlanFileEvidence, "filePath" | "slug" | "sourceBranch">
> & {
	readonly content: string;
};

export interface DispatchSavedPlanGateway {
	resolveExplicitSavedPlan(options: {
		readonly cwd: string;
		readonly planRef: string;
	}): Promise<DispatchSavedPlanResolution>;
}

export type DispatchSavedPlanResolution =
	| { readonly type: "resolved"; readonly plan: ResolvedDispatchSavedPlan }
	| {
			readonly type: "not-found" | "unsafe" | "error";
			readonly message: string;
	  };

export interface DispatchPlanPreparationContext {
	readonly savedPlans: DispatchSavedPlanGateway;
	readonly generateDispatchId: () => string;
}

export interface DispatchPlanEntryPreparation {
	readonly namespace: typeof DISPATCH_CONTEXT_NAMESPACE;
	readonly key: string;
	readonly sourceBranch: string;
	readonly snapshotRef: string;
	readonly entryLocator: string;
	readonly content: string;
}

export type DispatchPlanPreparationOutcome =
	| {
			readonly status: "ready";
			readonly dispatchId: string;
			readonly plan: ResolvedDispatchSavedPlan;
			readonly entry: DispatchPlanEntryPreparation;
	  }
	| {
			readonly status: "plan-resolution-failed";
			readonly reason: Exclude<DispatchSavedPlanResolution["type"], "resolved">;
			readonly message: string;
	  }
	| {
			readonly status: "invalid-dispatch-context";
			readonly dispatchId: string;
			readonly message: string;
	  };

export async function prepareDispatchPlan(
	request: { readonly cwd: string; readonly planRef: string },
	context: DispatchPlanPreparationContext,
): Promise<DispatchPlanPreparationOutcome> {
	const resolution = await context.savedPlans.resolveExplicitSavedPlan(request);
	if (resolution.type !== "resolved") {
		return {
			status: "plan-resolution-failed",
			reason: resolution.type,
			message: resolution.message,
		};
	}

	const dispatchId = context.generateDispatchId();
	const key = `${dispatchId}/plan/${resolution.plan.slug}.md`;
	const keyValidation = validateEntryKey(key);
	if (keyValidation.type === "invalid") {
		return invalidContext(dispatchId, `Invalid dispatch plan Entry Key: ${keyValidation.reason}`);
	}

	const snapshotRef = buildSnapshotRef(DISPATCH_CONTEXT_NAMESPACE, resolution.plan.sourceBranch);
	if (snapshotRef.type === "error") {
		return invalidContext(dispatchId, snapshotRef.error.message);
	}
	const entryLocator = buildEntryLocator(
		DISPATCH_CONTEXT_NAMESPACE,
		key,
		resolution.plan.sourceBranch,
	);
	if (entryLocator.type === "error") {
		return invalidContext(dispatchId, entryLocator.error.message);
	}

	return {
		status: "ready",
		dispatchId,
		plan: resolution.plan,
		entry: {
			namespace: DISPATCH_CONTEXT_NAMESPACE,
			key,
			sourceBranch: resolution.plan.sourceBranch,
			snapshotRef: snapshotRef.value,
			entryLocator: entryLocator.value,
			content: resolution.plan.content,
		},
	};
}

function invalidContext(dispatchId: string, message: string): DispatchPlanPreparationOutcome {
	return { status: "invalid-dispatch-context", dispatchId, message };
}
