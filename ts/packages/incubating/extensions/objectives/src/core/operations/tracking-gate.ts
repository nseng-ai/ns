import { failure, negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import {
	activeRecordRelativePath,
	activeRootRelativePath,
	isValidObjectiveSlug,
} from "../storage.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
import { readObjectiveRecord } from "./read-objective.ts";

export const trackingGateRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to inspect."),
});

const gitFailureSchema = z.object({
	code: z.string(),
	message: z.string(),
	displayCommand: z.string().optional(),
});

const trackingGateGitProbeSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("ok"), hasChanges: z.boolean() }),
	z.object({ status: z.literal("error"), error: gitFailureSchema }),
]);

export const trackingGateResultSchema = z.object({
	slug: z.string(),
	objectivePath: z.string(),
	rootPath: z.string(),
	objective: z.object({
		exists: z.boolean(),
		closed: z.boolean(),
	}),
	git: z.object({
		repoRoot: z.string(),
		currentBranch: z.discriminatedUnion("type", [
			z.object({ type: z.literal("branch"), branch: z.string() }),
			z.object({ type: z.literal("detached") }),
		]),
		trunkBranch: z.string(),
		revisionRange: z.string(),
	}),
	uncommitted: z.object({
		repository: trackingGateGitProbeSchema,
		objective: trackingGateGitProbeSchema,
	}),
	branchDiff: z.object({
		status: z.literal("ok"),
		changedPaths: z.array(z.string()),
		changedPathCount: z.number().int(),
		objectiveChangedPaths: z.array(z.string()),
		objectiveChangedPathCount: z.number().int(),
		materialNonObjectivePaths: z.array(z.string()),
		materialNonObjectivePathCount: z.number().int(),
	}),
	summary: z.object({
		objectiveFilesChanged: z.boolean(),
		materialNonObjectivePathsChanged: z.boolean(),
		uncommittedChangesPresent: z.boolean().nullable(),
		uncommittedObjectiveChangesPresent: z.boolean().nullable(),
	}),
});

export type TrackingGateRequest = z.infer<typeof trackingGateRequestSchema>;
export type TrackingGateResult = z.infer<typeof trackingGateResultSchema>;

export async function runTrackingGate(
	ctx: ObjectiveCliContext,
	request: TrackingGateRequest,
): Promise<
	ClinkrExit<
		TrackingGateResult,
		TrackingGateResult,
		TrackingGateResult,
		{ readonly argument: string }
	>
> {
	if (request.slug === undefined) {
		return usageError("Objective slug is required.", { argument: "slug" });
	}
	if (!isValidObjectiveSlug(request.slug)) {
		return usageError(`Invalid Objective slug: ${pythonStringRepr(request.slug)}.`, {
			argument: "slug",
		});
	}

	const recordResult = await readObjectiveRecord(ctx.storage, request.slug);
	if (recordResult.type === "storage-error") {
		return failure(recordResult.error.code, recordResult.error.message);
	}
	if (recordResult.value.status === "not-found") {
		return negative(
			`No Objective record found for slug ${pythonStringRepr(request.slug)}.`,
			buildMissingResult(ctx, request.slug),
		);
	}
	if (recordResult.value.status !== "ok") {
		return failure(
			recordResult.value.status,
			recordResult.value.error ?? "Unable to read Objective.",
		);
	}

	const currentBranch = await ctx.git.currentBranch({ cwd: ctx.repoRoot });
	if (currentBranch.type === "failure") {
		return failure(currentBranch.error.code, currentBranch.error.message);
	}

	const revisionRange = `${ctx.trunkBranch}...HEAD`;
	const changedPathsResult = await ctx.git.changedPathsUnder({
		cwd: ctx.repoRoot,
		revisionRange,
		relativePath: ".",
	});
	if (!changedPathsResult.ok) {
		return failure(changedPathsResult.error.code, changedPathsResult.error.message);
	}

	const objectivePath = activeRecordRelativePath(request.slug);
	const objectiveChangedPaths = changedPathsResult.value.filter((path) =>
		isUnderPath(path, objectivePath),
	);
	const materialNonObjectivePaths = changedPathsResult.value.filter(
		(path) => !isUnderPath(path, objectivePath),
	);
	const repositoryDirty = await ctx.git.hasUncommittedChangesUnder({
		cwd: ctx.repoRoot,
		relativePath: ".",
	});
	const objectiveDirty = await ctx.git.hasUncommittedChangesUnder({
		cwd: ctx.repoRoot,
		relativePath: objectivePath,
	});
	const repositoryDirtyProbe = gitBooleanProbe(repositoryDirty);
	const objectiveDirtyProbe = gitBooleanProbe(objectiveDirty);

	return ok(
		buildTrackingGateResult({
			slug: request.slug,
			objectivePath,
			rootPath: activeRootRelativePath(),
			objective: { exists: true, closed: recordResult.value.closed },
			git: {
				repoRoot: ctx.repoRoot,
				currentBranch,
				trunkBranch: ctx.trunkBranch,
				revisionRange,
			},
			uncommitted: {
				repository: repositoryDirtyProbe,
				objective: objectiveDirtyProbe,
			},
			branchDiff: {
				changedPaths: [...changedPathsResult.value],
				objectiveChangedPaths,
				materialNonObjectivePaths,
			},
		}),
	);
}

