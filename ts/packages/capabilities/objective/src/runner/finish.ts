/**
 * `runner-finish` operation (ADR 0024): validates the parent-held step facts
 * and the subagent-written JSON report fail-closed, then follows the ADR 0022
 * terminal paths unchanged — stop/blocked passthrough, five-part verification
 * gate, runner-owned commit with provenance trailers, two-zone Runner
 * Checkpoint. Run by the parent, never the subagent.
 *
 * The step.ts helpers this ports (liveBranchDisplay, checkpoint stdout, result
 * building) are deliberately duplicated, not shared: step.ts is deleted with
 * the legacy blocking command once the decomposed flow has dogfooding mileage.
 */
import { resolve } from "node:path";

import { failure, negative, ok, usageError, type ClinkrExit } from "@sdl/clinkr";
import { optionalEntry } from "@sdl/core/primitives";
import { z } from "zod";

import { isPathInsideRepo } from "./begin.ts";
import {
	renderRunnerCheckpoint,
	type CheckpointFacts,
	type RunnerCheckpointStatus,
} from "./checkpoint.ts";
import { commitRunnerStep } from "./commit.ts";
import type { ObjectiveRunnerCoreContext } from "./context.ts";
import {
	GATE_CHECK_IDS,
	GATE_CHECK_STATUSES,
	verifyRunnerStep,
	type GateBranchUnavailableReason,
} from "./gate.ts";
import { parseRunnerReportJson } from "./report-file.ts";
import { renderRunnerReportNarrative, type RunnerReport } from "./report.ts";

export const runnerFinishRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug the step was begun for."),
	facts: z
		.string()
		.optional()
		.describe(
			"Step facts from runner-begin: a value starting with @ is a file path to the saved output; otherwise inline JSON.",
		),
	report: z
		.string()
		.optional()
		.describe(
			"Subagent report: a value starting with @ is a file path; otherwise inline JSON. Defaults to the report path recorded in the facts.",
		),
});

/**
 * The subset of runner-begin's output the finish bookend verifies against.
 * Unknown keys (prompt, changedPaths, objectivePath, envelope bookkeeping)
 * are deliberately stripped.
 */
export const runnerStepFactsSchema = z.object({
	slug: z.string(),
	mode: z.enum(["default", "recover"]),
	baseBranch: z.string(),
	headAtDispatch: z.string(),
	reportPath: z.string(),
});

/**
 * Accepts the saved runner-begin machine envelope or its bare data object. A
 * saved non-ok envelope fails both branches: facts must record a successful
 * begin.
 */
const factsInputSchema = z.union([
	z.object({ status: z.literal("ok"), data: runnerStepFactsSchema }),
	runnerStepFactsSchema,
]);

export type RunnerStepFacts = z.infer<typeof runnerStepFactsSchema>;

export const finishGateCheckResultSchema = z.object({
	id: z.enum(GATE_CHECK_IDS),
	status: z.enum(GATE_CHECK_STATUSES),
	detail: z.string().optional(),
});

const runnerFinishStatusSchema = z.enum([
	"committed",
	"stop",
	"blocked",
	"verification-failed",
	"malfunction",
]);

export const runnerFinishResultSchema = z.object({
	slug: z.string(),
	mode: z.enum(["default", "recover"]),
	status: runnerFinishStatusSchema,
	baseBranch: z.string(),
	branch: z.string(),
	commitSha: z.string().nullable(),
	changedPaths: z.array(z.string()),
	gateChecks: z.array(finishGateCheckResultSchema),
	stopReason: z.string().nullable(),
	diagnostics: z.array(z.string()),
	checkpointMarkdown: z.string(),
});

export type RunnerFinishRequest = z.infer<typeof runnerFinishRequestSchema>;
export type RunnerFinishResult = z.infer<typeof runnerFinishResultSchema>;

/**
 * Runs the finish bookend.
 *
 * Exit mapping preserves ADR 0022 semantics: `ok` = committed/stop; `negative`
 * = blocked/verification-failed (checkpoint tactically written to stdout for
 * human/markdown modes, suppressed in JSON mode); `failure` = malfunction
 * (missing/invalid report, commit failure) with a best-effort checkpoint;
 * `usageError` = malformed control-plane input (slug/facts problems) where
 * nothing about the work was judged.
 */
