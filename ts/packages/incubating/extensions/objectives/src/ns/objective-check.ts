import { usageError } from "@nseng-ai/clinkr/legacy";

import type { ObjectiveCliContext } from "../core/context.ts";
import { runCheckObjective } from "../core/operations/check-objective.ts";
import { runEdgeSweep } from "../core/operations/edge-sweep.ts";

interface ObjectiveCheckCommandRequest {
	readonly slug?: string | undefined;
	readonly all?: boolean | undefined;
}

export async function runObjectiveCheckCommand(
	ctx: ObjectiveCliContext,
	request: ObjectiveCheckCommandRequest,
) {
	if (request.all === true) {
		if (request.slug !== undefined) {
			return usageError("Pass an Objective slug or --all, not both.", { slug: request.slug });
		}
		return await runEdgeSweep(ctx.storage);
	}
	return await runCheckObjective(ctx, { slug: request.slug });
}
