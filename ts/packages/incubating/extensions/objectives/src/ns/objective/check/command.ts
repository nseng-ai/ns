import { usageError, type ClinkrExit, type RenderCapabilities } from "@nseng-ai/clinkr";
import { z } from "zod";

import { objectiveCommandMetadata, objectiveNsCommand } from "../../objective-command.ts";
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
		if (request.slug !== undefined) {
			return usageError("Pass an Objective slug or --all, not both.", { slug: request.slug });
		}
		return await runEdgeSweep(ctx.storage);
	}
	return await runCheckObjective(ctx, { slug: request.slug });
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

export function metadata() {
	return objectiveCommandMetadata(
		"Check one Objective record for required files, Markdown headings, and Record Frontmatter edge/blocked structure. With --all, sweep every active record's Record Frontmatter and report structural edge/blocked violations.",
		{ summary: "Check one Objective record, or sweep all record edges with --all." },
	);
}

export async function command() {
	return objectiveNsCommand({
		schema: objectiveCheckCommandRequestSchema,
		resultSchema: objectiveCheckCommandResultSchema,
		positionals: { slug: { position: 0 } },
		options: { all: { short: "-a" } },
		handler: runObjectiveCheckCommand,
		renderHuman: renderObjectiveCheckCommand,
	});
}
