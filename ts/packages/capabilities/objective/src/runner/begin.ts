/**
 * `runner-begin` operation (ADR 0024): LBYL preconditions plus step-facts and
 * subagent-prompt production for one decomposed Objective Runner step. No
 * child dispatch — the parent harness owns the implementation session; the
 * facts this command emits are replayed verbatim to `runner-finish`.
 */
import { isAbsolute, relative, resolve } from "node:path";

import { failure, negative, ok, usageError, type ClinkrExit } from "@sdl/clinkr";
import { optionalEntry } from "@sdl/core/primitives";
import { z } from "zod";

import type { ObjectiveRunnerCoreContext, RunnerStepMode } from "./context.ts";
import { resolveGuidance } from "./guidance.ts";
import { checkRunnerPreconditions } from "./preconditions.ts";
import { buildRunnerChildPrompt } from "./prompt.ts";

export const runnerBeginRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to begin one implementation step for."),
	recover: z
		.boolean()
		.default(false)
		.describe("Repair the dirty tree a failed step left behind instead of starting a fresh slice."),
	guidance: z
		.string()
		.optional()
		.describe(
			"Parent guidance woven verbatim into the subagent prompt; a value starting with @ is a file path.",
		),
	reportPath: z
		.string()
		.optional()
		.describe(
			"Path where the subagent must write its JSON report. Must not already exist and must be outside the repository worktree; a fresh path is required for every attempt.",
		),
});

export const runnerBeginResultSchema = z.object({
	slug: z.string(),
	mode: z.enum(["default", "recover"]),
	baseBranch: z.string(),
	headAtDispatch: z.string(),
	changedPaths: z.array(z.string()),
	objectivePath: z.string(),
	reportPath: z.string(),
	prompt: z.string(),
});

export type RunnerBeginRequest = z.infer<typeof runnerBeginRequestSchema>;
export type RunnerBeginResult = z.infer<typeof runnerBeginResultSchema>;

/**
 * Runs the begin bookend: request hygiene, preconditions, prompt construction.
 *
 * Exit mapping mirrors `runner-step` (ADR 0022/0024): `usageError` for
 * malformed requests with nothing dispatched, `negative` for LBYL refusals,
 * `failure` for infrastructure errors, `ok` with the step facts otherwise.
 */
export async function runRunnerBegin(
	ctx: ObjectiveRunnerCoreContext,
	request: RunnerBeginRequest,
): Promise<ClinkrExit<RunnerBeginResult>> {
	if (request.slug === undefined) {
		return usageError("Objective slug is required.", { argument: "slug" });
	}
	const slug = request.slug;
	const mode: RunnerStepMode = request.recover ? "recover" : "default";

	if (request.reportPath === undefined) {
		return usageError("--report-path is required.", { argument: "report-path" });
	}
	const reportPath = resolve(ctx.cwd, request.reportPath);
	if (isPathInsideRepo(reportPath, ctx.repoRoot)) {
		return usageError(
			`Report path ${reportPath} is inside the repository worktree; choose a path outside the repo so the report can never enter the gate's changed paths or the runner commit.`,
			{ argument: "report-path" },
		);
	}
	const existing = await ctx.readTextFile(reportPath);
	if (existing.type === "ok") {
		return usageError(
			`Report file ${reportPath} already exists; every attempt (including --recover re-dispatch) requires a fresh report path.`,
			{ argument: "report-path" },
		);
	}

	const guidance = await resolveGuidance({
		cwd: ctx.cwd,
		guidance: request.guidance,
		readTextFile: (path) => ctx.readTextFile(path),
	});
	if (guidance.type === "unreadable-file") {
		return usageError(`Could not read guidance file ${guidance.path}: ${guidance.message}`, {
			argument: "guidance",
		});
	}

	ctx.phase("checking-preconditions");
	const preconditions = await checkRunnerPreconditions(ctx, { slug, mode });
	if (preconditions.type === "usage-error") {
		return usageError(preconditions.message, { argument: "slug" });
	}
	if (preconditions.type === "refused") return negative(preconditions.message);
	if (preconditions.type === "failure") {
		return failure(preconditions.code, preconditions.message);
	}
	const { objectivePath, baseBranch, headAtDispatch, changedPaths } = preconditions.facts;

	const prompt = buildRunnerChildPrompt({
		slug,
		objectivePath,
		mode,
		baseBranch,
		reportChannel: { type: "json-file", reportPath },
		...optionalEntry("guidance", guidance.guidance),
		...(mode === "recover" ? { recoverContext: { branch: baseBranch, changedPaths } } : {}),
	});

	return ok({
		slug,
		mode,
		baseBranch,
		headAtDispatch,
		changedPaths: [...changedPaths],
		objectivePath,
		reportPath,
		prompt,
	});
}

/** Human/markdown debugging surface; the skill flow always uses --format json. */
export function renderRunnerBegin(result: RunnerBeginResult): string {
	const lines = [
		`# Runner Begin: ${result.slug} (${result.mode})`,
		"",
		`- base branch: ${result.baseBranch}`,
		`- head at dispatch: ${result.headAtDispatch}`,
		`- objective record: ${result.objectivePath}`,
		`- report path: ${result.reportPath}`,
	];
	if (result.changedPaths.length > 0) {
		lines.push(`- changed paths (${result.changedPaths.length}):`);
		for (const path of result.changedPaths) lines.push(`  - ${path}`);
	}
	lines.push("", "## Subagent prompt", "", "````text", result.prompt, "````");
	return lines.join("\n");
}

export function isPathInsideRepo(path: string, repoRoot: string): boolean {
	const relativePath = relative(repoRoot, path);
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