export async function runRunnerFinish(
	ctx: ObjectiveRunnerCoreContext,
	request: RunnerFinishRequest,
): Promise<ClinkrExit<RunnerFinishResult>> {
	if (request.slug === undefined) {
		return usageError("Objective slug is required.", { argument: "slug" });
	}
	const slug = request.slug;
	if (request.facts === undefined) {
		return usageError("--facts is required (the saved runner-begin output).", {
			argument: "facts",
		});
	}

	ctx.phase("validating-inputs");
	const factsText = await resolveValueOrFile(ctx, request.facts);
	if (factsText.type === "error") {
		return usageError(`Could not read facts file ${factsText.path}: ${factsText.message}`, {
			argument: "facts",
		});
	}
	let factsJson: unknown;
	try {
		factsJson = JSON.parse(factsText.content);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return usageError(`Facts are not valid JSON: ${message}`, { argument: "facts" });
	}
	const factsParsed = factsInputSchema.safeParse(factsJson);
	if (!factsParsed.success) {
		return usageError(
			"Facts do not match a successful runner-begin output (expected its machine envelope or bare data object).",
			{ argument: "facts", issues: factsParsed.error.issues },
		);
	}
	const facts: RunnerStepFacts =
		"data" in factsParsed.data ? factsParsed.data.data : factsParsed.data;
	if (facts.slug !== slug) {
		return usageError(
			`Facts record slug ${JSON.stringify(facts.slug)} but the command was invoked for ${JSON.stringify(slug)}.`,
			{ argument: "slug" },
		);
	}
	const { mode, baseBranch, headAtDispatch } = facts;

	const buildCheckpointResult = (
		checkpointFacts: Omit<CheckpointFacts, "slug" | "mode" | "baseBranch">,
		narrative: string | undefined,
	): RunnerFinishResult => {
		const fullFacts: CheckpointFacts = { slug, mode, baseBranch, ...checkpointFacts };
		return buildResult(fullFacts, renderRunnerCheckpoint(fullFacts, narrative));
	};

	const emitMalfunction = async (
		errorType: string,
		message: string,
		options: { diagnostics?: readonly string[]; narrative?: string; branch?: string } = {},
	): Promise<ClinkrExit<RunnerFinishResult>> => {
		const result = buildCheckpointResult(
			{
				status: "malfunction",
				branch: options.branch ?? (await liveBranchDisplay(ctx)),
				diagnostics: [message, ...(options.diagnostics ?? [])],
			},
			options.narrative,
		);
		emitCheckpointStdout(ctx, result);
		return failure(errorType, message, result);
	};

	const reportSource = request.report ?? `@${facts.reportPath}`;
	let reportText: string;
	if (reportSource.startsWith("@")) {
		const reportPath = resolve(ctx.cwd, reportSource.slice(1));
		if (isPathInsideRepo(reportPath, ctx.repoRoot)) {
			return usageError(
				`Report path ${reportPath} is inside the repository worktree; runner reports must live outside the repo.`,
				{ argument: "report" },
			);
		}
		const read = await ctx.readTextFile(reportPath);
		if (read.type === "error") {
			return emitMalfunction(
				"report-missing",
				`Could not read the subagent report at ${reportPath}: ${read.message}`,
			);
		}
		reportText = read.content;
	} else {
		reportText = reportSource;
	}

	const parsed = parseRunnerReportJson(reportText);
	if (parsed.type === "missing") {
		return emitMalfunction("report-integrity", "Subagent report is empty.");
	}
	if (parsed.type === "invalid") {
		return emitMalfunction("report-integrity", "Subagent report failed integrity checks.", {
			diagnostics: parsed.problems,
		});
	}
	const report: RunnerReport = parsed.report;
	const narrative = renderRunnerReportNarrative(report);

	if (report.status === "stop" || report.status === "blocked") {
		const status: RunnerCheckpointStatus = report.status;
		// Deliberate improvement over the legacy step: stop/blocked checkpoints
		// carry the live changed paths so a stopping child's droppings are
		// visible in the verified zone.
		const liveStatus = await ctx.git.statusPaths({ cwd: ctx.repoRoot });
		const result = buildCheckpointResult(
			{
				status,
				branch: await liveBranchDisplay(ctx),
				...(liveStatus.ok ? { changedPaths: liveStatus.value.changedPaths } : {}),
				...optionalEntry("stopReason", report.stopReason),
			},
			narrative,
		);
		if (status === "stop") return ok(result);
		emitCheckpointStdout(ctx, result);
		const reason = report.stopReason === undefined ? "" : `: ${report.stopReason}`;
		return negative(`Child reported blocked${reason}.`, { data: result });
	}

	ctx.phase("verifying");
	const gate = await verifyRunnerStep(ctx, { mode, report, baseBranch, headAtDispatch });
	const gateBranchDisplay =
		gate.branch ?? formatGateBranchUnavailable(gate.branchUnavailableReason);
	if (!gate.hasPassed) {
		const failedChecks = gate.checks.filter((check) => check.status === "failed");
		const result = buildCheckpointResult(
			{
				status: "verification-failed",
				branch: gateBranchDisplay,
				changedPaths: gate.changedPaths,
				gateChecks: gate.checks,
			},
			narrative,
		);
		emitCheckpointStdout(ctx, result);
		return negative(
			`Verification failed: ${failedChecks.length} of ${gate.checks.length} gate check(s) failed (${failedChecks.map((check) => check.id).join(", ")}).`,
			{ data: result },
		);
	}

	const commitSubject = report.commitSubject;
	if (commitSubject === undefined) {
		// The report schema requires commitSubject when status is
		// ready-for-parent-commit; reaching this is a report-integrity
		// malfunction, kept for type narrowing.
		return emitMalfunction(
			"report-integrity",
			"Report is ready-for-parent-commit but carries no commitSubject.",
			{ narrative, branch: gateBranchDisplay },
		);
	}

	ctx.phase("committing");
	const commit = await commitRunnerStep(ctx, {
		slug,
		mode,
		subject: commitSubject,
		...optionalEntry("body", report.commitBody),
	});
	if (commit.type === "error") {
		return emitMalfunction(commit.code, `Runner commit failed: ${commit.message}`, {
			narrative,
			branch: gateBranchDisplay,
		});
	}

	return ok(
		buildCheckpointResult(
			{
				status: "committed",
				branch: gateBranchDisplay,
				commitSha: commit.commitSha,
				changedPaths: gate.changedPaths,
				gateChecks: gate.checks,
			},
			narrative,
		),
	);
}

