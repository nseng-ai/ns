import { failure } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";

export const notImplementedResultSchema = z.object({
	command: z.string(),
});

export function notImplementedHandler(commandName: string) {
	return async function runNotImplemented(_ctx: BrmemCliContext, _request: Record<string, unknown>) {
		return failure(
			"not_implemented",
			`TypeScript brmem command '${commandName}' is not implemented in this slice; use the existing Python brmem CLI until cutover.`,
		);
	};
}

export const exportRequestSchema = z.object({
	output_dir: z.string().optional().describe("Output directory."),
	namespace: z.string().optional().describe("Namespace."),
	branch: z.string().optional().describe("Branch."),
	all_branches: z.boolean().default(false).describe("Export all branches."),
});

export const resolvePromptRequestSchema = z.object({
	prompt: z.string().optional().describe("Prompt path."),
});
