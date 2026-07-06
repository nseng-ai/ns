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
	summary: "Update ns harness artifacts from selected harnesses.",
	description:
		"Preview or apply updates for manifest-tracked ns harness artifacts and artifacts selected by ns.toml.",
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
