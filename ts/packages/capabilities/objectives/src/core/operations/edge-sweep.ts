import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type ClinkrExit,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { cell, kv, renderTable } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import {
	activeRootRelativePath,
	archiveRootRelativePath,
	type ObjectiveStorage,
} from "../storage.ts";
import { objectiveCheckItemSchema } from "./check-items.ts";
import { removeOneTrailingNewline } from "./format.ts";
import { sweepObjectiveEdgeLint } from "./edge-lint.ts";

const objectiveEdgeSweepBaseResultSchema = z.object({
	error: z.string().nullable(),
	rootPath: z.string(),
	archiveRootPath: z.string(),
	hasRoot: z.boolean(),
	recordCount: z.number().int(),
	violations: z.array(objectiveCheckItemSchema),
	errorCount: z.number().int(),
});

export const objectiveEdgeSweepOkResultSchema = objectiveEdgeSweepBaseResultSchema.extend({
	status: z.literal("sweep-ok"),
	error: z.null(),
});

export const objectiveEdgeSweepFailedResultSchema = objectiveEdgeSweepBaseResultSchema.extend({
	status: z.literal("sweep-failed"),
	error: z.literal("sweep-failed"),
});

export const objectiveEdgeSweepResultSchema = z.discriminatedUnion("status", [
	objectiveEdgeSweepOkResultSchema,
	objectiveEdgeSweepFailedResultSchema,
]);

export type ObjectiveEdgeSweepResult = z.infer<typeof objectiveEdgeSweepResultSchema>;

export async function runEdgeSweep(
	storage: ObjectiveStorage,
): Promise<ClinkrExit<ObjectiveEdgeSweepResult>> {
	const rootPresence = await storage.activeRootExists();
	if (!rootPresence.ok) return failure(rootPresence.error.code, rootPresence.error.message);
	const sweep = await sweepObjectiveEdgeLint(storage);
	if (!sweep.ok) return failure(sweep.error.code, sweep.error.message);
	const base = {
		rootPath: activeRootRelativePath(),
		archiveRootPath: archiveRootRelativePath(),
		hasRoot: rootPresence.value,
		recordCount: sweep.value.recordCount,
		violations: [...sweep.value.violations],
		errorCount: sweep.value.violations.length,
	};
	if (base.errorCount > 0) {
		const data = { ...base, status: "sweep-failed" as const, error: "sweep-failed" as const };
		return negative(
			`Objective edge sweep failed: ${base.errorCount} violation(s) across ${base.recordCount} record(s).`,
			{
				data,
				human: renderEdgeSweep(data, { canEmitAnsi: true }),
			},
		);
	}
	return ok({ ...base, status: "sweep-ok", error: null });
}

export function renderEdgeSweep(
	result: ObjectiveEdgeSweepResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const renderCaps = resolveRenderCapabilities(caps);
	const lines = [
		"Objective edge sweep",
		"",
		kv(renderCaps, "Root", `${result.rootPath} (${result.hasRoot ? "present" : "missing"})`),
		kv(renderCaps, "Archive", result.archiveRootPath),
		kv(renderCaps, "Records", String(result.recordCount)),
		kv(renderCaps, "Result", `${result.status} (${result.errorCount} violation(s))`),
	];
	if (result.violations.length > 0) {
		lines.push(
			"",
			...renderTable({
				caps: renderCaps,
				columns: [
					{ header: "PATH", width: "auto" },
					{ header: "CHECK", width: "auto" },
					{ header: "DETAIL", width: "fill", min: "DETAIL".length },
				],
				rows: result.violations.map((item) => [
					cell(item.path),
					cell(item.label),
					cell(item.detail),
				]),
			}),
		);
	}
	return removeOneTrailingNewline(lines.join("\n"));
}
