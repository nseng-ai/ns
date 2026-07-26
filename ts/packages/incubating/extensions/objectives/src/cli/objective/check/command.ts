import { usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../../../core/context.ts";
import {
	checkObjectiveRequestSchema,
	checkObjectiveResultSchema,
	renderCheckObjective,
	runCheckObjective,
	type CheckObjectiveResult,
} from "../../../core/operations/check-objective.ts";
import {
	objectiveEdgeSweepResultSchema,
	renderEdgeSweep,
	runEdgeSweep,
	type ObjectiveEdgeSweepResult,
} from "../../../core/operations/edge-sweep.ts";
import { objectiveNsCommand } from "../../../ns/objective-command.ts";

interface ObjectiveCheckCommandRequest {
	readonly slug?: string | undefined;
	readonly all?: boolean | undefined;
}

type ObjectiveCheckCommandResult = CheckObjectiveResult | ObjectiveEdgeSweepResult;

export async function runObjectiveCheckCommand(
	ctx: ObjectiveCliContext,
	request: ObjectiveCheckCommandRequest,
): Promise<
	ClinkrExit<
		ObjectiveCheckCommandResult,
		ObjectiveCheckCommandResult,
		ObjectiveCheckCommandResult,
		{ readonly slug: string }
	>
> {
	if (request.all === true) {
		if (request.slug !== undefined) {
			return usageError("Pass an Objective slug or --all, not both.", { slug: request.slug });
		}
		return await runEdgeSweep(ctx.storage);
	}
	return await runCheckObjective(ctx, { slug: request.slug });
}

export async function command() {
	const schema = checkObjectiveRequestSchema.extend({
		all: z
			.boolean()
			.optional()
			.describe(
				"Sweep every active record's Record Frontmatter (edges and blocked sentence) instead of checking one slug.",
			),
	});
	const resultSchema = z.discriminatedUnion("status", [
		...checkObjectiveResultSchema.options,
		...objectiveEdgeSweepResultSchema.options,
	]);

	return objectiveNsCommand({
		schema,
		resultSchema,
		negativeSchema: resultSchema,
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		options: { all: { short: "-a" } },
		handler: runObjectiveCheckCommand,
		renderHuman: (result, caps) =>
			result.status === "sweep-ok" || result.status === "sweep-failed"
				? renderEdgeSweep(result, caps)
				: renderCheckObjective(result, caps),
	});
}
