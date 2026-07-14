import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsExtensionApi } from "@nseng-ai/sdk";

import {
	publicationPublishRequestSchema,
	publicationPublishResultSchema,
	runPublicationPublish,
	type PublicationPublishResult,
} from "../publication-commands.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../publication-context.ts";

const DESCRIPTION =
	"Publish one verified parent checkpoint to its bound branch and best-effort update the existing pull request.";

export function createObjectiveExecPublicationPublishNsCommand(
	createContext: (
		ctx: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> = createNsObjectiveRunnerPublicationContext,
): NsCommand<typeof publicationPublishRequestSchema, PublicationPublishResult> {
	return createNsDomainCommand({
		name: "publication-publish",
		summary: DESCRIPTION,
		description: DESCRIPTION,
		schema: publicationPublishRequestSchema,
		resultSchema: publicationPublishResultSchema,
		createContext,
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

export const objectiveExecPublicationPublishNsCommand =
	createObjectiveExecPublicationPublishNsCommand();

export default objectiveExecPublicationPublishNsCommand;