type ValueOrFileResult =
	| { type: "ok"; content: string }
	| { type: "error"; path: string; message: string };

/** `@`-prefixed values are file paths resolved against cwd; otherwise inline. */
async function resolveValueOrFile(
	ctx: ObjectiveRunnerCoreContext,
	value: string,
): Promise<ValueOrFileResult> {
	if (!value.startsWith("@")) return { type: "ok", content: value };
	const path = resolve(ctx.cwd, value.slice(1));
	const read = await ctx.readTextFile(path);
	if (read.type === "error") return { type: "error", path, message: read.message };
	return { type: "ok", content: read.content };
}

function buildResult(facts: CheckpointFacts, checkpointMarkdown: string): RunnerFinishResult {
	return {
		slug: facts.slug,
		mode: facts.mode,
		status: facts.status,
		baseBranch: facts.baseBranch,
		branch: facts.branch,
		commitSha: facts.commitSha ?? null,
		changedPaths: [...(facts.changedPaths ?? [])],
		gateChecks: (facts.gateChecks ?? []).map((check) => ({ ...check })),
		stopReason: facts.stopReason ?? null,
		diagnostics: [...(facts.diagnostics ?? [])],
		checkpointMarkdown,
	};
}

async function liveBranchDisplay(ctx: ObjectiveRunnerCoreContext): Promise<string> {
	const current = await ctx.git.currentBranch({ cwd: ctx.repoRoot });
	if (current.type === "branch") return current.branch;
	if (current.type === "detached") return "unknown (detached HEAD)";
	return `unknown (could not determine branch: ${current.error.message})`;
}

function formatGateBranchUnavailable(reason: GateBranchUnavailableReason | null): string {
	if (reason?.type === "failure") {
		return `unknown (could not determine branch: ${reason.message})`;
	}
	return "unknown (detached HEAD)";
}

function emitCheckpointStdout(ctx: ObjectiveRunnerCoreContext, result: RunnerFinishResult): void {
	if (ctx.outputFormat === "json") return;
	ctx.writeStdout(result.checkpointMarkdown);
}
