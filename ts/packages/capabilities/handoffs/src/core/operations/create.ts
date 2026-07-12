import { prepareEntryContentFromSource } from "@nseng-ai/brmem";
import { failure, ok } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { createHandoffArtifact, prepareHandoffCreation } from "../artifact-storage.ts";
import type { HandoffCliContext } from "../context.ts";
import { HANDOFF_NAMESPACE, normalizeHandoffSlugInput } from "../identity.ts";
import { resolveBranch } from "./shared.ts";

const STDIN_SOURCE_FILE = "<stdin>";

export const createRequestSchema = z.object({
	slug: z
		.string()
		.describe(
			"Handoff name or slug. Normalized deterministically: lowercase, non-alphanumeric runs become single dashes, dashes trimmed, trailing .md dropped.",
		),
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
	requestedSlug: z.string(),
	key: z.string(),
	entryLocator: z.string(),
	commit: z.string(),
	sourceFile: z.string(),
});

export type CreateRequest = z.infer<typeof createRequestSchema>;
export type CreateResult = z.infer<typeof createResultSchema>;

export async function runCreate(ctx: HandoffCliContext, request: CreateRequest) {
	const normalized = normalizeHandoffSlugInput(request.slug);
	if (normalized.type === "invalid") {
		return failure("invalid-handoff-slug", normalized.message);
	}

	const branch = await resolveBranch(ctx, request.branch, {
		detachedMessage: "Cannot create handoff in detached HEAD; pass --branch <branch>.",
	});
	if (branch.type !== "resolved") return branch;

	const target = await prepareHandoffCreation(
		{ brmem: ctx.brmem },
		{ branch: branch.value, slug: normalized.slug },
	);
	if (target.type === "error") return failure(target.error.code, target.error.message);

	const prepared = await prepareEntryContentFromSource({
		cwd: ctx.cwd,
		key: target.value.key,
		stdin: request.file === undefined,
		...optionalEntry("file", request.file),
		sourceReader: ctx.sourceReader,
	});
	if (prepared.type === "error") return failure(prepared.error.code, prepared.error.message);

	const created = await createHandoffArtifact(
		{ brmem: ctx.brmem },
		{ branch: target.value.branch, key: target.value.key, content: prepared.value.content },
	);
	if (created.type === "error") return failure(created.error.code, created.error.message);

	return ok({
		namespace: HANDOFF_NAMESPACE,
		branch: created.value.branch,
		slug: created.value.slug,
		requestedSlug: normalized.requestedSlug,
		key: created.value.key,
		entryLocator: created.value.entryLocator,
		commit: created.value.commit,
		sourceFile: prepared.value.sourceFile,
	} satisfies CreateResult);
}

export function renderCreate(result: CreateResult): string {
	const source = result.sourceFile === STDIN_SOURCE_FILE ? "stdin" : result.sourceFile;
	return [
		`Created handoff \`${result.slug}\` on branch \`${result.branch}\` from ${source}.`,
		...(result.requestedSlug === result.slug
			? []
			: [
					`Normalized requested slug ${JSON.stringify(result.requestedSlug)} to \`${result.slug}\`.`,
				]),
		`Entry Locator: ${result.entryLocator}`,
		`Commit: ${result.commit}`,
		`Inspect: git show ${result.entryLocator}`,
	].join("\n");
}
