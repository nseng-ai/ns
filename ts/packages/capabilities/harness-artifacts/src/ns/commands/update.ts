import { harnessArtifactsNsCommand } from "../command.ts";
import {
	nsUpdateCliRequestSchema,
	nsUpdateResultSchema,
	renderNsUpdateHuman,
	runNsUpdateCli,
} from "../update.ts";

export const nsUpdateCommand = harnessArtifactsNsCommand({
	name: "update",
	summary: "Update ns self or extension artifacts by explicit mode.",
	description:
		"Run ns self-update or update extension harness artifacts. Self-update is reserved but not implemented yet; use --extensions to provision artifacts from declared extensions.",
	schema: nsUpdateCliRequestSchema,
	options: {
		extensions: {},
		self: {},
		all: {},
		dryRun: { short: "-n" },
		force: { short: "-f" },
	},
	positionals: { target: { position: 0 } },
	resultSchema: nsUpdateResultSchema,
	handler: runNsUpdateCli,
	renderHuman: renderNsUpdateHuman,
});

export default nsUpdateCommand;
