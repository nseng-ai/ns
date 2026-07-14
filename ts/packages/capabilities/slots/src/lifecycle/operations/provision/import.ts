import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { cell, renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../../../core/context.ts";
import { importProvisionedFiles, type ProvisionImportOutcome } from "../../provision.ts";
import {
	renderProvisionOperationDetails,
	summarizeProvisionOperationEntries,
	type ProvisionOperationActionPresentation,
} from "../provision-rendering.ts";

const provisionImportEntrySchema = z.object({
	path: z.string(),
	action: z.union([
		z.literal("created"),
		z.literal("replaced"),
		z.literal("unchanged"),
		z.literal("missing-in-worktree"),
		z.literal("skipped-not-a-file"),
		z.literal("error"),
	]),
	message: z.string().nullable(),
});

export const provisionImportRequestSchema = z.object({
	paths: z
		.array(z.string())
		.default([])
		.describe("Declared repo-relative paths to import; all declared paths when omitted."),
});

export const provisionImportResultSchema = z.object({
	entries: z.array(provisionImportEntrySchema),
	storeRoot: z.string(),
	sourceRoot: z.string(),
	createdCount: z.number().int(),
	replacedCount: z.number().int(),
	unchangedCount: z.number().int(),
	missingCount: z.number().int(),
	skippedCount: z.number().int(),
	errorCount: z.number().int(),
});

export type ProvisionImportRequest = z.infer<typeof provisionImportRequestSchema>;
export type ProvisionImportResult = z.infer<typeof provisionImportResultSchema>;

type ProvisionImportAction = ProvisionImportResult["entries"][number]["action"];

const IMPORT_ACTION_PRESENTATION_BY_ACTION = {
	created: { label: "Created", intent: "success" },
	replaced: { label: "Replaced", intent: "success" },
	unchanged: { label: "Unchanged", intent: "muted" },
	"missing-in-worktree": { label: "Missing in worktree", intent: "warn" },
	"skipped-not-a-file": { label: "Skipped: not a file", intent: "muted" },
	error: { label: "Error", intent: "error" },
} as const satisfies Record<ProvisionImportAction, ProvisionOperationActionPresentation>;

const IMPORT_COUNT_ACTION_BY_FIELD = {
	createdCount: "created",
	replacedCount: "replaced",
	unchangedCount: "unchanged",
	missingCount: "missing-in-worktree",
	skippedCount: "skipped-not-a-file",
	errorCount: "error",
} as const satisfies Record<
	Exclude<keyof ProvisionImportResult, "entries" | "storeRoot" | "sourceRoot">,
	ProvisionImportAction
>;

export async function runProvisionImport(ctx: SlotCliContext, request: ProvisionImportRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const imported = await importProvisionedFiles(repoCtx, request.paths);
	if (imported.type === "failure")
		return failure(imported.failure.errorType, imported.failure.message);
	const result = toImportResult(imported.outcome);
	if (result.errorCount > 0) {
		return negative("Provision import completed with errors.", {
			data: result,
			human: renderProvisionImport(result),
		});
	}
	return ok(result);
}

export function renderProvisionImport(
	result: ProvisionImportResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const resolvedCaps = resolveRenderCapabilities(caps);
	return renderResultBlock(resolvedCaps, {
		kind: result.errorCount > 0 ? "failure" : "success",
		headline: importHeadline(result),
		body: renderProvisionOperationDetails({
			caps: resolvedCaps,
			detailLines: [`Store: ${result.storeRoot}`, `Source: ${result.sourceRoot}`],
			entries: result.entries,
			columns: [
				{
					header: "FILE",
					width: "auto",
					renderCell: (entry) => cell(entry.path),
				},
			],
			actionPresentationByAction: IMPORT_ACTION_PRESENTATION_BY_ACTION,
			summaryFacts: [
				{ label: "created", count: result.createdCount, intent: "success" },
				{ label: "replaced", count: result.replacedCount, intent: "success" },
				{ label: "unchanged", count: result.unchangedCount, intent: "muted" },
				{ label: "missing", count: result.missingCount, intent: "warn" },
				{ label: "skipped", count: result.skippedCount, intent: "warn" },
				{ label: "errors", count: result.errorCount, intent: "error" },
			],
		}),
	});
}

function importHeadline(result: ProvisionImportResult): string {
	if (result.errorCount > 0) return "Provision import completed with errors.";
	if (result.entries.length === 0) return "No provisioned files declared.";
	const stored = result.createdCount + result.replacedCount;
	if (stored === 0) return "Provision store already up to date.";
	return `Imported ${stored} file(s) into the provision store.`;
}

function toImportResult(outcome: ProvisionImportOutcome): ProvisionImportResult {
	return {
		...summarizeProvisionOperationEntries(outcome.entries, IMPORT_COUNT_ACTION_BY_FIELD),
		storeRoot: outcome.storeRoot,
		sourceRoot: outcome.sourceRoot,
	};
}
