import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { HANDOFF_NAMESPACE } from "../identity.ts";
import { collectHandoffSummaries, handoffSummarySchema } from "../inventory.ts";
import { gatewayFailure, resolveBranch } from "./shared.ts";

export const listRequestSchema = z.object({
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	all: z.boolean().default(false).describe("List handoffs across every active branch."),
	include_deleted: z.boolean().default(false).describe("Include handoffs whose local branch no longer exists."),
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

	const entries = await ctx.brmem.listEntries({ namespace: HANDOFF_NAMESPACE, branch });
	if (entries.type === "error") return gatewayFailure(entries.error, "Failed to list handoffs");
	const handoffs = await collectHandoffSummaries({
		entries: entries.value,
		brmem: ctx.brmem,
		git: ctx.git,
		cwd: ctx.cwd,
		includeDeleted: request.include_deleted,
	});
	if (handoffs.type !== "resolved") return handoffs;
	return ok({
		scope: request.all ? "all-branches" : "branch",
		branch: branch ?? null,
		include_deleted: request.include_deleted,
		handoffs: [...handoffs.value],
	} satisfies ListResult);
}

export function renderList(result: ListResult): string {
	if (result.handoffs.length === 0) return emptyMessage(result);
	if (result.scope === "all-branches") {
		return [allBranchesTitle(result), "", "Branch | State | Handoff | Updated", ...result.handoffs.map((handoff) => `${handoff.branch} | ${handoff.branch_state} | ${handoff.slug} | ${handoff.updated_at}`)].join("\n");
	}
	return [`Handoffs on ${result.branch}`, "", "Handoff | Updated", ...result.handoffs.map((handoff) => `${handoff.slug} | ${handoff.updated_at}`)].join("\n");
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
		...result.handoffs.map((handoff) => `| ${markdownCell(handoff.slug)} | ${markdownCell(handoff.updated_at)} |`),
	].join("\n");
}

function allBranchesTitle(result: ListResult): string {
	return result.include_deleted ? "Handoffs across branches" : "Handoffs across active branches";
}

function emptyMessage(result: ListResult): string {
	if (result.scope === "all-branches") return result.include_deleted ? "No handoffs found across branches." : "No handoffs found across active branches.";
	return `No handoffs found on branch ${result.branch}.`;
}

function markdownCell(value: string): string {
	return value.replaceAll("|", "\\|");
}
