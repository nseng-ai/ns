import { prepareEntryContentFromSource } from "@nseng-ai/brmem";
import { failure, ok } from "@nseng-ai/clinkr/legacy";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { createHandoffArtifact, prepareHandoffCreation } from "../artifact-storage.ts";
import type { HandoffCliContext } from "../context.ts";
import { deriveHandoffContentSlug } from "../content-slug.ts";
import { HANDOFF_NAMESPACE, normalizeHandoffSlugInput } from "../identity.ts";
import { resolveBranch } from "./shared.ts";

const STDIN_SOURCE_FILE = "<stdin>";

export const createRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe(
			"Optional Handoff name override. Omit to derive a semantic slug from the exact final Markdown content.",
		),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	file: z
		.string()
		.optional()
		.describe("Read final Handoff Markdown from this file. Defaults to stdin."),
});

const createResultBaseSchema = z.object({
	namespace: z.literal(HANDOFF_NAMESPACE),
	branch: z.string(),
	slug: z.string(),
	key: z.string(),
	entryLocator: z.string(),
	commit: z.string(),
	sourceFile: z.string(),
});

export const createResultSchema = z.discriminatedUnion("slugSource", [
	createResultBaseSchema.extend({
		slugSource: z.literal("explicit"),
		requestedSlug: z.string(),
	}),
	createResultBaseSchema.extend({
		slugSource: z.literal("content-derived"),
		provider: z.string(),
		model: z.string(),
	}),
]);

export type CreateRequest = z.infer<typeof createRequestSchema>;
export type CreateResult = z.infer<typeof createResultSchema>;

export async function runCreate(ctx: HandoffCliContext, request: CreateRequest) {
	const branch = await resolveBranch(ctx, request.branch, {
		detachedMessage: "Cannot create handoff in detached HEAD; pass --branch <branch>.",
	});
	if (branch.type !== "resolved") return branch;

	const explicitSlug =
		request.slug === undefined ? undefined : normalizeHandoffSlugInput(request.slug);
	if (explicitSlug?.type === "invalid") {
		return failure("invalid-handoff-slug", explicitSlug.message);
	}

	const explicitTarget =
		explicitSlug === undefined
			? undefined
			: await prepareHandoffCreation(
					{ brmem: ctx.brmem },
					{ branch: branch.value, slug: explicitSlug.slug },
				);
	if (explicitTarget?.type === "error") {
		return failure(explicitTarget.error.code, explicitTarget.error.message);
	}

	const prepared = await prepareEntryContentFromSource({
		cwd: ctx.cwd,
		key: "handoff.md",
		stdin: request.file === undefined,
		...optionalEntry("file", request.file),
		sourceReader: ctx.sourceReader,
	});
	if (prepared.type === "error") return failure(prepared.error.code, prepared.error.message);

	let slugEvidence:
		| { slugSource: "explicit"; slug: string; requestedSlug: string }
		| { slugSource: "content-derived"; slug: string; provider: string; model: string };
	if (explicitSlug !== undefined) {
		slugEvidence = {
			slugSource: "explicit",
			slug: explicitSlug.slug,
			requestedSlug: explicitSlug.requestedSlug,
		};
	} else {
		try {
			const derived = await deriveHandoffContentSlug(
				{
					commands: ctx.commands,
					git: ctx.git,
					projectConfig: ctx.projectConfig,
					presentModelWarning: (message) => ctx.stderr(`${message}\n`),
				},
				{ content: prepared.value.content, cwd: ctx.cwd },
			);
			slugEvidence = {
				slugSource: "content-derived",
				slug: derived.slug,
				provider: derived.provider,
				model: derived.model,
			};
		} catch (error) {
			return failure(
				"handoff-slug-derivation-failed",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	const target =
		explicitTarget?.type === "ok"
			? explicitTarget
			: await prepareHandoffCreation(
					{ brmem: ctx.brmem },
					{ branch: branch.value, slug: slugEvidence.slug },
				);
	if (target.type === "error") return failure(target.error.code, target.error.message);

	const created = await createHandoffArtifact(
		{ brmem: ctx.brmem },
		{ branch: target.value.branch, key: target.value.key, content: prepared.value.content },
	);
	if (created.type === "error") return failure(created.error.code, created.error.message);

	return ok({
		namespace: HANDOFF_NAMESPACE,
		branch: created.value.branch,
		key: created.value.key,
		entryLocator: created.value.entryLocator,
		commit: created.value.commit,
		sourceFile: prepared.value.sourceFile,
		...slugEvidence,
	} satisfies CreateResult);
}

export function renderCreate(result: CreateResult): string {
	const source = result.sourceFile === STDIN_SOURCE_FILE ? "stdin" : result.sourceFile;
	return [
		`Created handoff \`${result.slug}\` on branch \`${result.branch}\` from ${source}.`,
		...(result.slugSource === "explicit" && result.requestedSlug !== result.slug
			? [`Normalized requested slug ${JSON.stringify(result.requestedSlug)} to \`${result.slug}\`.`]
			: []),
		...(result.slugSource === "content-derived"
			? [`Derived slug with ${result.provider}/${result.model}.`]
			: []),
		`Entry Locator: ${result.entryLocator}`,
		`Commit: ${result.commit}`,
		`Inspect: git show ${result.entryLocator}`,
	].join("\n");
}
