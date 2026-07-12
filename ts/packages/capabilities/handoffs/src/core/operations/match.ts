import { failure, ok } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { listHandoffSummaries } from "../artifact-storage.ts";
import { handoffSummarySchema } from "../inventory.ts";
import { resolveHandoffSelection, splitHandoffSelectorTerms } from "../selection.ts";
import { resolveBranch } from "./shared.ts";

export const matchRequestSchema = z.object({
	selector: z
		.array(z.string())
		.default([])
		.describe(
			"Handoff selector: an exact key, a slug, or free-text search terms. Empty selects the only handoff in scope.",
		),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	all: z.boolean().default(false).describe("Match across every active branch."),
	includeDeleted: z
		.boolean()
		.default(false)
		.describe("Include handoffs whose local branch no longer exists."),
});

export const matchResultSchema = z.object({
	scope: z.enum(["branch", "all-branches"]),
	branch: z.string().nullable(),
	includeDeleted: z.boolean(),
	selector: z.array(z.string()),
	terms: z.array(z.string()),
	resolution: z.enum(["unique", "ambiguous", "none"]),
	matchedBy: z.enum(["exact-key", "normalized-slug", "only-handoff", "terms"]).nullable(),
	selected: handoffSummarySchema.nullable(),
	candidates: z.array(handoffSummarySchema),
});

export type MatchRequest = z.infer<typeof matchRequestSchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;

export async function runMatch(ctx: HandoffCliContext, request: MatchRequest) {
	if (request.branch !== undefined && request.all) {
		return failure("branch-and-all-conflict", "--branch and --all are mutually exclusive.");
	}
	let branch: string | undefined;
	if (!request.all) {
		const resolved = await resolveBranch(ctx, request.branch, {
			detachedMessage: "Cannot match handoffs in detached HEAD; pass --branch <branch> or --all.",
		});
		if (resolved.type !== "resolved") return resolved;
		branch = resolved.value;
	}

	const handoffs = await listHandoffSummaries(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{
			...optionalEntry("branch", branch),
			shouldIncludeDeleted: request.includeDeleted,
		},
	);
	if (handoffs.type === "error") return failure(handoffs.error.code, handoffs.error.message);

	const selection = resolveHandoffSelection(
		request.selector,
		handoffs.value,
		(summary) => summary.key,
	);

	return ok({
		scope: request.all ? "all-branches" : "branch",
		branch: branch ?? null,
		includeDeleted: request.includeDeleted,
		selector: [...request.selector],
		terms: splitHandoffSelectorTerms(request.selector),
		resolution: selection.resolution,
		matchedBy: selection.resolution === "unique" ? selection.matchedBy : null,
		selected: selection.resolution === "unique" ? selection.selected : null,
		candidates: [...selection.candidates],
	} satisfies MatchResult);
}

export function renderMatch(result: MatchResult): string {
	const scope =
		result.scope === "all-branches" ? "across active branches" : `on branch \`${result.branch}\``;
	const selectorText =
		result.selector.length === 0 ? "(empty selector)" : result.selector.join(" ");

	if (result.resolution === "unique" && result.selected !== null) {
		return [
			`Matched handoff \`${result.selected.slug}\` on branch \`${result.selected.branch}\` (${result.matchedBy}).`,
			`Pick up: ns handoff pickup ${result.selected.slug} --branch ${result.selected.branch}`,
		].join("\n");
	}

	if (result.resolution === "ambiguous") {
		return [
			`${result.candidates.length} handoffs match ${selectorText} ${scope}; choose one:`,
			...result.candidates.map(
				(candidate) => `- ${candidate.slug} (branch ${candidate.branch}, ${candidate.branchState})`,
			),
		].join("\n");
	}

	return `No handoff matched ${selectorText} ${scope}.`;
}
