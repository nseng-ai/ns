import type { StackInfo } from "@nseng-ai/extension-kit/graphite/stack";
import { parseJsonUnknown } from "@nseng-ai/extension-kit/github/graphql-json";
import { failure, negative, ok, usageError } from "@nseng-ai/clinkr";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { SlotCliContext } from "../../../../core/context.ts";
import type { LocalBranchTip } from "../../../../core/gateways/repository.ts";
import { buildSlotInventory } from "../../../../core/inventory.ts";
import { resolveRepoAndCurrentBranch } from "../shared.ts";
import { collectStackBranches } from "../stack-walk.ts";
import {
	collectScopedSlotConflicts,
	scopedSlotConflictVariantSchemas,
} from "./scoped-slot-conflicts.ts";
import { validateStackIntegrity } from "./stack-integrity.ts";

const gtQuiescenceScopeSchema = z.enum(["downstack", "full"]);

const quiescenceSnapshotBranchSchema = z.object({
	branch: z.string(),
	head: z.string().nullable(),
});

const quiescenceSnapshotSchema = z.object({
	scope: gtQuiescenceScopeSchema,
	trunk: z.string(),
	current: z.string(),
	branches: z.array(quiescenceSnapshotBranchSchema),
});

const refDriftSchema = z.object({
	type: z.literal("ref-drift"),
	branch: z.string(),
	expectedHead: z.string().nullable(),
	actualHead: z.string().nullable(),
});

const quiescenceBlockerSchema = z.discriminatedUnion("type", [
	...scopedSlotConflictVariantSchemas,
	refDriftSchema,
]);

export const gtQuiescenceRequestSchema = z.object({
	scope: gtQuiescenceScopeSchema.default("downstack"),
	expectSnapshotJson: z
		.string()
		.optional()
		.describe(
			"Previously emitted quiescence snapshot JSON to compare against current branch tips.",
		),
});

export const gtQuiescenceResultSchema = z.object({
	isQuiescent: z.boolean(),
	scope: gtQuiescenceScopeSchema,
	current: z.string(),
	trunk: z.string(),
	branches: z.array(z.string()),
	snapshot: quiescenceSnapshotSchema,
	blockers: z.array(quiescenceBlockerSchema),
	warnings: z.array(z.string()),
});

export type GtQuiescenceRequest = z.infer<typeof gtQuiescenceRequestSchema>;
export type GtQuiescenceResult = z.infer<typeof gtQuiescenceResultSchema>;
type QuiescenceScope = z.infer<typeof gtQuiescenceScopeSchema>;
type QuiescenceSnapshot = z.infer<typeof quiescenceSnapshotSchema>;
type QuiescenceBlocker = z.infer<typeof quiescenceBlockerSchema>;

export async function runGtQuiescence(ctx: SlotCliContext, request: GtQuiescenceRequest) {
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;

	const stackResult = await ctx.gt.stack(resolved.repoRoot);
	if (stackResult.type === "untracked_branch")
		return failure("untracked-branch", `${stackResult.message} — run \`gt track\` first`);
	if (stackResult.type === "failure")
		return failure("gt-stack-read-failed", stackResult.failure.message);

	const expected = parseExpectedSnapshot(request.expectSnapshotJson);
	if (expected.type === "usage-error") return usageError(expected.message, expected.data);

	const stack = stackResult.stack;
	const isDownstack = request.scope === "downstack";
	const integrity = validateStackIntegrity(stack, {
		downstack: request.scope === "downstack",
		forkHint: "--scope downstack",
	});
	if (integrity.type === "failure") return failure(integrity.errorType, integrity.message);
	if (ctx.shouldWriteCdDirective) {
		for (const warning of integrity.warnings) ctx.stderr(`${warning}\n`);
	}

	if (stack.current === stack.trunk) {
		const snapshot = buildSnapshot({ stack, scope: request.scope, branches: [], branchTips: [] });
		const result = buildResult({
			stack,
			scope: request.scope,
			branches: [],
			snapshot,
			blockers: [],
			warnings: [],
			isQuiescent: false,
		});
		return negative(`On trunk '${stack.trunk}'; no stack is checked out.`, result);
	}

	const branches = collectStackBranches(stack, {
		current: stack.current,
		trunk: stack.trunk,
		isDownstackOnly: isDownstack,
		shouldIncludeCurrent: true,
	});
	const branchTips = await ctx.git.listLocalBranchTips();
	const snapshot = buildSnapshot({ stack, scope: request.scope, branches, branchTips });
	const snapshotCheck =
		expected.snapshot === null
			? { type: "ok" as const, blockers: [] }
			: compareSnapshots({ expected: expected.snapshot, actual: snapshot });
	if (snapshotCheck.type === "failure")
		return failure(snapshotCheck.errorType, snapshotCheck.message, snapshotCheck.data);
	const inventory = await buildSlotInventory(ctx.git, {
		mainRepoRoot: resolved.mainRepoRoot,
	});
	const blockers = [
		...collectScopedSlotConflicts({
			occupancies: inventory.branchOccupancies,
			records: inventory.records,
			branches,
			currentPath: ctx.cwd,
		}),
		...snapshotCheck.blockers,
	];
	const result = buildResult({
		stack,
		scope: request.scope,
		branches,
		snapshot,
		blockers,
		warnings: integrity.warnings,
	});
	if (blockers.length > 0) return negative("Stack is not quiescent.", result);
	return ok(result);
}

