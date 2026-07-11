import type { GatewayResult } from "@nseng-ai/capability-kit/gateway-result";
import { ok } from "@nseng-ai/capability-kit/gateway-result";

import type { SubmitPrLink } from "./gt-output.ts";
import { walkParentBranchChain } from "./parent-branch-chain.ts";
import type {
	SubmitMetadataGateway,
	SubmitMetadataProgressListener,
	SubmitStackBranch,
	SubmitStackInspection,
	SubmitStackNewBranch,
} from "./submit-pr-metadata-prewrite.ts";

export interface SubmitPlan {
	readonly currentBranch: string;
	readonly branches: readonly SubmitStackBranch[];
	readonly existingPrLinks: readonly SubmitPrLink[];
	readonly hasUpstackBranches: boolean;
	readonly metadataPrewriteBranches: readonly SubmitStackNewBranch[];
	readonly skippedMetadataBranches: readonly SubmitStackBranch[];
}

export type BuildSubmitPlanResult =
	| { kind: "planned"; plan: SubmitPlan }
	| { kind: "failed"; error: string };

export async function buildSubmitPlan(input: {
	cwd: string;
	gateway: Pick<SubmitMetadataGateway, "inspectSubmitStack">;
	onProgress?: SubmitMetadataProgressListener;
}): Promise<BuildSubmitPlanResult> {
	input.onProgress?.("inspecting Graphite submit scope before metadata preparation");
	const inspected = await input.gateway.inspectSubmitStack({
		cwd: input.cwd,
		...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
	});
	if (!inspected.ok) {
		return { kind: "failed", error: inspected.error.message };
	}

	const metadataPlan = await planMetadataPrewrite(inspected.value);
	if (!metadataPlan.ok) {
		return { kind: "failed", error: metadataPlan.error.message };
	}

	return {
		kind: "planned",
		plan: {
			currentBranch: inspected.value.currentBranch,
			branches: inspected.value.branches,
			existingPrLinks: inspected.value.branches.flatMap((branch) =>
				branch.kind === "existing" ? [branch.pr] : [],
			),
			hasUpstackBranches: inspected.value.hasUpstackBranches,
			metadataPrewriteBranches: metadataPlan.value.metadataPrewriteBranches,
			skippedMetadataBranches: metadataPlan.value.skippedMetadataBranches,
		},
	};
}

export async function planMetadataPrewrite(
	inspection: SubmitStackInspection,
): Promise<
	GatewayResult<Pick<SubmitPlan, "metadataPrewriteBranches" | "skippedMetadataBranches">>
> {
	const byBranch = new Map(inspection.branches.map((branch) => [branch.branch, branch]));
	const walked = await walkParentBranchChain({
		startBranch: inspection.currentBranch,
		cycleError: (branch) => ({
			code: "submit_amendable_parent_cycle",
			message: `Submit branch amendment traversal looped at ${branch}.`,
		}),
		readStep: (branch) =>
			ok({
				type: "visit",
				parentBranch: byBranch.get(branch)?.parentBranch,
				item: branch,
			}),
	});
	if (!walked.ok) return walked;
	const amendableBranches = new Set(walked.value);

	const metadataPrewriteBranches = inspection.branches.filter(
		(candidate): candidate is SubmitStackNewBranch =>
			candidate.kind === "new" &&
			candidate.commitMessages.length === 1 &&
			amendableBranches.has(candidate.branch),
	);
	const metadataBranchNames = new Set(
		metadataPrewriteBranches.map((candidate) => candidate.branch),
	);
	const skippedMetadataBranches = inspection.branches.filter(
		(candidate) => !metadataBranchNames.has(candidate.branch),
	);

	return ok({ metadataPrewriteBranches, skippedMetadataBranches });
}
