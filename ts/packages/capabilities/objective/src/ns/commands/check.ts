import { usageError, type ClinkrExit, type RenderCapabilities } from "@ns/clinkr";
import { defineExtension } from "@ns/kernel/sdk";
import { z } from "zod";

import { objectiveSdlCommand } from "../command.ts";
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
			"Sweep every record's Record Frontmatter (edges and blocked sentence) across the active and archive roots instead of checking one slug.",
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

export const objectiveCheckSdlCommand = objectiveSdlCommand({
	name: "check",
	summary: "Check one Objective record, or sweep all record edges with --all.",
	description:
		"Check one Objective record for required files, Markdown headings, and Record Frontmatter edge/blocked structure. With --all, sweep every record's Record Frontmatter across the active and archive roots and report structural edge/blocked violations.",
	schema: objectiveCheckCommandRequestSchema,
	resultSchema: objectiveCheckCommandResultSchema,
	positionals: { slug: { position: 0 } },
	options: { all: { short: "-a" } },
	handler: runObjectiveCheckCommand,
	renderHuman: renderObjectiveCheckCommand,
});

export default defineExtension({
	commands: [objectiveCheckSdlCommand],
});
