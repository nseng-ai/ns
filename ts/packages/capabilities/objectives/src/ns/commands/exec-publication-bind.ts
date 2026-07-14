import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsExtensionApi } from "@nseng-ai/sdk";

import {
	publicationBindRequestSchema,
	publicationBindResultSchema,
	runPublicationBind,
	type PublicationBindResult,
} from "../publication-commands.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../publication-context.ts";

const DESCRIPTION =
	"Bind one parent-held Objective Runner publication authorization to the current branch and existing pull request.";

export function createObjectiveExecPublicationBindNsCommand(
	createContext: (
		ctx: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> = createNsObjectiveRunnerPublicationContext,
): NsCommand<typeof publicationBindRequestSchema, PublicationBindResult> {
	return createNsDomainCommand({
		name: "publication-bind",
		summary: DESCRIPTION,
		description: DESCRIPTION,
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

export const objectiveExecPublicationBindNsCommand = createObjectiveExecPublicationBindNsCommand();

export default objectiveExecPublicationBindNsCommand;
