import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../../context.ts";
import type { ChildrenCorruption, StackFork, StackInfo, TrunkMarkerStatus, WalkTermination } from "../../../gateways/gt.ts";
import { collectStackBranches, collectStackEdges } from "../stack-walk.ts";

const edgeSchema = z.object({ parent: z.string(), child: z.string() });

export const gtStackBranchesRequestSchema = z.object({
	downstack: z.boolean().default(false).describe("List only ancestor/downstack branches plus current."),
});

export const gtStackBranchesResultSchema = z.object({
	branches: z.array(z.string()),
	trunk: z.string(),
	current: z.string(),
	scope: z.union([z.literal("full"), z.literal("downstack")]),
	edges: z.array(edgeSchema),
	warnings: z.array(z.string()),
});

export type GtStackBranchesRequest = z.infer<typeof gtStackBranchesRequestSchema>;
export type GtStackBranchesResult = z.infer<typeof gtStackBranchesResultSchema>;

export async function runGtStackBranches(ctx: SlotCliContext, request: GtStackBranchesRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	if (ctx.gt === undefined) return failure("gt_gateway_missing", "Graphite gateway is not available for slot gt commands.");
	const currentResult = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (currentResult.type === "failure") return failure("git_current_branch_failed", currentResult.failure.message);
	if (currentResult.type === "detached") return failure("detached_head", `HEAD at ${ctx.repo.root} is detached. Check out a branch first.`);
	const stackResult = await ctx.gt.stack(ctx.repo.root);
	if (stackResult.type === "untracked_branch") return failure("untracked_branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure") return failure("gt_stack_read_failed", stackResult.failure.message);
	const integrity = validateStackIntegrity(stackResult.stack, { downstack: request.downstack });
	if (integrity.type === "failure") return failure(integrity.errorType, integrity.message);
	if (ctx.shouldWriteCdDirective) {
		for (const warning of integrity.warnings) ctx.stderr(`${warning}\n`);
	}
	if (stackResult.stack.current === stackResult.stack.trunk) return negative(`On trunk '${stackResult.stack.trunk}'; no stack is checked out.`, resultForStack(stackResult.stack, { downstack: request.downstack, branches: [], warnings: [] }));
	const branches = collectStackBranches(stackResult.stack, { current: stackResult.stack.current, trunk: stackResult.stack.trunk, downstackOnly: request.downstack, includeCurrent: true });
	return ok(resultForStack(stackResult.stack, { downstack: request.downstack, branches, warnings: integrity.warnings }));
}

export function renderStackBranches(result: GtStackBranchesResult): string {
	return JSON.stringify({ branches: result.branches });
}

function resultForStack(stack: StackInfo, options: { downstack: boolean; branches: readonly string[]; warnings: readonly string[] }): GtStackBranchesResult {
	return {
		branches: [...options.branches],
		trunk: stack.trunk,
		current: stack.current,
		scope: options.downstack ? "downstack" : "full",
		edges: [...collectStackEdges(stack, { current: stack.current, downstackOnly: options.downstack })],
		warnings: [...options.warnings],
	};
}

function validateStackIntegrity(stack: StackInfo, options: { downstack: boolean }): { type: "ok"; warnings: readonly string[] } | { type: "failure"; errorType: string; message: string } {
	const markerWarnings = renderTrunkMarkerProblem(stack.trunkMarker);
	if (markerWarnings.length > 0) return { type: "failure", errorType: "stack_metadata_inconsistent", message: markerWarnings.join("; ") };
	if (stack.current === stack.trunk) return { type: "ok", warnings: [] };
	const ancestorProblem = renderTermination("ancestor", stack.ancestorTermination);
	if (options.downstack) {
		if (ancestorProblem !== null) return { type: "failure", errorType: "stack_metadata_inconsistent", message: ancestorProblem };
		const warnings = [...stack.descendantWalk.forks.map(renderStackFork)];
		const descendantProblem = renderTermination("descendant", stack.descendantWalk.termination);
		if (descendantProblem !== null) warnings.push(descendantProblem);
		return { type: "ok", warnings };
	}
	const fork = stack.descendantWalk.forks[0];
	if (fork !== undefined) return { type: "failure", errorType: "forked_stack", message: forkedStackMessage(fork) };
	const messages = [...stack.descendantWalk.childrenCorruptions.map(renderChildrenCorruption)];
	if (ancestorProblem !== null) messages.push(ancestorProblem);
	const descendantProblem = renderTermination("descendant", stack.descendantWalk.termination);
	if (descendantProblem !== null) messages.push(descendantProblem);
	if (messages.length > 0) return { type: "failure", errorType: "stack_metadata_inconsistent", message: messages.join("; ") };
	return { type: "ok", warnings: [] };
}

function forkedStackMessage(fork: StackFork): string {
	return `Graphite stack forks at '${fork.branch}' with children: ${fork.children.join(", ")}. Check out the intended tip and rerun, or pass \`--downstack\`.`;
}

function renderStackFork(fork: StackFork): string {
	return `branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only`;
}

function renderTermination(kind: "ancestor" | "descendant", termination: WalkTermination): string | null {
	if (termination.type === "completed") return null;
	if (termination.type === "cycle") return `cycle detected in Graphite ${kind === "ancestor" ? "parent" : "children"} metadata at ${termination.branch}; ${kind} walk stopped`;
	return `${kind === "ancestor" ? "parent" : "child"} branch ${termination.branch} is missing from Graphite metadata; ${kind} walk stopped`;
}

function renderChildrenCorruption(corruption: ChildrenCorruption): string {
	switch (corruption.kind) {
		case "not_text": return `children metadata for ${corruption.branch} is not JSON text; treating as no children`;
		case "invalid_json": return `children metadata for ${corruption.branch} is not valid JSON; treating as no children`;
		case "not_list": return `children metadata for ${corruption.branch} is not a JSON list; treating as no children`;
		case "non_string": return `children metadata for ${corruption.branch} contains non-string entries`;
	}
}

function renderTrunkMarkerProblem(marker: TrunkMarkerStatus): readonly string[] {
	if (marker.type === "clean") return [];
	if (marker.terminusState === "row_missing") return ["trunk row marker missing"];
	const warnings: string[] = [];
	if (marker.terminusState === "unmarked") warnings.push("trunk row marker missing");
	if (marker.markedTrunks.length > 1) warnings.push("multiple Graphite metadata rows are marked as trunk");
	if (marker.markedTrunks.length > 0 && !marker.markedTrunks.includes(marker.terminus)) warnings.push(`Graphite metadata trunk marker differs from ancestor-walk terminus: ${marker.markedTrunks[0]} != ${marker.terminus}`);
	return warnings;
}
