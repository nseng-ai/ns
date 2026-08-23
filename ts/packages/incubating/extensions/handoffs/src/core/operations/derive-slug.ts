import { prepareEntryContentFromSource } from "@nseng-ai/brmem";
import { failure, ok } from "@nseng-ai/clinkr/legacy";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { deriveHandoffContentSlug } from "../content-slug.ts";
import { handoffSlugToKey } from "../identity.ts";

export const deriveSlugRequestSchema = z.object({
	file: z.string().optional().describe("Final Handoff Markdown file. Omit to read stdin."),
});

export const deriveSlugResultSchema = z.object({
	slug: z.string(),
	key: z.string(),
	provider: z.string(),
	model: z.string(),
});

export type DeriveSlugRequest = z.infer<typeof deriveSlugRequestSchema>;
export type DeriveSlugResult = z.infer<typeof deriveSlugResultSchema>;

export async function runDeriveSlug(ctx: HandoffCliContext, request: DeriveSlugRequest) {
	const prepared = await prepareEntryContentFromSource({
		cwd: ctx.cwd,
		key: "content-derived.md",
		stdin: request.file === undefined,
		...optionalEntry("file", request.file),
		sourceReader: ctx.sourceReader,
	});
	if (prepared.type === "error") return failure(prepared.error.code, prepared.error.message);

	const result = await deriveHandoffContentSlug(ctx, {
		content: prepared.value.content,
		cwd: ctx.cwd,
	});
	if (!result.ok) return failure("handoff-slug-derivation-failed", result.error.message);
	const evidence = result.value;
	return ok({
		slug: evidence.slug,
		key: handoffSlugToKey(evidence.slug),
		provider: evidence.provider,
		model: evidence.model,
	} satisfies DeriveSlugResult);
}

export function renderDeriveSlug(result: DeriveSlugResult): string {
	return [
		`Slug: ${result.slug}`,
		`Entry: ${result.key}`,
		`Model: ${result.provider}/${result.model}`,
	].join("\n");
}