export function renderGtQuiescence(result: GtQuiescenceResult): string {
	// Hidden exec command: compact JSON is the intentional human renderer for skill/agent callers.
	return JSON.stringify({ isQuiescent: result.isQuiescent, blockers: result.blockers });
}

function buildResult(options: {
	readonly stack: StackInfo;
	readonly scope: QuiescenceScope;
	readonly branches: readonly string[];
	readonly snapshot: QuiescenceSnapshot;
	readonly blockers: readonly QuiescenceBlocker[];
	readonly warnings: readonly string[];
	readonly isQuiescent?: boolean;
}): GtQuiescenceResult {
	return {
		isQuiescent: options.isQuiescent ?? options.blockers.length === 0,
		scope: options.scope,
		current: options.stack.current,
		trunk: options.stack.trunk,
		branches: [...options.branches],
		snapshot: options.snapshot,
		blockers: [...options.blockers],
		warnings: [...options.warnings],
	};
}

function buildSnapshot(options: {
	readonly stack: StackInfo;
	readonly scope: QuiescenceScope;
	readonly branches: readonly string[];
	readonly branchTips: readonly LocalBranchTip[];
}): QuiescenceSnapshot {
	const heads = branchHeadMap(options.branchTips);
	return {
		scope: options.scope,
		trunk: options.stack.trunk,
		current: options.stack.current,
		branches: options.branches.map((branch) => ({ branch, head: heads.get(branch) ?? null })),
	};
}

function branchHeadMap(branchTips: readonly LocalBranchTip[]): ReadonlyMap<string, string | null> {
	return new Map(branchTips.map((tip) => [tip.name, tip.headIso]));
}

function parseExpectedSnapshot(
	value: string | undefined,
):
	| { type: "ok"; snapshot: QuiescenceSnapshot | null }
	| { type: "usage-error"; message: string; data: { argument: string } } {
	if (value === undefined) return { type: "ok", snapshot: null };
	const parsed = parseJsonUnknown(value);
	if (parsed.type === "error") {
		return {
			type: "usage-error",
			message: `Invalid --expect-snapshot-json: ${formatErrorMessage(parsed.error)}`,
			data: { argument: "--expect-snapshot-json" },
		};
	}
	const validation = quiescenceSnapshotSchema.safeParse(parsed.value);
	if (!validation.success) {
		return {
			type: "usage-error",
			message: "Invalid --expect-snapshot-json: value does not match quiescence snapshot schema.",
			data: { argument: "--expect-snapshot-json" },
		};
	}
	return { type: "ok", snapshot: validation.data };
}

function compareSnapshots(options: {
	readonly expected: QuiescenceSnapshot;
	readonly actual: QuiescenceSnapshot;
}):
	| { type: "ok"; blockers: readonly QuiescenceBlocker[] }
	| { type: "failure"; errorType: string; message: string; data: { reason: string } } {
	if (
		options.expected.scope !== options.actual.scope ||
		options.expected.current !== options.actual.current ||
		options.expected.trunk !== options.actual.trunk
	) {
		return {
			type: "failure",
			errorType: "snapshot-context-mismatch",
			message:
				"Expected quiescence snapshot context does not match current Graphite stack context.",
			data: { reason: "scope/current/trunk mismatch" },
		};
	}
	const blockers: QuiescenceBlocker[] = [];
	const actualHeads = new Map(
		options.actual.branches.map((branch) => [branch.branch, branch.head]),
	);
	for (const expected of options.expected.branches) {
		const actualHead = actualHeads.get(expected.branch) ?? null;
		if (expected.head !== actualHead) {
			blockers.push({
				type: "ref-drift",
				branch: expected.branch,
				expectedHead: expected.head,
				actualHead,
			});
		}
	}
	return { type: "ok", blockers };
}
