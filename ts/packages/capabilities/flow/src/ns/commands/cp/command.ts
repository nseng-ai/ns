import { defineFirstPartyCommand } from "@nseng-ai/capability-kit";
import { z } from "@nseng-ai/sdk";

import { runCpCommand } from "./impl.ts";

export const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses Graphite's configured trunk branch, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message. Checkpoint safety requires a successful configured-trunk lookup from Graphite.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.
`;

const cpRequestSchema = z.object({
	dryRun: z
		.boolean()
		.default(false)
		.describe("Preview the checkpoint message without staging or committing."),
});

export const flowCpCommand = defineFirstPartyCommand({
	name: "cp",
	summary: "Create a checkpoint commit for the current diff.",
	description: CP_COMMAND_DESCRIPTION,
	clinkr: {
		schema: cpRequestSchema,
		resultSchema: z.string(),
		options: { dryRun: { short: "-n" } },
		handler: runCpCommand,
	},
});

export default flowCpCommand;
