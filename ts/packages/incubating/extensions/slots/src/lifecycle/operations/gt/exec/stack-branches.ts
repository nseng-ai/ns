import { failure, negative, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../../../core/context.ts";
import type { StackInfo } from "@nseng-ai/extension-kit/graphite/stack";
import { resolveRepoAndCurrentBranch } from "../shared.ts";
import { collectStackBranches, collectStackEdges } from "../stack-walk.ts";
import { validateStackIntegrity } from "./stack-integrity.ts";

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
	const stackResult = await ctx.gt.stack(resolved.repoRoot);
	if (stackResult.type === "untracked_branch")
		return failure("untracked-branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure")
		return failure("gt-stack-read-failed", stackResult.failure.message);
	const integrity = validateStackIntegrity(stackResult.stack, {
		downstack: request.downstack,
		forkHint: "--downstack",
	});
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
		isDownstackOnly: request.downstack,
		shouldIncludeCurrent: true,
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
			...collectStackEdges(stack, { current: stack.current, isDownstackOnly: options.downstack }),
		],
		warnings: [...options.warnings],
	};
}
