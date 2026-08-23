import type { ClinkrCommandMetadata, ClinkrExit } from "@nseng-ai/clinkr";
import type { ObjectiveCliContext } from "../../../core/context.ts";
import type { CheckObjectiveResult } from "../../../core/operations/check-objective.ts";
import type { ObjectiveEdgeSweepResult } from "../../../core/operations/edge-sweep.ts";

interface ObjectiveCheckCommandRequest {
	readonly slug?: string | undefined;
	readonly all?: boolean | undefined;
}

type ObjectiveCheckCommandResult = CheckObjectiveResult | ObjectiveEdgeSweepResult;

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

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
			const { usageError } = await import("@nseng-ai/clinkr");
			return usageError("Pass an Objective slug or --all, not both.", { slug: request.slug });
		}
		const { runEdgeSweep } = await import("../../../core/operations/edge-sweep.ts");
		return await runEdgeSweep(ctx.storage);
	}
	const { runCheckObjective } = await import("../../../core/operations/check-objective.ts");
	return await runCheckObjective(ctx, { slug: request.slug });
}

export async function command() {
	const [{ z }, { objectiveNsCommand }, check, edgeSweep] = await Promise.all([
		import("zod"),
		import("../../objective-command.ts"),
		import("../../../core/operations/check-objective.ts"),
		import("../../../core/operations/edge-sweep.ts"),
	]);
	const schema = check.checkObjectiveRequestSchema.extend({
		all: z
			.boolean()
			.optional()
			.describe(
				"Sweep every active record's Record Frontmatter (edges and blocked sentence) instead of checking one slug.",
			),
	});
	const resultSchema = z.discriminatedUnion("status", [
		...check.checkObjectiveResultSchema.options,
		...edgeSweep.objectiveEdgeSweepResultSchema.options,
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
				? edgeSweep.renderEdgeSweep(result, caps)
				: check.renderCheckObjective(result, caps),
	});
}

const COMMAND_DESCRIPTION = "Check one Objective record, or sweep all record edges with --all.";
