import { buildStackLandingPlan } from "../api.ts";
import { failure, success, type LandStackResult } from "./errors.ts";
import { createLandContext } from "./land-context-adapter.ts";
import { toFlowLandingPlan, toLandStackFailure } from "./plan-mapping.ts";
import { loadLandingShape } from "./stack-facts.ts";
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
	const shape = options.preloadedShape
		? success(options.preloadedShape)
		: await loadLandingShape(runtime.commands, cwd, { graphite: runtime.graphite });
	if (shape.type === "failure") return shape;

	const landPlan = await buildStackLandingPlan(
		createLandContext(runtime.commands, { graphite: runtime.graphite }),
		cwd,
		{
			shouldAllowSubmitRequiredState: Boolean(options.shouldAllowSubmitRequiredState),
			preloadedShape: {
				repoRoot: shape.value.repoRoot,
				current: shape.value.current,
				trunk: shape.value.trunk,
				metadataDbPath: shape.value.metadataDbPath,
				stack: {
					...shape.value.stack,
					warnings: shape.value.stack.warnings.map((message) => ({ level: "warning", message })),
				},
			},
			...(options.landingBranchLimit === undefined
				? {}
				: { landingBranchLimit: options.landingBranchLimit }),
		},
	);
	if (landPlan.type === "failure") return failure(toLandStackFailure(landPlan.failure));

	return success(toFlowLandingPlan(landPlan.value));
}
