import { failure, ok, resolveRenderCapabilities, type RenderCapabilities } from "@sdl/clinkr";
import { cell, paint, renderBufferedReport, renderTable } from "@sdl/cli-theme";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { listHandoffSummaries } from "../artifact-storage.ts";
import { handoffSummarySchema } from "../inventory.ts";
import { resolveBranch } from "./shared.ts";

export const listRequestSchema = z.object({
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	all: z.boolean().default(false).describe("List handoffs across every active branch."),
	includeDeleted: z
		.boolean()
		.default(false)
		.describe("Include handoffs whose local branch no longer exists."),
});

export const listResultSchema = z.object({
	scope: z.enum(["branch", "all-branches"]),
	branch: z.string().nullable(),
	includeDeleted: z.boolean(),
	handoffs: z.array(handoffSummarySchema),
});

export type ListRequest = z.infer<typeof listRequestSchema>;
export type ListResult = z.infer<typeof listResultSchema>;

export async function runList(ctx: HandoffCliContext, request: ListRequest) {
	if (request.branch !== undefined && request.all) {
		return failure("branch-and-all-conflict", "--branch and --all are mutually exclusive.");
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
		{ branch, shouldIncludeDeleted: request.includeDeleted },
	);
	if (handoffs.type === "error") return failure(handoffs.error.code, handoffs.error.message);
	return ok({
		scope: request.all ? "all-branches" : "branch",
		branch: branch ?? null,
		includeDeleted: request.includeDeleted,
		handoffs: [...handoffs.value],
	} satisfies ListResult);
}

export function renderList(
	result: ListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.handoffs.length === 0) return emptyMessage(result);
	const resolvedCaps = resolveRenderCapabilities(caps);
	if (result.scope === "all-branches") {
		const table = renderTable({
			caps: resolvedCaps,
			columns: [
				{ header: "BRANCH", width: "auto" },
				{ header: "STATE", width: "auto" },
				{ header: "HANDOFF", width: "auto" },
				{ header: "UPDATED", width: "auto" },
			],
			rows: result.handoffs.map((handoff) => [
				cell(handoff.branch),
				cell(handoff.branchState),
				cell(paint(resolvedCaps, "accent", handoff.slug), handoff.slug),
				cell(handoff.updatedAt),
			]),
		});
		return renderBufferedReport({
			caps,
			title: allBranchesTitle(result),
			titleStyle: "plain",
			sections: [{ title: "", lines: table }],
		});
	}
	const table = renderTable({
		caps: resolvedCaps,
		columns: [
			{ header: "HANDOFF", width: "auto" },
			{ header: "UPDATED", width: "auto" },
		],
		rows: result.handoffs.map((handoff) => [
			cell(paint(resolvedCaps, "accent", handoff.slug), handoff.slug),
			cell(handoff.updatedAt),
		]),
	});
	return renderBufferedReport({
		caps,
		title: `Handoffs on ${result.branch}`,
		titleStyle: "plain",
		sections: [{ title: "", lines: table }],
	});
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
					`| ${markdownCell(handoff.branch)} | ${markdownCell(handoff.branchState)} | ${markdownCell(handoff.slug)} | ${markdownCell(handoff.updatedAt)} |`,
			),
		].join("\n");
	}
	return [
		`Handoffs on ${result.branch}`,
		"",
		"| handoff | updated |",
		"| --- | --- |",
		...result.handoffs.map(
			(handoff) => `| ${markdownCell(handoff.slug)} | ${markdownCell(handoff.updatedAt)} |`,
		),
	].join("\n");
}

function allBranchesTitle(result: ListResult): string {
	return result.includeDeleted ? "Handoffs across branches" : "Handoffs across active branches";
}

function emptyMessage(result: ListResult): string {
	if (result.scope === "all-branches")
		return result.includeDeleted
			? "No handoffs found across branches."
			: "No handoffs found across active branches.";
	return `No handoffs found on branch ${result.branch}.`;
}

function markdownCell(value: string): string {
	return value.replaceAll("|", "\\|");
}
