import { failure, ok, type ClinkrExit } from "@ji/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { activeRecordRelativePath, activeRootRelativePath } from "../storage.ts";
import { removeOneTrailingNewline } from "./format.ts";
import { matchesStatusFilter } from "./list-objectives.ts";

export const loadOrientationsRequestSchema = z.object({});

export const objectiveOrientationRecordSchema = z.object({
	slug: z.string(),
	path: z.string(),
	content: z.string(),
});

export const loadOrientationsResultSchema = z.object({
	rootPath: z.string(),
	records: z.array(objectiveOrientationRecordSchema),
	recordCount: z.number().int(),
});

export type LoadOrientationsRequest = z.infer<typeof loadOrientationsRequestSchema>;
export type ObjectiveOrientationRecord = z.infer<typeof objectiveOrientationRecordSchema>;
export type LoadOrientationsResult = z.infer<typeof loadOrientationsResultSchema>;

export async function runLoadOrientations(
	ctx: ObjectiveCliContext,
	request: LoadOrientationsRequest,
): Promise<ClinkrExit<LoadOrientationsResult>> {
	void request;
	const inventory = await ctx.storage.checkoutInventory();
	if (!inventory.ok) return failure(inventory.error.code, inventory.error.message);

	const records: ObjectiveOrientationRecord[] = [];
	for (const record of inventory.value.records) {
		if (!matchesStatusFilter(record.status, "active")) continue;

		const path = `${activeRecordRelativePath(record.slug)}/orientation.md`;
		const kind = await ctx.storage.pathKind(path);
		if (!kind.ok) return failure(kind.error.code, kind.error.message);
		if (kind.value !== "file") continue;

		const read = await ctx.storage.readMarkdownFile(path);
		if (read.type === "missing") continue;
		if (read.type === "unreadable") {
			return failure("orientation-unreadable", `Unable to read ${path}: ${read.message}`);
		}
		records.push({ slug: record.slug, path, content: read.content });
	}

	return ok({ rootPath: activeRootRelativePath(), records, recordCount: records.length });
}

export function renderLoadOrientationsMarkdown(result: LoadOrientationsResult): string {
	return removeOneTrailingNewline(
		result.records
			.map((record) => `### ${record.path}\n${normalizeOneTrailingNewline(record.content)}`)
			.join("\n"),
	);
}

function normalizeOneTrailingNewline(content: string): string {
	return `${content.replace(/\n*$/u, "")}\n`;
}
