import { failure, ok, type RenderCapabilities } from "@asdl/clinkr";
import { renderTextTable } from "@asdl/core/text-table";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { listHandoffSummaries } from "../artifact-storage.ts";
import { handoffSummarySchema } from "../inventory.ts";
import { resolveBranch } from "./shared.ts";

export const listRequestSchema = z.object({
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	all: z.boolean().default(false).describe("List handoffs across every active branch."),
	include_deleted: z
		.boolean()
		.default(false)
		.describe("Include handoffs whose local branch no longer exists."),
});

export const listResultSchema = z.object({
	scope: z.enum(["branch", "all-branches"]),
	branch: z.string().nullable(),
	include_deleted: z.boolean(),
	handoffs: z.array(handoffSummarySchema),
});

export type ListRequest = z.infer<typeof listRequestSchema>;
export type ListResult = z.infer<typeof listResultSchema>;

export async function runList(ctx: HandoffCliContext, request: ListRequest) {
	if (request.branch !== undefined && request.all) {
		return failure("branch_and_all_conflict", "--branch and --all are mutually exclusive.");
	}
	let branch: string | undefined;
	if (!request.all) {
		const resolved = await resolveBranch(ctx, request.branch, {
			detachedMessage: "Cannot list handoffs in detached HEAD; pass --branch <branch> or --all.",
		});
		if (resolved.type !== "resolved") return resolved;
		branch = resolved.value;
	}

	const handoffs = await listHandoffSummaries(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch, shouldIncludeDeleted: request.include_deleted },
	);
	if (handoffs.type === "error") return failure(handoffs.error.code, handoffs.error.message);
	return ok({
		scope: request.all ? "all-branches" : "branch",
		branch: branch ?? null,
		include_deleted: request.include_deleted,
		handoffs: [...handoffs.value],
	} satisfies ListResult);
}

export function renderList(
	result: ListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.handoffs.length === 0) return emptyMessage(result);
	if (result.scope === "all-branches") {
		const table = renderTextTable({
			columns: [
				{ header: "BRANCH", style: "bold-cyan" },
				{ header: "STATE" },
				{ header: "HANDOFF" },
				{ header: "UPDATED", style: "dim" },
			],
			rows: result.handoffs.map((handoff) => [
				handoff.branch,
				handoff.branch_state,
				handoff.slug,
				handoff.updated_at,
			]),
			canEmitAnsi: caps.canEmitAnsi,
			shouldDrawRule: true,
			headerStyle: "bold-cyan",
		});
		return [allBranchesTitle(result), "", table].join("\n");
	}
	const table = renderTextTable({
		columns: [
			{ header: "HANDOFF", style: "bold-cyan" },
			{ header: "UPDATED", style: "dim" },
		],
		rows: result.handoffs.map((handoff) => [handoff.slug, handoff.updated_at]),
		canEmitAnsi: caps.canEmitAnsi,
		shouldDrawRule: true,
		headerStyle: "bold-cyan",
	});
	return [`Handoffs on ${result.branch}`, "", table].join("\n");
}

export function renderListMarkdown(result: ListResult): string {
	if (result.handoffs.length === 0) return emptyMessage(result);
	if (result.scope === "all-branches") {
		return [
			allBranchesTitle(result),
			"",
			"| branch | state | handoff | updated |",
			"| --- | --- | --- | --- |",
			...result.handoffs.map(
				(handoff) =>
					`| ${markdownCell(handoff.branch)} | ${markdownCell(handoff.branch_state)} | ${markdownCell(handoff.slug)} | ${markdownCell(handoff.updated_at)} |`,
			),
		].join("\n");
	}
	return [
		`Handoffs on ${result.branch}`,
		"",
		"| handoff | updated |",
		"| --- | --- |",
		...result.handoffs.map(
			(handoff) => `| ${markdownCell(handoff.slug)} | ${markdownCell(handoff.updated_at)} |`,
		),
	].join("\n");
}

function allBranchesTitle(result: ListResult): string {
	return result.include_deleted ? "Handoffs across branches" : "Handoffs across active branches";
}

function emptyMessage(result: ListResult): string {
	if (result.scope === "all-branches")
		return result.include_deleted
			? "No handoffs found across branches."
			: "No handoffs found across active branches.";
	return `No handoffs found on branch ${result.branch}.`;
}

function markdownCell(value: string): string {
	return value.replaceAll("|", "\\|");
}
