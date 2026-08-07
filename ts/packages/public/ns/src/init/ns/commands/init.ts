import {
	initNs,
	initNsRequestSchema,
	initNsResultSchema,
	renderInitNsHuman,
	renderInitNsMarkdown,
} from "../../init-ns.ts";
import { nsInitCommand } from "../command.ts";

export const nsInitNsCommand = nsInitCommand({
	name: "init",
	summary: "Activate ns in this repository.",
	description:
		"Activate ns in this repository by writing ns.toml, generating agent instructions, and creating declared consumer directories.",
	schema: initNsRequestSchema,
	resultSchema: initNsResultSchema,
	handler: (context, request) => initNs(context, { ...request, cwd: context.cwd }),
	renderHuman: renderInitNsHuman,
	renderMarkdown: renderInitNsMarkdown,
});

export default nsInitNsCommand;
