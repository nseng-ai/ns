import type { NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import {
	publicationPublishRequestSchema,
	publicationPublishResultSchema,
	runPublicationPublish,
} from "../../../publication-commands.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../../../publication-context.ts";
import { objectiveNsCommandWithContext } from "../../../objective-command.ts";

export async function command(
	createContext?: (
		api: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> | ObjectiveRunnerPublicationCommandContext,
) {
	return objectiveNsCommandWithContext({
		schema: publicationPublishRequestSchema,
		resultSchema: publicationPublishResultSchema,
		negativeSchema: publicationPublishResultSchema,
		failureSchema: publicationPublishResultSchema,
		usageErrorSchema: z.any(),
		createContext: createContext ?? createNsObjectiveRunnerPublicationContext,
		handler: runPublicationPublish,
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
