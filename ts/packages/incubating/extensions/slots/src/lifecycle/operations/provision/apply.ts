import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { cell, paint, renderResultBlock } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../../../core/context.ts";
import { applyProvisionedFiles, type ProvisionApplyOutcome } from "../../provision.ts";
import {
	renderProvisionOperationDetails,
	summarizeProvisionOperationEntries,
	type ProvisionOperationActionPresentation,
} from "../provision-rendering.ts";

const provisionApplyEntrySchema = z.object({
	slotName: z.string(),
	path: z.string(),
	action: z.union([
		z.literal("copied"),
		z.literal("up-to-date"),
		z.literal("differs"),
		z.literal("overwritten"),
		z.literal("missing-in-store"),
		z.literal("skipped-not-a-file"),
		z.literal("error"),
	]),
	message: z.string().nullable(),
});

export const provisionApplyRequestSchema = z.object({
	force: z
		.boolean()
		.default(false)
		.describe("Overwrite worktree copies that differ from the store (also resets file mode)."),
});

export const provisionApplyResultSchema = z.object({
	entries: z.array(provisionApplyEntrySchema),
	storeRoot: z.string(),
	copiedCount: z.number().int(),
	overwrittenCount: z.number().int(),
	upToDateCount: z.number().int(),
	differsCount: z.number().int(),
	missingInStoreCount: z.number().int(),
	skippedCount: z.number().int(),
	errorCount: z.number().int(),
});

export type ProvisionApplyRequest = z.infer<typeof provisionApplyRequestSchema>;
export type ProvisionApplyResult = z.infer<typeof provisionApplyResultSchema>;

type ProvisionApplyAction = ProvisionApplyResult["entries"][number]["action"];

const APPLY_ACTION_PRESENTATION_BY_ACTION = {
	copied: { label: "Copied", intent: "success" },
	"up-to-date": { label: "Up to date", intent: "muted" },
	differs: { label: "Differs", intent: "warn" },
	overwritten: { label: "Overwritten", intent: "success" },
	"missing-in-store": { label: "Missing in store", intent: "warn" },
	"skipped-not-a-file": { label: "Skipped: not a file", intent: "muted" },
	error: { label: "Error", intent: "error" },
} as const satisfies Record<ProvisionApplyAction, ProvisionOperationActionPresentation>;

const APPLY_COUNT_ACTION_BY_FIELD = {
	copiedCount: "copied",
	overwrittenCount: "overwritten",
	upToDateCount: "up-to-date",
	differsCount: "differs",
	missingInStoreCount: "missing-in-store",
	skippedCount: "skipped-not-a-file",
	errorCount: "error",
} as const satisfies Record<
	Exclude<keyof ProvisionApplyResult, "entries" | "storeRoot">,
	ProvisionApplyAction
>;

export async function runProvisionApply(ctx: SlotCliContext, request: ProvisionApplyRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const applied = await applyProvisionedFiles(repoCtx, { shouldForce: request.force });
	if (applied.type === "failure")
		return failure(applied.failure.errorType, applied.failure.message);
	const result = toApplyResult(applied.outcome);
	if (applyHasProblems(result)) {
		return negative("Provisioned file copies differ or failed; see entries.", result);
	}
	return ok(result);
}

export function renderProvisionApply(
	result: ProvisionApplyResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const resolvedCaps = resolveRenderCapabilities(caps);
	return renderResultBlock(resolvedCaps, {
		kind: applyResultKind(result),
		headline: applyHeadline(result),
		body: renderProvisionOperationDetails({
			caps: resolvedCaps,
			detailLines: [`Store: ${result.storeRoot}`],
			entries: result.entries,
			columns: [
				{
					header: "SLOT",
					width: "auto",
					renderCell: (entry, renderCaps) =>
						cell(paint(renderCaps, "accent", entry.slotName), entry.slotName),
				},
				{
					header: "FILE",
					width: "auto",
					renderCell: (entry) => cell(entry.path),
				},
			],
			actionPresentationByAction: APPLY_ACTION_PRESENTATION_BY_ACTION,
			summaryFacts: [
				{ label: "copied", count: result.copiedCount, intent: "success" },
				{ label: "overwritten", count: result.overwrittenCount, intent: "success" },
				{ label: "up-to-date", count: result.upToDateCount, intent: "muted" },
				{ label: "differs", count: result.differsCount, intent: "warn" },
				{ label: "missing", count: result.missingInStoreCount, intent: "warn" },
				{ label: "skipped", count: result.skippedCount, intent: "warn" },
				{ label: "errors", count: result.errorCount, intent: "error" },
			],
		}),
	});
}

function applyHasProblems(result: ProvisionApplyResult): boolean {
	return result.differsCount > 0 || result.errorCount > 0;
}

function applyResultKind(result: ProvisionApplyResult): "success" | "failure" {
	return applyHasProblems(result) ? "failure" : "success";
}

function applyHeadline(result: ProvisionApplyResult): string {
	if (result.errorCount > 0) return "Provision apply completed with errors.";
	if (result.differsCount > 0)
		return `${result.differsCount} provisioned file(s) differ from the store; pass --force to overwrite.`;
	if (result.entries.length === 0) return "No provisioned files declared.";
	const changed = result.copiedCount + result.overwrittenCount;
	if (changed === 0) return "Provisioned files are up to date.";
	return `Provisioned ${changed} file(s).`;
}

function toApplyResult(outcome: ProvisionApplyOutcome): ProvisionApplyResult {
	return {
		...summarizeProvisionOperationEntries(outcome.entries, APPLY_COUNT_ACTION_BY_FIELD),
		storeRoot: outcome.storeRoot,
	};
}
