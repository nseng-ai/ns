import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [{ objectiveNsCommand }, operation] = await Promise.all([
		import("../../../objective-command.ts"),
		import("../../../../core/operations/read-objective.ts"),
	]);
	return objectiveNsCommand({
		schema: operation.readObjectiveRequestSchema,
		resultSchema: operation.readObjectiveResultSchema,
		negativeSchema: operation.readObjectiveResultSchema,
		positionals: { slug: { position: 0 } },
		handler: operation.runReadObjective,
		renderHuman: operation.renderReadObjective,
		renderMarkdown: operation.renderReadObjective,
	});
}

const COMMAND_DESCRIPTION =
	"Read one Objective record by explicit slug as filesystem facts or raw Markdown.";
