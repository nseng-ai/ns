import { z } from "zod";

import {
	checkObjectiveRequestSchema,
	checkObjectiveResultSchema,
	renderCheckObjective,
} from "../../../core/operations/check-objective.ts";
import {
	objectiveEdgeSweepResultSchema,
	renderEdgeSweep,
} from "../../../core/operations/edge-sweep.ts";
import { objectiveNsCommand } from "../../../ns/objective-command.ts";

import { runObjectiveCheckCommand } from "../../../ns/objective-check.ts";

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
		positionals: { slug: { position: 0 } },
		options: { all: { short: "-a" } },
		handler: runObjectiveCheckCommand,
		renderHuman: (result, caps) =>
			result.status === "sweep-ok" || result.status === "sweep-failed"
				? renderEdgeSweep(result, caps)
				: renderCheckObjective(result, caps),
	});
}