export function renderTrackingGate(result: TrackingGateResult): string {
	const currentBranch =
		result.git.currentBranch.type === "branch" ? result.git.currentBranch.branch : "detached HEAD";
	const parts = [
		`# Objective Tracking Gate \`${result.slug}\``,
		"",
		`Objective: \`${result.objectivePath}\` (${result.objective.closed ? "closed" : "open"})`,
		`Branch: \`${currentBranch}\``,
		`Diff base: \`${result.git.trunkBranch}\` via \`${result.git.revisionRange}\``,
		`Uncommitted changes: ${formatProbe(result.uncommitted.repository)}`,
		`Uncommitted Objective changes: ${formatProbe(result.uncommitted.objective)}`,
		`Objective files changed in branch diff: ${formatCount(result.branchDiff.objectiveChangedPathCount)}`,
		`Material non-Objective paths changed in branch diff: ${formatCount(result.branchDiff.materialNonObjectivePathCount)}`,
	];
	appendPathList(parts, "Objective changed paths", result.branchDiff.objectiveChangedPaths);
	appendPathList(
		parts,
		"Material non-Objective changed paths",
		result.branchDiff.materialNonObjectivePaths,
	);
	return removeOneTrailingNewline(parts.join("\n"));
}

interface TrackingGateResultParts {
	slug: string;
	objectivePath: string;
	rootPath: string;
	objective: TrackingGateResult["objective"];
	git: TrackingGateResult["git"];
	uncommitted?: TrackingGateResult["uncommitted"];
	branchDiff?: {
		changedPaths: readonly string[];
		objectiveChangedPaths: readonly string[];
		materialNonObjectivePaths: readonly string[];
	};
}

function buildTrackingGateResult(options: TrackingGateResultParts): TrackingGateResult {
	const uncommitted = options.uncommitted ?? notRunUncommittedProbes("Objective missing.");
	const changedPaths = options.branchDiff?.changedPaths ?? [];
	const objectiveChangedPaths = options.branchDiff?.objectiveChangedPaths ?? [];
	const materialNonObjectivePaths = options.branchDiff?.materialNonObjectivePaths ?? [];
	return {
		slug: options.slug,
		objectivePath: options.objectivePath,
		rootPath: options.rootPath,
		objective: options.objective,
		git: options.git,
		uncommitted,
		branchDiff: {
			status: "ok",
			changedPaths: [...changedPaths],
			changedPathCount: changedPaths.length,
			objectiveChangedPaths: [...objectiveChangedPaths],
			objectiveChangedPathCount: objectiveChangedPaths.length,
			materialNonObjectivePaths: [...materialNonObjectivePaths],
			materialNonObjectivePathCount: materialNonObjectivePaths.length,
		},
		summary: {
			objectiveFilesChanged: objectiveChangedPaths.length > 0,
			materialNonObjectivePathsChanged: materialNonObjectivePaths.length > 0,
			uncommittedChangesPresent:
				uncommitted.repository.status === "ok" ? uncommitted.repository.hasChanges : null,
			uncommittedObjectiveChangesPresent:
				uncommitted.objective.status === "ok" ? uncommitted.objective.hasChanges : null,
		},
	};
}

function buildMissingResult(ctx: ObjectiveCliContext, slug: string): TrackingGateResult {
	return buildTrackingGateResult({
		slug,
		objectivePath: activeRecordRelativePath(slug),
		rootPath: activeRootRelativePath(),
		objective: { exists: false, closed: false },
		git: {
			repoRoot: ctx.repoRoot,
			currentBranch: { type: "detached" },
			trunkBranch: ctx.trunkBranch,
			revisionRange: `${ctx.trunkBranch}...HEAD`,
		},
	});
}

function notRunUncommittedProbes(message: string): TrackingGateResult["uncommitted"] {
	const error = { code: "not_run", message };
	return {
		repository: { status: "error", error },
		objective: { status: "error", error },
	};
}

function gitBooleanProbe(
	result: Awaited<ReturnType<ObjectiveCliContext["git"]["hasUncommittedChangesUnder"]>>,
) {
	if (!result.ok) return { status: "error" as const, error: result.error };
	return { status: "ok" as const, hasChanges: result.value };
}

function isUnderPath(path: string, parent: string): boolean {
	return path === parent || path.startsWith(`${parent}/`);
}

function formatProbe(probe: TrackingGateResult["uncommitted"]["repository"]): string {
	if (probe.status === "error") return `unknown (${probe.error.code})`;
	return probe.hasChanges === true ? "yes" : "no";
}

function formatCount(count: number): string {
	return count === 0 ? "none" : String(count);
}

function appendPathList(parts: string[], title: string, paths: readonly string[]): void {
	if (paths.length === 0) return;
	parts.push("", `## ${title}`);
	for (const path of paths) parts.push(`- \`${path}\``);
}
