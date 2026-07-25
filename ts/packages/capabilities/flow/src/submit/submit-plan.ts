import type { SubmitPrLink } from "./gt-output.ts";
import type {
	SubmitStackBranch,
	SubmitStackInspectionGateway,
	SubmitStackInspectionProgressListener,
} from "./submit-stack-inspection.ts";

export interface SubmitPlan {
	readonly currentBranch: string;
	readonly branches: readonly SubmitStackBranch[];
	readonly existingPrLinks: readonly SubmitPrLink[];
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
			existingPrLinks: inspected.value.branches.flatMap((branch) =>
				branch.kind === "existing" ? [branch.pr] : [],
			),
			hasUpstackBranches: inspected.value.hasUpstackBranches,
		},
	};
}
