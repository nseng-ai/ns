import { harnessArtifactsNsCommand } from "../command.ts";
import {
	nsUpdateCliRequestSchema,
	nsUpdateResultSchema,
	renderNsUpdateHuman,
	runNsUpdateCli,
} from "../update.ts";

export const nsUpdateCommand = harnessArtifactsNsCommand({
	name: "update",
	summary: "Update ns itself.",
	description:
		"Reserved ns self-update surface. Use ns extension update <source> to update one declared extension.",
	schema: nsUpdateCliRequestSchema,
	resultSchema: nsUpdateResultSchema,
	handler: runNsUpdateCli,
	renderHuman: renderNsUpdateHuman,
});

export default nsUpdateCommand;
