import { z } from "@nseng-ai/sdk";
import { nsClinkrCommand, defineCommand } from "@nseng-ai/sdk/command";

import type { FlowCommandContext } from "../../context.ts";

import { runChangesCommand } from "./impl.ts";

const CHANGES_COMMAND_DESCRIPTION = `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`;

export function createFlowChangesCommand(context: FlowCommandContext) {
	return defineCommand({
		name: "changes",
		summary: "Summarize outstanding worktree changes without committing.",
		description: CHANGES_COMMAND_DESCRIPTION,
		run: nsClinkrCommand({
			resultSchema: z.string(),
			handler: (bundle) => runChangesCommand(context, bundle),
		}),
	});
}

export default createFlowChangesCommand;
