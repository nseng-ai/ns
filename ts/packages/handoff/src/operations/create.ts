import { prepareEntryContentFromSource } from "@sdl/brmem";
import { failure, ok } from "@sdl/clinkr";
import { z } from "zod";

import { createHandoffArtifact, prepareHandoffCreation } from "../artifact-storage.ts";
import type { HandoffCliContext } from "../context.ts";
import { HANDOFF_NAMESPACE } from "../identity.ts";
import { resolveBranch } from "./shared.ts";

const STDIN_SOURCE_FILE = "<stdin>";

export const createRequestSchema = z.object({
	slug: z.string().describe("Handoff slug."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	file: z
		.string()
		.optional()
		.describe("Read final Handoff Markdown from this file. Defaults to stdin."),
});

export const createResultSchema = z.object({
	namespace: z.literal(HANDOFF_NAMESPACE),
	branch: z.string(),
	slug: z.string(),
	key: z.string(),
	entry_locator: z.string(),
	commit: z.string(),
	source_file: z.string(),
});

export type CreateRequest = z.infer<typeof createRequestSchema>;
export type CreateResult = z.infer<typeof createResultSchema>;

export async function runCreate(ctx: HandoffCliContext, request: CreateRequest) {
	const branch = await resolveBranch(ctx, request.branch, {
		detachedMessage: "Cannot create handoff in detached HEAD; pass --branch <branch>.",
	});
	if (branch.type !== "resolved") return branch;

	const target = await prepareHandoffCreation(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch: branch.value, slug: request.slug },
	);
	if (target.type === "error") return failure(target.error.code, target.error.message);

	const prepared = await prepareEntryContentFromSource({
		cwd: ctx.cwd,
		key: target.value.key,
		file: request.file,
		stdin: request.file === undefined,
		sourceReader: ctx.sourceReader,
	});
	if (prepared.type === "error") return failure(prepared.error.code, prepared.error.message);

	const created = await createHandoffArtifact(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch: target.value.branch, key: target.value.key, content: prepared.value.content },
	);
	if (created.type === "error") return failure(created.error.code, created.error.message);

	return ok({
		namespace: HANDOFF_NAMESPACE,
		branch: created.value.branch,
		slug: created.value.slug,
		key: created.value.key,
		entry_locator: created.value.entry_locator,
		commit: created.value.commit,
		source_file: prepared.value.sourceFile,
	} satisfies CreateResult);
}

export function renderCreate(result: CreateResult): string {
	const source = result.source_file === STDIN_SOURCE_FILE ? "stdin" : result.source_file;
	return [
		`Created handoff \`${result.slug}\` on branch \`${result.branch}\` from ${source}.`,
		`Entry Locator: ${result.entry_locator}`,
		`Commit: ${result.commit}`,
		`Inspect: git show ${result.entry_locator}`,
	].join("\n");
}
