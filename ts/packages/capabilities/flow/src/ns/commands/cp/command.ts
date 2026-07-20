import { z } from "@nseng-ai/sdk";
import { defineCommand } from "@nseng-ai/sdk/command";

import type { FlowCommandContext } from "../../context.ts";

import { runCpCommand } from "./impl.ts";

export const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses Graphite's configured trunk branch, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message. Checkpoint safety requires a successful configured-trunk lookup from Graphite.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.
`;

export function createFlowCpCommand(context: FlowCommandContext) {
	return defineCommand({
		name: "cp",
		summary: "Create a checkpoint commit for the current diff.",
		description: CP_COMMAND_DESCRIPTION,
		schema: z.object({
			dryRun: z
				.boolean()
				.default(false)
				.describe("Preview the checkpoint message without staging or committing."),
		}),
		resultSchema: z.string(),
		options: { dryRun: { short: "-n" } },
		handler: (bundle, request) => runCpCommand(context, bundle, request),
	});
}

export default createFlowCpCommand;
