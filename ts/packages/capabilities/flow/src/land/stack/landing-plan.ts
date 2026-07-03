import { buildStackLandingPlan } from "../api.ts";
import { failure, type LandStackResult } from "./errors.ts";
import { createLandContext } from "./land-context-adapter.ts";
import { toFlowLandingPlan, toLandStackFailure } from "./plan-mapping.ts";
import type { LandRuntime } from "./land-runtime.ts";
import type { LandingPlan, LandingShape } from "./types.ts";

export async function buildLandingPlan(
	runtime: LandRuntime,
	cwd: string,
	options: {
		shouldAllowSubmitRequiredState?: boolean;
		preloadedShape?: LandingShape;
		landingBranchLimit?: number;
	} = {},
): Promise<LandStackResult<LandingPlan>> {
	const landPlan = await buildStackLandingPlan(
		createLandContext(runtime.commands, { graphite: runtime.graphite }),
		cwd,
		{
			shouldAllowSubmitRequiredState: Boolean(options.shouldAllowSubmitRequiredState),
			...(options.preloadedShape === undefined
				? {}
				: { preloadedShape: toDomainLandingShape(options.preloadedShape) }),
			...(options.landingBranchLimit === undefined
				? {}
				: { landingBranchLimit: options.landingBranchLimit }),
		},
	);
	if (landPlan.type === "failure") return failure(toLandStackFailure(landPlan.failure));

	return { type: "success", value: toFlowLandingPlan(landPlan.value) };
}

function toDomainLandingShape(shape: LandingShape) {
	return {
		repoRoot: shape.repoRoot,
		current: shape.current,
		trunk: shape.trunk,
		metadataDbPath: shape.metadataDbPath,
		stack: {
			...shape.stack,
			warnings: shape.stack.warnings.map((message) => ({ level: "warning" as const, message })),
		},
	};
}
