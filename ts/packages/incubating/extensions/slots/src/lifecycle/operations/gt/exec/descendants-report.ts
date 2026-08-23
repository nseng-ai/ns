import { failure, negative, ok } from "@nseng-ai/clinkr";
import type { GraphiteTopology } from "@nseng-ai/extension-kit/graphite/metadata";
import { z } from "zod";

import type { SlotCliContext } from "../../../../core/context.ts";
import type {
	BranchComparison,
	BranchComparisonResult,
} from "../../../../core/gateways/repository.ts";
import { prFailureMessage, type PrLookupResult } from "../../../../core/gateways/pr.ts";

const LOCAL_EVIDENCE_WORKERS = 4;
const DESCENDANTS_SCOPE = "descendants";

const commitSchema = z.object({ sha: z.string(), subject: z.string() });
const diffFileSchema = z.object({
	path: z.string(),
	additions: z.number().int().nonnegative().nullable(),
	deletions: z.number().int().nonnegative().nullable(),
	binary: z.boolean(),
});
const diffSchema = z.object({
	filesChanged: z.number().int().nonnegative(),
	insertions: z.number().int().nonnegative(),
	deletions: z.number().int().nonnegative(),
	files: z.array(diffFileSchema),
});
const prSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("found"),
		number: z.number().int().positive(),
		title: z.string(),
		state: z.union([z.literal("OPEN"), z.literal("CLOSED"), z.literal("MERGED")]),
		url: z.string(),
		headRefName: z.string(),
		baseRefName: z.string(),
	}),
	z.object({ type: z.literal("none") }),
	z.object({ type: z.literal("unavailable"), message: z.string() }),
]);
const descendantSchema = z.object({
	branch: z.string(),
	parent: z.string(),
	children: z.array(z.string()),
	commits: z.array(commitSchema),
	diff: diffSchema,
	pr: prSchema,
});
const edgeSchema = z.object({ parent: z.string(), child: z.string() });

export const gtDescendantsReportRequestSchema = z.object({ branch: z.string().min(1) });

export const gtDescendantsReportResultSchema = z.object({
	root: z.string(),
	scope: z.literal(DESCENDANTS_SCOPE),
	complete: z.literal(true),
	descendantCount: z.number().int().nonnegative(),
	edges: z.array(edgeSchema),
	descendants: z.array(descendantSchema),
	warnings: z.array(z.string()),
});

export type GtDescendantsReportRequest = z.infer<typeof gtDescendantsReportRequestSchema>;
export type GtDescendantsReportResult = z.infer<typeof gtDescendantsReportResultSchema>;
type Descendant = z.infer<typeof descendantSchema>;
type DescendantPr = z.infer<typeof prSchema>;

interface DescendantNode {
	branch: string;
	parent: string;
	children: readonly string[];
}

interface DescendantWalk {
	type: "ok";
	nodes: readonly DescendantNode[];
}

interface DescendantWalkFailure {
	type: "failure";
	branch: string;
	parent: string;
	message: string;
}

