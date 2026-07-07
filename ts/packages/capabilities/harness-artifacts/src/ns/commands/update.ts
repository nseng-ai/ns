import { defineExtension } from "@nseng-ai/kernel/sdk";

import { harnessArtifactsNsCommand } from "../command.ts";
import {
	nsUpdateRequestSchema,
	nsUpdateResultSchema,
	renderNsUpdateHuman,
	runNsUpdate,
} from "../update.ts";

export const nsUpdateCommand = harnessArtifactsNsCommand({
	name: "update",
	summary: "Update ns and extension-managed harness artifacts.",
	description:
		"Preview or apply self-updates and extension-managed harness artifact updates selected by ns.toml.",
	schema: nsUpdateRequestSchema,
	options: {
		dryRun: { short: "-n" },
		force: { short: "-f" },
	},
	resultSchema: nsUpdateResultSchema,
	handler: runNsUpdate,
	renderHuman: renderNsUpdateHuman,
});

export default defineExtension({
	commands: [nsUpdateCommand],
});
