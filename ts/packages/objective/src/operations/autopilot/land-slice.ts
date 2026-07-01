import { failure, negative, ok, usageError, type ClinkrExit } from "@sdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../../context.ts";
import { activeRecordRelativePath, isValidObjectiveSlug } from "../../storage.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "../format.ts";

export const autopilotLandSliceRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug the slice belongs to."),
	startBranch: z.string().optional().describe("Branch the slice started from."),
	message: z.string().optional().describe("Commit/PR message for the landed slice."),
	submit: z.boolean().default(false).describe("Open a PR via sdl flow submit --no-restack."),
	dryRun: z.boolean().default(false).describe("Verify only; never stage, commit, or submit."),
});

export const autopilotLandSliceViolationSchema = z.enum([
	"clean-worktree",
	"branch-not-moved",
	"on-trunk",
	"graphite-untracked",
	"diff-check-failed",
	"missing-tracking-evidence",
	"format-fix-failed",
	"format-check-failed-after-fix",
	"stage-failed",
	"commit-failed",
	"submit-failed",
]);

export const autopilotLandSliceResultSchema = z.object({
	ok: z.boolean(),
	committed: z.boolean(),
	submitted: z.boolean(),
	prUrl: z.string().nullable(),
	branch: z.string().nullable(),
	changedFiles: z.array(z.string()),
	violations: z.array(autopilotLandSliceViolationSchema),
	recoveryNotes: z.array(z.string()),
});

export type AutopilotLandSliceRequest = z.infer<typeof autopilotLandSliceRequestSchema>;
export type AutopilotLandSliceViolation = z.infer<typeof autopilotLandSliceViolationSchema>;
export type AutopilotLandSliceResult = z.infer<typeof autopilotLandSliceResultSchema>;

