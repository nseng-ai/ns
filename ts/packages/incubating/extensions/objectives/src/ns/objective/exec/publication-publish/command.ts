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
		schema: publication.publicationPublishRequestSchema,
		resultSchema: publication.publicationPublishResultSchema,
		negativeSchema: publication.publicationPublishResultSchema,
		failureSchema: publication.publicationPublishResultSchema,
		usageErrorSchema: z.any(),
		createContext: createContext ?? context.createNsObjectiveRunnerPublicationContext,
		handler: publication.runPublicationPublish,
		renderHuman: (result) => {
			if (result.type === "published") return `Published ${result.headSha}.`;
			if (
				result.type === "pushed-pr-update-failed" ||
				result.type === "pushed-but-authorization-update-failed"
			) {
				return `${result.type}: pushed ${result.headSha}; ${result.error.message}`;
			}
			return `${result.type}: ${result.type === "refused" ? result.code : result.error.message}`;
		},
	});
}

const COMMAND_DESCRIPTION =
	"Publish one verified parent checkpoint to its bound branch and best-effort update the existing pull request.";