export async function runGtDescendantsReport(
	ctx: SlotCliContext,
	request: GtDescendantsReportRequest,
) {
	if (ctx.repo.type === "no_repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const localBranchesResult = await ctx.git.listLocalBranches();
	if (localBranchesResult.type === "failure")
		return failure(
			"local-branches-read-failed",
			`Cannot list local branches: ${localBranchesResult.failure.message}`,
			{
				branch: request.branch,
				parent: request.branch,
				stage: "local-branches",
			},
		);
	const localBranches: ReadonlySet<string> = new Set(localBranchesResult.branches);
	if (!localBranches.has(request.branch))
		return negative(`Local branch '${request.branch}' was not found.`, { target: request.branch });

	const graphResult = await ctx.gt.stackGraph(ctx.repo.mainRepoRoot);
	if (graphResult.type === "git_common_dir_missing")
		return failure("git-common-dir-missing", graphResult.message, {
			branch: request.branch,
			parent: request.branch,
			stage: "graphite-metadata",
		});
	if (graphResult.type === "failure")
		return failure("gt-metadata-read-failed", graphResult.failure.message, {
			branch: request.branch,
			parent: request.branch,
			stage: "graphite-metadata",
		});
	if (!graphResult.graph.topology.has(request.branch))
		return negative(`Graphite metadata for branch '${request.branch}' was not found.`, {
			target: request.branch,
		});

	const walk = walkDescendants(graphResult.graph.topology, request.branch);
	if (walk.type === "failure")
		return failure("graphite-topology-invalid", walk.message, {
			branch: walk.branch,
			parent: walk.parent,
			stage: "graphite-topology",
		});
	for (const node of walk.nodes) {
		if (!localBranches.has(node.branch))
			return failure(
				"local-branch-missing",
				`Graphite descendant '${node.branch}' is not a local branch.`,
				{ branch: node.branch, parent: node.parent, stage: "local-branch" },
			);
	}

	const comparisons = await collectComparisons(ctx, walk.nodes);
	const failedIndex = comparisons.findIndex((comparison) => comparison.type === "failure");
	if (failedIndex !== -1) {
		const node = walk.nodes[failedIndex];
		const comparison = comparisons[failedIndex];
		if (node === undefined || comparison === undefined || comparison.type !== "failure")
			throw new Error("Descendant comparison result did not match its topology node.");
		return failure("branch-comparison-failed", comparison.failure.message, {
			branch: node.branch,
			parent: node.parent,
			stage: "git-comparison",
		});
	}

	const branches = walk.nodes.map((node) => node.branch);
	const prBatch = await ctx.pr.getPrsForBranches(branches);
	const warnings: string[] = [];
	let prResults: ReadonlyMap<string, PrLookupResult>;
	if (prBatch.type === "failure") {
		const message = prFailureMessage(prBatch.failure, "GitHub PR batch lookup failed");
		warnings.push(`GitHub PR metadata is unavailable: ${message}`);
		prResults = new Map(
			branches.map((branch) => [branch, { type: "failure", failure: prBatch.failure }]),
		);
	} else {
		prResults = prBatch.resultsByBranch;
	}

	const descendants = walk.nodes.map((node, index): Descendant => {
		const comparison = comparisons[index];
		if (comparison === undefined || comparison.type !== "ok")
			throw new Error(`Missing successful comparison for ${node.branch}.`);
		const pr = prResult(prResults.get(node.branch));
		if (pr.type === "unavailable" && prBatch.type === "ok")
			warnings.push(`GitHub PR metadata for ${node.branch} is unavailable: ${pr.message}`);
		return {
			branch: node.branch,
			parent: node.parent,
			children: [...node.children],
			commits: comparison.comparison.commits.map((commit) => ({ ...commit })),
			diff: copyDiff(comparison.comparison),
			pr,
		};
	});
	const result: GtDescendantsReportResult = {
		root: request.branch,
		scope: DESCENDANTS_SCOPE,
		complete: true,
		descendantCount: descendants.length,
		edges: walk.nodes.map((node) => ({ parent: node.parent, child: node.branch })),
		descendants,
		warnings,
	};
	return ok(result);
}

export function renderGtDescendantsReport(result: GtDescendantsReportResult): string {
	return JSON.stringify({
		root: result.root,
		descendantCount: result.descendantCount,
		descendants: result.descendants,
		warnings: result.warnings,
	});
}

function walkDescendants(
	topology: GraphiteTopology,
	root: string,
): DescendantWalk | DescendantWalkFailure {
	const nodes: DescendantNode[] = [];
	const visited = new Set<string>([root]);
	const visit = (parent: string): DescendantWalkFailure | null => {
		const parentRow = topology.get(parent);
		if (parentRow === undefined)
			return {
				type: "failure",
				branch: parent,
				parent,
				message: `Missing Graphite row for '${parent}'.`,
			};
		if (parentRow.childrenCorruption !== undefined)
			return {
				type: "failure",
				branch: parent,
				parent: parentRow.parent ?? parent,
				message: `Graphite child metadata for '${parent}' is corrupt (${parentRow.childrenCorruption.kind}).`,
			};
		for (const branch of [...parentRow.children].sort()) {
			if (visited.has(branch))
				return {
					type: "failure",
					branch,
					parent,
					message: `Graphite descendant topology contains a cycle at '${branch}'.`,
				};
			const row = topology.get(branch);
			if (row === undefined)
				return {
					type: "failure",
					branch,
					parent,
					message: `Graphite metadata child '${branch}' has no row.`,
				};
			if (row.parent !== parent)
				return {
					type: "failure",
					branch,
					parent,
					message: `Graphite metadata parent for '${branch}' does not match '${parent}'.`,
				};
			visited.add(branch);
			nodes.push({ branch, parent, children: [...row.children].sort() });
			const failureResult = visit(branch);
			if (failureResult !== null) return failureResult;
		}
		return null;
	};
	const walkFailure = visit(root);
	return walkFailure ?? { type: "ok", nodes };
}

async function collectComparisons(
	ctx: SlotCliContext,
	nodes: readonly DescendantNode[],
): Promise<readonly BranchComparisonResult[]> {
	const results: Array<BranchComparisonResult | undefined> = Array.from({ length: nodes.length });
	let nextIndex = 0;
	async function worker(): Promise<void> {
		while (nextIndex < nodes.length) {
			const index = nextIndex;
			nextIndex += 1;
			const node = nodes[index];
			if (node === undefined) continue;
			results[index] = await ctx.git.readBranchComparison({
				parent: node.parent,
				branch: node.branch,
			});
		}
	}
	const workerCount = Math.min(LOCAL_EVIDENCE_WORKERS, nodes.length);
	await Promise.all(Array.from({ length: workerCount }, async () => await worker()));
	return results.map((result) => {
		if (result === undefined)
			throw new Error("A descendant comparison worker did not produce a result.");
		return result;
	});
}

function copyDiff(comparison: BranchComparison): Descendant["diff"] {
	return {
		...comparison.diff,
		files: comparison.diff.files.map((file) => ({ ...file })),
	};
}

function prResult(result: PrLookupResult | undefined): DescendantPr {
	if (result === undefined)
		return { type: "unavailable", message: "GitHub PR batch omitted this branch" };
	if (result.type === "miss") return { type: "none" };
	if (result.type === "failure")
		return { type: "unavailable", message: prFailureMessage(result.failure) };
	return { type: "found", ...result.pr };
}
