import { failure, ok, resolveRenderCapabilities, type RenderCapabilities } from "@sdl/clinkr";
import { cell, paint, renderTable } from "@sdl/cli-theme";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { buildSlotInventory, poolSize, slotStatus } from "../inventory.ts";

export const listRequestSchema = z.object({});

export const slotRowSchema = z.object({
	slot_name: z.string(),
	branch: z.string().nullable(),
	operation: z.string().nullable(),
	worktree_path: z.string(),
	status: z.union([z.literal("assigned"), z.literal("available")]),
});

export const listResultSchema = z.object({
	pool_size: z.number().int().nonnegative(),
	rows: z.array(slotRowSchema),
	repo_name: z.string(),
});

export type ListRequest = z.infer<typeof listRequestSchema>;
export type ListResult = z.infer<typeof listResultSchema>;

export async function runList(ctx: SlotCliContext, _request: ListRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	return ok({
		pool_size: poolSize(inventory),
		repo_name: ctx.repo.repoName,
		rows: inventory.records.map((record) => ({
			slot_name: record.slotName,
			branch: record.branch,
			operation: record.operation,
			worktree_path: record.path,
			status: slotStatus(record),
		})),
	});
}

export function renderList(
	result: ListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.rows.length === 0) return `No slots initialized for ${result.repo_name}.`;
	const resolvedCaps = resolveRenderCapabilities(caps);
	const table = renderTable({
		caps: resolvedCaps,
		columns: [
			{ header: "SLOT", width: "auto" },
			{ header: "STATUS", width: "auto" },
			{ header: "BRANCH", width: "auto" },
			{ header: "OPERATION", width: "auto" },
			{ header: "WORKTREE", width: "fill", min: "WORKTREE".length },
		],
		rows: result.rows.map((row) => [
			cell(paint(resolvedCaps, "accent", row.slot_name), row.slot_name),
			statusCell(resolvedCaps, row.status),
			cell(row.branch ?? "—"),
			cell(row.operation === null ? "—" : `${row.operation} in progress`),
			cell(row.worktree_path),
		]),
	});
	return stripAnsiWhenDisabled([`Slots for ${result.repo_name}`, "", ...table].join("\n"), caps);
}

function statusCell(
	caps: ReturnType<typeof resolveRenderCapabilities>,
	status: ListResult["rows"][number]["status"],
) {
	const intent = status === "assigned" ? "success" : "muted";
	return cell(paint(caps, intent, status), status);
}

function stripAnsiWhenDisabled(output: string, caps: RenderCapabilities): string {
	return caps.canEmitAnsi ? output : stripTerminalEscapes(output);
}
