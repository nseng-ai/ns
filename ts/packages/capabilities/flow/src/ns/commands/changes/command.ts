import { defineFirstPartyCommand } from "@nseng-ai/capability-kit";
import { z } from "@nseng-ai/sdk";

import {
	MAX_DISPLAY_FILE_LINES,
	renderChangesHuman,
	runChangesCommand,
	type ChangesResult,
} from "./impl.ts";

export type { ChangesResult } from "./impl.ts";

const changesFileSchema = z.object({
	path: z.string(),
	status: z.string().length(2),
	indexStatus: z.string().max(1),
	worktreeStatus: z.string().max(1),
	label: z.string(),
});

const changesResultSchema: z.ZodType<ChangesResult> = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("clean"),
		branch: z.string(),
		summary: z.array(z.string()).max(4),
		files: z.array(changesFileSchema).max(MAX_DISPLAY_FILE_LINES),
		totalFileCount: z.literal(0),
		omittedFileCount: z.literal(0),
	}),
	z.object({
		state: z.literal("dirty"),
		branch: z.string(),
		summary: z.array(z.string()).min(1).max(4),
		files: z.array(changesFileSchema).max(MAX_DISPLAY_FILE_LINES),
		totalFileCount: z.number().int().nonnegative(),
		omittedFileCount: z.number().int().nonnegative(),
	}),
]);

const CHANGES_COMMAND_DESCRIPTION = `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`;

export const flowChangesCommand = defineFirstPartyCommand({
	name: "changes",
	summary: "Summarize outstanding worktree changes without committing.",
	description: CHANGES_COMMAND_DESCRIPTION,
	clinkr: {
		schema: z.object({}),
		resultSchema: changesResultSchema,
		renderHuman: renderChangesHuman,
		handler: runChangesCommand,
	},
});

export default flowChangesCommand;
