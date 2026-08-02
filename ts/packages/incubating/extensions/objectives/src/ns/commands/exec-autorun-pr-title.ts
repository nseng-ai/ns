import { negative, ok, type ClinkrExit } from "@nseng-ai/clinkr/legacy";
import { z } from "zod";

import {
	formatObjectiveAutorunPrTitle,
	OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID,
} from "../../publication/pr-title.ts";
import { createObjectiveAutorunPrTitleTemplateResolver } from "../../publication/pr-title-source.ts";
import type { ObjectiveCliContext } from "../../core/context.ts";
import { objectivesExtensionDescriptorSource } from "../extension.ts";
import { objectiveNsCommand } from "../command.ts";

const AUTORUN_PR_TITLE_DESCRIPTION =
	"Compute the deterministic Objective autorun PR title from the active objective.autorun.pr-title template (ADR 0052). Read-only: never edits a pull request.";

export const autorunPrTitleRequestSchema = z.object({
	objectiveSlug: z.string().min(1).describe("Objective slug owning the accepted autorun slice."),
	autorunOrdinal: z
		.int()
		.positive()
		.describe("1-based position of the accepted checkpoint in the accepted autorun sequence."),
	existingTitle: z.string().min(1).describe("Current pull request title."),
});

export const autorunPrTitleResultSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("resolved"),
		pointId: z.literal(OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID),
		source: z.object({
			type: z.enum(["env", "ns.toml", "conventional", "default"]),
			label: z.string(),
		}),
		objectiveSlug: z.string(),
		autorunOrdinal: z.number().int().positive(),
		existingTitle: z.string(),
		normalizedExistingTitle: z.string(),
		isCanonicalPrefixStripped: z.boolean(),
		title: z.string(),
	}),
	z.object({
		type: z.literal("refused"),
		code: z.string(),
		message: z.string(),
	}),
]);

export type AutorunPrTitleRequest = z.infer<typeof autorunPrTitleRequestSchema>;
export type AutorunPrTitleResult = z.infer<typeof autorunPrTitleResultSchema>;

export async function runAutorunPrTitle(
	ctx: Pick<ObjectiveCliContext, "repoRoot" | "env">,
	request: AutorunPrTitleRequest,
): Promise<ClinkrExit<AutorunPrTitleResult>> {
	const resolver = createObjectiveAutorunPrTitleTemplateResolver({
		repoRoot: ctx.repoRoot,
		descriptorSource: objectivesExtensionDescriptorSource,
		env: ctx.env,
	});
	const resolved = await resolver.resolveTemplate();
	if (resolved.type === "refused") {
		return negative(resolved.message, {
			data: { type: "refused", code: resolved.code, message: resolved.message },
		});
	}
	const formatted = formatObjectiveAutorunPrTitle({
		template: resolved.template,
		objectiveSlug: request.objectiveSlug,
		autorunOrdinal: request.autorunOrdinal,
		existingTitle: request.existingTitle,
	});
	if (formatted.type === "refused") {
		return negative(formatted.message, {
			data: { type: "refused", code: formatted.code, message: formatted.message },
		});
	}
	return ok({
		type: "resolved",
		pointId: OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID,
		source: resolved.source,
		objectiveSlug: request.objectiveSlug,
		autorunOrdinal: request.autorunOrdinal,
		existingTitle: request.existingTitle,
		normalizedExistingTitle: formatted.normalizedExistingTitle,
		isCanonicalPrefixStripped: formatted.isCanonicalPrefixStripped,
		title: formatted.title,
	});
}

export function renderAutorunPrTitle(result: AutorunPrTitleResult): string {
	if (result.type === "refused") {
		return `refused (${result.code}): ${result.message}\n`;
	}
	return [`${result.title}`, `source: ${result.source.type} (${result.source.label})`, ""].join(
		"\n",
	);
}

export const objectiveExecAutorunPrTitleNsCommand = objectiveNsCommand({
	name: "autorun-pr-title",
	summary: AUTORUN_PR_TITLE_DESCRIPTION,
	description: AUTORUN_PR_TITLE_DESCRIPTION,
	schema: autorunPrTitleRequestSchema,
	resultSchema: autorunPrTitleResultSchema,
	handler: runAutorunPrTitle,
	renderHuman: renderAutorunPrTitle,
	renderMarkdown: renderAutorunPrTitle,
});

export default objectiveExecAutorunPrTitleNsCommand;
