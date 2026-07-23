import { usageError, type ClinkrExit, type RenderCapabilities } from "@nseng-ai/clinkr";
import { z } from "zod";

import { objectiveNsCommand } from "../command.ts";
import type { ObjectiveCliContext } from "../../core/context.ts";
import {
	checkObjectiveRequestSchema,
	checkObjectiveResultSchema,
	renderCheckObjective,
	runCheckObjective,
	type CheckObjectiveResult,
} from "../../core/operations/check-objective.ts";
import {
	objectiveEdgeSweepResultSchema,
	renderEdgeSweep,
	runEdgeSweep,
	type ObjectiveEdgeSweepResult,
} from "../../core/operations/edge-sweep.ts";

export const objectiveCheckCommandRequestSchema = checkObjectiveRequestSchema.extend({
	all: z
		.boolean()
		.optional()
		.describe(
			"Sweep every active record's Record Frontmatter (edges and blocked sentence) instead of checking one slug.",
		),
});

export const objectiveCheckCommandResultSchema = z.discriminatedUnion("status", [
	...checkObjectiveResultSchema.options,
	...objectiveEdgeSweepResultSchema.options,
]);

type ObjectiveCheckCommandRequest = z.infer<typeof objectiveCheckCommandRequestSchema>;
type ObjectiveCheckCommandResult = CheckObjectiveResult | ObjectiveEdgeSweepResult;

export async function runObjectiveCheckCommand(
	ctx: ObjectiveCliContext,
	request: ObjectiveCheckCommandRequest,
): Promise<ClinkrExit<ObjectiveCheckCommandResult>> {
	if (request.all === true) {
		if (request.slug !== undefined || request.skipUpdateFormatChecks === true) {
			return usageError(
				"Pass --all by itself; --skip-update-format-checks applies only to a single Objective check.",
				{
					slug: request.slug,
					skipUpdateFormatChecks: request.skipUpdateFormatChecks,
				},
			);
		}
		return await runEdgeSweep(ctx.storage);
	}
	return await runCheckObjective(ctx, {
		slug: request.slug,
		skipUpdateFormatChecks: request.skipUpdateFormatChecks,
	});
}

export function renderObjectiveCheckCommand(
	result: ObjectiveCheckCommandResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.status === "sweep-ok" || result.status === "sweep-failed") {
		return renderEdgeSweep(result, caps);
	}
	return renderCheckObjective(result, caps);
}

export const objectiveCheckNsCommand = objectiveNsCommand({
	name: "check",
	summary: "Check one Objective record, or sweep all record edges with --all.",
	description:
		"Check one Objective record for required files, Markdown headings, and Record Frontmatter edge/blocked structure. Use --skip-update-format-checks to omit only Semantic Update title and required-heading checks while retaining readability checks. With --all, sweep every active record's Record Frontmatter and report structural edge/blocked violations.",
	schema: objectiveCheckCommandRequestSchema,
	resultSchema: objectiveCheckCommandResultSchema,
	positionals: { slug: { position: 0 } },
	options: {
		all: { short: "-a" },
		skipUpdateFormatChecks: {},
	},
	handler: runObjectiveCheckCommand,
	renderHuman: renderObjectiveCheckCommand,
});

export default objectiveCheckNsCommand;
