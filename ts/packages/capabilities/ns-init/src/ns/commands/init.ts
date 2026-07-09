import {
	initNs,
	initNsRequestSchema,
	initNsResultSchema,
	renderInitNsHuman,
} from "../../init-ns.ts";
import { nsInitCommand } from "../command.ts";

export const nsInitNsCommand = nsInitCommand({
	name: "init",
	summary: "Activate ns in this repository.",
	description:
		"Activate ns in this repository by writing ns.toml, generating agent instructions, creating declared consumer directories, and provisioning declared extension artifacts.",
	schema: initNsRequestSchema,
	options: { harness: { short: "-H" } },
	resultSchema: initNsResultSchema,
	handler: (context, request) => initNs(context, { ...request, cwd: context.cwd }),
	renderHuman: renderInitNsHuman,
});

export default nsInitNsCommand;