export async function runAutopilotLandSlice(
	ctx: ObjectiveCliContext,
	request: AutopilotLandSliceRequest,
): Promise<ClinkrExit<AutopilotLandSliceResult>> {
	if (request.slug === undefined) {
		return usageError("Objective slug is required.", { argument: "slug" });
	}
	if (!isValidObjectiveSlug(request.slug)) {
		return usageError(`Invalid Objective slug: ${pythonStringRepr(request.slug)}.`, {
			argument: "slug",
		});
	}
	if (request.startBranch === undefined) {
		return usageError("--start-branch is required.", { argument: "startBranch" });
	}
	if (request.message === undefined) {
		return usageError("--message is required.", { argument: "message" });
	}
	const slug = request.slug;
	const startBranch = request.startBranch;
	const message = request.message;

	const changed = await ctx.autopilot.uncommittedChangedPaths({ cwd: ctx.repoRoot });
	if (!changed.ok) return failure(changed.error.code, changed.error.message);

	const currentBranch = await ctx.git.currentBranch({ cwd: ctx.repoRoot });
	if (currentBranch.type === "failure") {
		return failure(currentBranch.error.code, currentBranch.error.message);
	}
	const branch = currentBranch.type === "branch" ? currentBranch.branch : null;

	const violations: AutopilotLandSliceViolation[] = [];
	if (changed.value.length === 0) violations.push("clean-worktree");
	if (branch === ctx.trunkBranch) violations.push("on-trunk");
	if (branch !== null && branch === startBranch) violations.push("branch-not-moved");

	if (violations.length === 0) {
		// branch is non-null here: a null (detached HEAD) branch is neither trunk nor equal to the
		// string startBranch, so it survives the checks above and must be treated as untracked.
		if (branch === null) {
			violations.push("graphite-untracked");
		} else {
			const tracked = await ctx.autopilot.graphiteBranchTracked({ cwd: ctx.repoRoot, branch });
			if (!tracked.ok) violations.push("graphite-untracked");
		}

		const diffCheck = await ctx.autopilot.diffCheck({ cwd: ctx.repoRoot });
		if (!diffCheck.ok) violations.push("diff-check-failed");

		const objectivePath = activeRecordRelativePath(slug);
		const objectivePrefix = `${objectivePath}/`;
		const isObjectivePath = (path: string) =>
			path === objectivePath || path.startsWith(objectivePrefix);
		const hasNonObjectiveChanges = changed.value.some((path) => !isObjectivePath(path));
		const hasTrackingEvidence = changed.value.some((path) => isObjectivePath(path));
		if (hasNonObjectiveChanges && !hasTrackingEvidence)
			violations.push("missing-tracking-evidence");
	}

	if (violations.length > 0) {
		return negative(
			`Objective autopilot land-slice verification failed: ${violations.join(", ")}.`,
			{
				data: verifyFailureResult(branch, changed.value, violations),
			},
		);
	}

	if (request.dryRun) {
		return ok({
			ok: true,
			committed: false,
			submitted: false,
			prUrl: null,
			branch,
			changedFiles: [...changed.value],
			violations: [],
			recoveryNotes: [],
		});
	}

	const recoveryNotes: string[] = [];
	let changedFiles = [...changed.value];
	if (changedFiles.some((path) => path.endsWith(".ts") || path.endsWith(".tsx"))) {
		const check = await ctx.autopilot.formatCheck({ cwd: ctx.repoRoot });
		if (!check.ok) {
			const fix = await ctx.autopilot.formatFix({ cwd: ctx.repoRoot });
			if (!fix.ok) {
				return negative("Objective autopilot land-slice formatter recovery failed.", {
					data: verifyFailureResult(branch, changedFiles, ["format-fix-failed"]),
				});
			}
			const recheck = await ctx.autopilot.formatCheck({ cwd: ctx.repoRoot });
			if (!recheck.ok) {
				return negative(
					"Objective autopilot land-slice formatter check still fails after autofix.",
					{
						data: verifyFailureResult(branch, changedFiles, ["format-check-failed-after-fix"]),
					},
				);
			}
			recoveryNotes.push("ran just ts-format-fix after just ts-format-check failed");
			const refreshed = await ctx.autopilot.uncommittedChangedPaths({ cwd: ctx.repoRoot });
			if (!refreshed.ok) return failure(refreshed.error.code, refreshed.error.message);
			changedFiles = [...refreshed.value];
		}
	}

	const stage = await ctx.autopilot.stageFiles({ cwd: ctx.repoRoot, files: changedFiles });
	if (!stage.ok) {
		return negative("Objective autopilot land-slice staging failed.", {
			data: verifyFailureResult(branch, changedFiles, ["stage-failed"], recoveryNotes),
		});
	}

	const graphiteModify = await ctx.autopilot.graphiteModify({ cwd: ctx.repoRoot, message });
	if (!graphiteModify.ok) {
		const commit = await ctx.autopilot.commit({ cwd: ctx.repoRoot, message });
		if (!commit.ok) {
			return negative("Objective autopilot land-slice commit failed.", {
				data: verifyFailureResult(branch, changedFiles, ["commit-failed"], recoveryNotes),
			});
		}
	}

	if (!request.submit) {
		return ok({
			ok: true,
			committed: true,
			submitted: false,
			prUrl: null,
			branch,
			changedFiles,
			violations: [],
			recoveryNotes,
		});
	}

	const submit = await ctx.autopilot.submit({ cwd: ctx.repoRoot });
	if (!submit.ok) {
		return negative(
			"Objective autopilot land-slice commit succeeded, but sdl flow submit failed.",
			{
				data: {
					ok: false,
					committed: true,
					submitted: false,
					prUrl: null,
					branch,
					changedFiles,
					violations: ["submit-failed"] satisfies AutopilotLandSliceViolation[],
					recoveryNotes,
				},
			},
		);
	}

	return ok({
		ok: true,
		committed: true,
		submitted: true,
		prUrl: extractPrUrl(submit.value),
		branch,
		changedFiles,
		violations: [],
		recoveryNotes,
	});
}

export function renderAutopilotLandSlice(result: AutopilotLandSliceResult): string {
	const lines = [
		`# Objective Autopilot Land Slice`,
		"",
		`Ready: ${result.ok ? "yes" : "no"}`,
		`Branch: ${result.branch ?? "detached HEAD"}`,
		`Committed: ${result.committed ? "yes" : "no"}`,
		`Submitted: ${result.submitted ? "yes" : "no"}`,
		`PR: ${result.prUrl ?? "none"}`,
		`Changed files: ${result.changedFiles.length}`,
	];
	if (result.violations.length > 0) {
		lines.push("", "## Violations");
		for (const violation of result.violations) lines.push(`- ${violation}`);
	}
	if (result.recoveryNotes.length > 0) {
		lines.push("", "## Recovery");
		for (const note of result.recoveryNotes) lines.push(`- ${note}`);
	}
	return removeOneTrailingNewline(lines.join("\n"));
}

function verifyFailureResult(
	branch: string | null,
	changedFiles: readonly string[],
	violations: readonly AutopilotLandSliceViolation[],
	recoveryNotes: readonly string[] = [],
): AutopilotLandSliceResult {
	return {
		ok: false,
		committed: false,
		submitted: false,
		prUrl: null,
		branch,
		changedFiles: [...changedFiles],
		violations: [...violations],
		recoveryNotes: [...recoveryNotes],
	};
}

function extractPrUrl(output: string): string | null {
	const match = output.split(/\r?\n/).find((line) => line.includes("http"));
	return match?.trim() ?? null;
}
