import { join } from "node:path";

import { failure, ok } from "@ji/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";

export const resolvePromptRequestSchema = z.object({
	name: z.string().describe("Prompt name to resolve."),
});

export const resolvePromptResultSchema = z.object({
	path: z.string(),
	tier: z.enum(["project", "global"]),
});

export type ResolvePromptRequest = z.infer<typeof resolvePromptRequestSchema>;
export type ResolvePromptResult = z.infer<typeof resolvePromptResultSchema>;

export async function runResolvePrompt(ctx: BrmemCliContext, request: ResolvePromptRequest) {
	const repoRoot = await ctx.promptResolver.repositoryRoot({ cwd: ctx.cwd });
	if (repoRoot.type === "error") return failure(repoRoot.error.code, repoRoot.error.message);

	const projectPath = join(repoRoot.value, ".ns", "prompts", `${request.name}.md`);
	const globalPaths = ctx.promptResolver
		.globalPromptRoots()
		.map((root) => join(root, `${request.name}.md`));

	if (await ctx.promptResolver.fileExists(projectPath))
		return ok({ path: projectPath, tier: "project" } satisfies ResolvePromptResult);
	for (const globalPath of globalPaths) {
		if (await ctx.promptResolver.fileExists(globalPath))
			return ok({ path: globalPath, tier: "global" } satisfies ResolvePromptResult);
	}

	return failure(
		"prompt-not-found",
		`No prompt named ${JSON.stringify(request.name)} found. Checked:\n` +
			[
				`  - ${projectPath} (project-local)`,
				...globalPaths.map((path) => `  - ${path} (global)`),
			].join("\n") +
			"\n" +
			"Initialize the global default by running `just install-tools` from a sdl checkout, " +
			"or copy a packaged `default-prompt.md` to one of the paths above.",
	);
}

export function renderResolvePrompt(result: ResolvePromptResult): string {
	return result.path;
}
