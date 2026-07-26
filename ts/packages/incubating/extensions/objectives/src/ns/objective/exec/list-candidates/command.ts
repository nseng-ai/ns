import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [{ objectiveNsCommand }, operation] = await Promise.all([
		import("../../../objective-command.ts"),
		import("../../../../core/operations/list-candidates.ts"),
	]);
	return objectiveNsCommand({
		schema: operation.listCandidatesRequestSchema,
		resultSchema: operation.listCandidatesResultSchema,
		handler: operation.runListCandidates,
		renderHuman: operation.renderListCandidates,
	});
}

const COMMAND_DESCRIPTION =
	"List active Objective slug candidates for shell and agent autocomplete.";
