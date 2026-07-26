import type { NsExtensionApi } from "@nseng-ai/sdk";

import { objectiveNsCommand } from "../../../objective-command.ts";
import {
	publicationBindRequestSchema,
	publicationBindResultSchema,
	runPublicationBind,
} from "../../../publication-commands.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../../../publication-context.ts";

export async function command(
	createContext: (
		api: NsExtensionApi,
	) =>
		| Promise<ObjectiveRunnerPublicationCommandContext>
		| ObjectiveRunnerPublicationCommandContext = createNsObjectiveRunnerPublicationContext,
) {
	return objectiveNsCommand({
		schema: publicationBindRequestSchema,
		resultSchema: publicationBindResultSchema,
		createContext,
		handler: runPublicationBind,
		renderHuman: (result) =>
			result.type === "bound"
				? `Bound Objective Runner publication authorization at ${result.authorizationPath}.`
				: `Publication binding refused: ${result.code}.`,
	});
}
