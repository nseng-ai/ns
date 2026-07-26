import type {
	SubmitStackBranch,
	SubmitStackInspectionGateway,
	SubmitStackInspectionProgressListener,
} from "./submit-stack-inspection.ts";

export interface SubmitPlan {
	readonly currentBranch: string;
	readonly branches: readonly SubmitStackBranch[];
	readonly hasUpstackBranches: boolean;
}

export type BuildSubmitPlanResult =
	| { kind: "planned"; plan: SubmitPlan }
	| { kind: "failed"; error: string };

export async function buildSubmitPlan(input: {
	cwd: string;
	gateway: Pick<SubmitStackInspectionGateway, "inspectSubmitStack">;
	onProgress?: SubmitStackInspectionProgressListener;
}): Promise<BuildSubmitPlanResult> {
	input.onProgress?.("inspecting Graphite submit scope");
	const inspected = await input.gateway.inspectSubmitStack({
		cwd: input.cwd,
		...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
	});
	if (!inspected.ok) return { kind: "failed", error: inspected.error.message };
	return {
		kind: "planned",
		plan: {
			currentBranch: inspected.value.currentBranch,
			branches: inspected.value.branches,
			hasUpstackBranches: inspected.value.hasUpstackBranches,
		},
	};
}
