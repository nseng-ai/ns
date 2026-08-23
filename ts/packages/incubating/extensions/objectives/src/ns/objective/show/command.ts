import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [{ resolveRenderCapabilities }, { objectiveNsCommand }, show] = await Promise.all([
		import("@nseng-ai/clinkr"),
		import("../../objective-command.ts"),
		import("../../../core/operations/show-objective.ts"),
	]);
	return objectiveNsCommand({
		schema: show.showObjectiveRequestSchema,
		resultSchema: show.showObjectiveResultSchema,
		negativeSchema: show.showObjectiveResultSchema,
		positionals: { slug: { position: 0 } },
		handler: show.runShowObjective,
		renderHuman: (data, caps) =>
			show.renderShowObjectiveHuman(data, resolveRenderCapabilities(caps), Date.now()),
		renderMarkdown: show.renderShowObjectiveMarkdown,
	});
}

const COMMAND_DESCRIPTION = "Show one Objective record with branches and edge annotations.";
