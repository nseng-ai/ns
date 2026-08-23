import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [{ objectiveNsCommand }, operation] = await Promise.all([
		import("../../../objective-command.ts"),
		import("../../../../core/operations/load-orientations.ts"),
	]);
	return objectiveNsCommand({
		schema: operation.loadOrientationsRequestSchema,
		resultSchema: operation.loadOrientationsResultSchema,
		handler: operation.runLoadOrientations,
		renderHuman: operation.renderLoadOrientationsMarkdown,
		renderMarkdown: operation.renderLoadOrientationsMarkdown,
	});
}

const COMMAND_DESCRIPTION = "Load active Objective orientation files for agent onboarding.";
