import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../../context.ts";
import type { StackFork, StackInfo } from "../../../gateways/gt.ts";
import { resolveRepoAndCurrentBranch } from "../shared.ts";
import { collectStackBranches, collectStackEdges } from "../stack-walk.ts";
import {
	renderChildrenCorruption,
	renderTrunkMarkerWarnings,
	renderWalkTerminationWarning,
} from "./metadata-warnings.ts";

const edgeSchema = z.object({ parent: z.string(), child: z.string() });

export const gtStackBranchesRequestSchema = z.object({
	downstack: z
		.boolean()
		.default(false)
		.describe("List only ancestor/downstack branches plus current."),
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
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;
	const stackResult = await ctx.gt.stack(resolved.repoCtx.repo.root);
	if (stackResult.type === "untracked_branch")
		return failure("untracked_branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure")
		return failure("gt_stack_read_failed", stackResult.failure.message);
	const integrity = validateStackIntegrity(stackResult.stack, { downstack: request.downstack });
	if (integrity.type === "failure") return failure(integrity.errorType, integrity.message);
	if (ctx.shouldWriteCdDirective) {
		for (const warning of integrity.warnings) ctx.stderr(`${warning}\n`);
	}
	if (stackResult.stack.current === stackResult.stack.trunk)
		return negative(
			`On trunk '${stackResult.stack.trunk}'; no stack is checked out.`,
			resultForStack(stackResult.stack, {
				downstack: request.downstack,
				branches: [],
				warnings: [],
			}),
		);
	const branches = collectStackBranches(stackResult.stack, {
		current: stackResult.stack.current,
		trunk: stackResult.stack.trunk,
		downstackOnly: request.downstack,
		includeCurrent: true,
	});
	return ok(
		resultForStack(stackResult.stack, {
			downstack: request.downstack,
			branches,
			warnings: integrity.warnings,
		}),
	);
}

export function renderStackBranches(result: GtStackBranchesResult): string {
	// Hidden exec command: compact JSON is the intentional human renderer for skill/agent callers.
	return JSON.stringify({ branches: result.branches });
}

function resultForStack(
	stack: StackInfo,
	options: { downstack: boolean; branches: readonly string[]; warnings: readonly string[] },
): GtStackBranchesResult {
	return {
		branches: [...options.branches],
		trunk: stack.trunk,
		current: stack.current,
		scope: options.downstack ? "downstack" : "full",
		edges: [
			...collectStackEdges(stack, { current: stack.current, downstackOnly: options.downstack }),
		],
		warnings: [...options.warnings],
	};
}

function validateStackIntegrity(
	stack: StackInfo,
	options: { downstack: boolean },
):
	| { type: "ok"; warnings: readonly string[] }
	| { type: "failure"; errorType: string; message: string } {
	const markerWarnings = renderTrunkMarkerWarnings(stack.trunkMarker);
	if (markerWarnings.length > 0)
		return {
			type: "failure",
			errorType: "stack_metadata_inconsistent",
			message: markerWarnings.join("; "),
		};
	if (stack.current === stack.trunk) return { type: "ok", warnings: [] };
	const ancestorProblem = renderWalkTerminationWarning({
		kind: "ancestor",
		termination: stack.ancestorTermination,
		label: "walk",
	});
	if (options.downstack) {
		if (ancestorProblem !== null)
			return {
				type: "failure",
				errorType: "stack_metadata_inconsistent",
				message: ancestorProblem,
			};
		const warnings = stack.descendantWalk.forks.map(renderStackFork);
		const descendantProblem = renderWalkTerminationWarning({
			kind: "descendant",
			termination: stack.descendantWalk.termination,
			label: "walk",
		});
		if (descendantProblem !== null) warnings.push(descendantProblem);
		return { type: "ok", warnings };
	}
	const fork = stack.descendantWalk.forks[0];
	if (fork !== undefined)
		return { type: "failure", errorType: "forked_stack", message: forkedStackMessage(fork) };
	const messages = stack.descendantWalk.childrenCorruptions.map(renderChildrenCorruption);
	if (ancestorProblem !== null) messages.push(ancestorProblem);
	const descendantProblem = renderWalkTerminationWarning({
		kind: "descendant",
		termination: stack.descendantWalk.termination,
		label: "walk",
	});
	if (descendantProblem !== null) messages.push(descendantProblem);
	if (messages.length > 0)
		return {
			type: "failure",
			errorType: "stack_metadata_inconsistent",
			message: messages.join("; "),
		};
	return { type: "ok", warnings: [] };
}

function forkedStackMessage(fork: StackFork): string {
	return `Graphite stack forks at '${fork.branch}' with children: ${fork.children.join(", ")}. Check out the intended tip and rerun, or pass \`--downstack\`.`;
}

function renderStackFork(fork: StackFork): string {
	return `branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only`;
}
