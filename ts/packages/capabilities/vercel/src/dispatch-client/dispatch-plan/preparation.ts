import type { SavedPlanFileEvidence } from "@nseng-ai/plans/api";

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

export type DispatchPlanPreparationOutcome =
	| {
			readonly status: "ready";
			readonly dispatchId: string;
			readonly plan: ResolvedDispatchSavedPlan;
	  }
	| {
			readonly status: "plan-resolution-failed";
			readonly reason: Exclude<DispatchSavedPlanResolution["type"], "resolved">;
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
	return {
		status: "ready",
		dispatchId: context.generateDispatchId(),
		plan: resolution.plan,
	};
}
