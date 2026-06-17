import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../../context.ts";
import { getSlotGtGateway } from "../../../gateways/gt.ts";
import { collectStackBranches, collectStackEdges } from "../../../gt/stack-walk.ts";
import { renderAncestorTermination, renderChildrenCorruption, renderDescendantTermination, renderStackFork, renderTrunkMarkerProblem, type StackInfo } from "../../../gt/types.ts";

export const stackBranchesRequestSchema = z.object({ downstack: z.boolean().default(false) });
export const stackBranchEdgeSchema = z.object({ parent: z.string(), child: z.string() });
export const stackBranchesResultSchema = z.object({
	branches: z.array(z.string()),
	trunk: z.string(),
	current: z.string(),
	scope: z.union([z.literal("full"), z.literal("downstack")]),
	edges: z.array(stackBranchEdgeSchema),
	warnings: z.array(z.string()),
});

export type StackBranchesRequest = z.infer<typeof stackBranchesRequestSchema>;
export type StackBranchesResult = z.infer<typeof stackBranchesResultSchema>;

export async function runStackBranches(ctx: SlotCliContext, request: StackBranchesRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const current = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (current.type === "failure") return failure("git_current_branch_failed", current.failure.message);
	if (current.type === "detached") return failure("detached_head", `HEAD at ${ctx.repo.root} is detached. Check out a branch first.`);
	const stackResult = await getSlotGtGateway(ctx).stack(ctx.repo.root);
	if (stackResult.type === "untracked_branch") return failure("untracked_branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure") return failure("gt_stack_read_failed", stackResult.failure.message);
	const stack = stackResult.stack;
	const warnings = validateStackIntegrity(stack, request.downstack);
	if (warnings.type === "failure") return failure(warnings.errorType, warnings.message);
	const empty = resultForStack(stack, request.downstack, [], []);
	if (stack.current === stack.trunk) return negative(`On trunk '${stack.trunk}'; no stack is checked out.`, empty);
	const branches = collectStackBranches(stack, { current: stack.current, trunk: stack.trunk, downstackOnly: request.downstack, includeCurrent: true });
	return ok(resultForStack(stack, request.downstack, branches, warnings.warnings));
}

export function renderStackBranches(result: StackBranchesResult): string {
	for (const warning of result.warnings) console.error(warning);
	return JSON.stringify({ branches: result.branches });
}

function resultForStack(stack: StackInfo, downstack: boolean, branches: readonly string[], warnings: readonly string[]): StackBranchesResult {
	return { branches: [...branches], trunk: stack.trunk, current: stack.current, scope: downstack ? "downstack" : "full", edges: [...collectStackEdges(stack, { current: stack.current, downstackOnly: downstack })], warnings: [...warnings] };
}

function validateStackIntegrity(stack: StackInfo, downstack: boolean): { type: "ok"; warnings: readonly string[] } | { type: "failure"; errorType: string; message: string } {
	if (stack.trunk_marker.type === "problem") return { type: "failure", errorType: "stack_metadata_inconsistent", message: renderTrunkMarkerProblem(stack.trunk_marker).join("; ") };
	if (stack.current === stack.trunk) return { type: "ok", warnings: [] };
	const ancestor = stack.ancestor_termination;
	const descendant = stack.descendant_walk.termination;
	if (downstack) {
		if (ancestor.type === "cycle" || ancestor.type === "row_missing") return { type: "failure", errorType: "stack_metadata_inconsistent", message: renderAncestorTermination(ancestor) };
		const warnings = stack.descendant_walk.forks.map(renderStackFork);
		if (descendant.type === "cycle" || descendant.type === "row_missing") warnings.push(renderDescendantTermination(descendant));
		return { type: "ok", warnings };
	}
	const fork = stack.descendant_walk.forks[0];
	if (fork !== undefined) return { type: "failure", errorType: "forked_stack", message: `Graphite stack forks at '${fork.branch}' with children: ${fork.children.join(", ")}. Check out the intended tip and rerun, or pass \`--downstack\`.` };
	const messages = stack.descendant_walk.children_corruptions.map(renderChildrenCorruption);
	if (ancestor.type === "cycle" || ancestor.type === "row_missing") messages.push(renderAncestorTermination(ancestor));
	if (descendant.type === "cycle" || descendant.type === "row_missing") messages.push(renderDescendantTermination(descendant));
	return messages.length > 0 ? { type: "failure", errorType: "stack_metadata_inconsistent", message: messages.join("; ") } : { type: "ok", warnings: [] };
}
