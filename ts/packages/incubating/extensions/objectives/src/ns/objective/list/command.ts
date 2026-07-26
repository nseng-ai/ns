import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [
		{ resolveRenderCapabilities },
		{ objectiveNsCommand },
		list,
		{ renderObjectiveListPretty },
	] = await Promise.all([
		import("@nseng-ai/clinkr"),
		import("../../objective-command.ts"),
		import("../../../core/operations/list-objectives.ts"),
		import("../../../core/operations/list-objectives-pretty.ts"),
	]);
	return objectiveNsCommand({
		schema: list.listObjectivesRequestSchema,
		options: { names: { short: "-n" }, status: { short: "-s" } },
		resultSchema: list.objectiveListResultSchema,
		handler: list.runListObjectives,
		renderHuman: (data, caps) =>
			renderObjectiveListPretty(data, resolveRenderCapabilities(caps), Date.now()),
		renderMarkdown: list.renderObjectiveListMarkdown,
	});
}

const COMMAND_DESCRIPTION = "List Objective records in the current checkout.";
