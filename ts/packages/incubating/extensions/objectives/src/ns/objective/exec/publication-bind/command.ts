import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import type { ObjectiveRunnerPublicationCommandContext } from "../../../publication-context.ts";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command(
	createContext?: (
		api: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> | ObjectiveRunnerPublicationCommandContext,
) {
	const [{ z }, { objectiveNsCommand }, publication, context] = await Promise.all([
		import("zod"),
		import("../../../objective-command.ts"),
		import("../../../publication-commands.ts"),
		import("../../../publication-context.ts"),
	]);
	return objectiveNsCommand({
		schema: publication.publicationBindRequestSchema,
		resultSchema: publication.publicationBindResultSchema,
		negativeSchema: publication.publicationBindResultSchema,
		failureSchema: publication.publicationBindResultSchema,
		usageErrorSchema: z.any(),
		createContext: createContext ?? context.createNsObjectiveRunnerPublicationContext,
		handler: publication.runPublicationBind,
		renderHuman: (result) =>
			result.type === "bound"
				? `Bound Objective Runner publication authorization at ${result.authorizationPath}.`
				: `Publication binding refused: ${result.code}.`,
	});
}

const COMMAND_DESCRIPTION =
	"Bind one parent-held Objective Runner publication authorization to the current branch and existing pull request.";
