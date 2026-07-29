import { objectiveNsCommand } from "../command.ts";
import {
	renderResolveOwner,
	resolveOwnerRequestSchema,
	resolveOwnerResultSchema,
	runResolveOwner,
} from "../../core/operations/resolve-owner.ts";

export const objectiveExecResolveOwnerNsCommand = objectiveNsCommand({
	name: "resolve-owner",
	summary: "Resolve the Objective owner for creation: explicit --owner or the GitHub login.",
	description:
		"Resolve the Objective owner deterministically: an explicit --owner handle wins and is validated offline; otherwise the authenticated GitHub login is used. Read-only and non-interactive.",
	schema: resolveOwnerRequestSchema,
	resultSchema: resolveOwnerResultSchema,
	options: { owner: {} },
	handler: runResolveOwner,
	renderHuman: renderResolveOwner,
	renderMarkdown: renderResolveOwner,
});

export default objectiveExecResolveOwnerNsCommand;
