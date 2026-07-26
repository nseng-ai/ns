import type { NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import {
	publicationBindRequestSchema,
	publicationBindResultSchema,
	runPublicationBind,
} from "../../../../ns/publication-commands.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../../../../ns/publication-context.ts";
import { objectiveNsCommandWithContext } from "../../../../ns/objective-command.ts";

export async function command(
	createContext?: (
		api: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> | ObjectiveRunnerPublicationCommandContext,
) {
	return objectiveNsCommandWithContext({
		schema: publicationBindRequestSchema,
		resultSchema: publicationBindResultSchema,
		negativeSchema: publicationBindResultSchema,
		failureSchema: publicationBindResultSchema,
		usageErrorSchema: z.any(),
		createContext: createContext ?? createNsObjectiveRunnerPublicationContext,
		handler: runPublicationBind,
		renderHuman: (result) =>
			result.type === "bound"
				? `Bound Objective Runner publication authorization at ${result.authorizationPath}.`
				: `Publication binding refused: ${result.code}.`,
	});
}
