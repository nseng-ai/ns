/**
 * ADR0024-LEGACY-DELETE(whole file): the legacy blocking `runner-step`
 * orchestration. Superseded by `begin.ts` + `finish.ts` around a harness
 * subagent. Grep `ADR0024-LEGACY-DELETE` for the complete deletion checklist.
 */
import { failure, negative, ok, usageError, type ClinkrExit } from "@sdl/clinkr";
import { optionalEntry } from "@sdl/core/primitives";
import { z } from "zod";

import {
	renderRunnerCheckpoint,
	type CheckpointFacts,
	type RunnerCheckpointStatus,
} from "./checkpoint.ts";
import { commitRunnerStep } from "./commit.ts";
import type { ObjectiveRunnerContext, RunnerStepMode } from "./context.ts";
import {
	GATE_CHECK_IDS,
	GATE_CHECK_STATUSES,
	verifyRunnerStep,
	type GateBranchUnavailableReason,
} from "./gate.ts";
import { checkRunnerPreconditions } from "./preconditions.ts";
import { buildRunnerChildPrompt } from "./prompt.ts";
import { parseRunnerReport } from "./report-marker.ts";
import { renderRunnerReportNarrative } from "./report.ts";
import {
	runnerSubagentUsageResultSchema,
	summarizeRunnerSubagentUsage,
} from "../core/operations/runner-subagent-usage.ts";

export const runnerStepRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to run one implementation step for."),
	recover: z
		.boolean()
		.default(false)
		.describe("Repair the dirty tree a failed step left behind instead of starting a fresh slice."),
	guidance: z
		.string()
		.optional()
		.describe(
			"Parent guidance passed verbatim to the child; a value starting with @ is a file path.",
		),
	model: z.string().optional().describe("Model override for the child session."),
	timeout: z.number().int().positive().default(3600).describe("Child session timeout in seconds."),
});

export const gateCheckResultSchema = z.object({
	id: z.enum(GATE_CHECK_IDS),
	status: z.enum(GATE_CHECK_STATUSES),
	detail: z.string().optional(),
});

const runnerStepStatusSchema = z.enum([
	"committed",
	"stop",
	"blocked",
	"verification-failed",
	"malfunction",
]);

export const runnerStepResultSchema = z.object({
	slug: z.string(),
	mode: z.enum(["default", "recover"]),
	status: runnerStepStatusSchema,
	baseBranch: z.string(),
	branch: z.string(),
	commitSha: z.string().nullable(),
	changedPaths: z.array(z.string()),
	gateChecks: z.array(gateCheckResultSchema),
	stopReason: z.string().nullable(),
	diagnostics: z.array(z.string()),
	usage: runnerSubagentUsageResultSchema.nullable(),
	checkpointMarkdown: z.string(),
});

export type RunnerStepRequest = z.infer<typeof runnerStepRequestSchema>;
export type RunnerStepResult = z.infer<typeof runnerStepResultSchema>;

/**
 * Runs one Objective Runner step end to end: preconditions, child dispatch,
 * report parsing, deterministic verification, runner-owned commit, and the
 * two-zone Runner Checkpoint.
 *
 * Exit mapping (ADR 0022): `ok` = committed/stop (checkpoint travels in
 * `result.checkpointMarkdown`, emitted by the command renderers); `negative` =
 * blocked/verification-failed (this operation tactically writes checkpoint
 * stdout for human/markdown modes and suppresses it in JSON mode); `failure` =
 * runner malfunction (best-effort checkpoint under the same stream rule);
 * `usageError` = malformed request with nothing dispatched.
 */
export async function runRunnerStep(
	ctx: ObjectiveRunnerContext,
	request: RunnerStepRequest,
): Promise<ClinkrExit<RunnerStepResult>> {
	if (request.slug === undefined) {
		return usageError("Objective slug is required.", { argument: "slug" });
	}
	const slug = request.slug;
	const mode: RunnerStepMode = request.recover ? "recover" : "default";

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
		reportChannel: { type: "marker" },
		...optionalEntry("guidance", request.guidance),
		...(mode === "recover" ? { recoverContext: { branch: baseBranch, changedPaths } } : {}),
	});

	ctx.phase("dispatching-child");
	const handle = ctx.childSession.dispatch({
		cwd: ctx.repoRoot,
		prompt,
		...optionalEntry("model", request.model),
		timeoutMs: request.timeout * 1000,
	});

	ctx.phase("awaiting-child");
	for await (const event of handle.events) {
		if (event.type === "activity") ctx.writeStderr(`${event.line}\n`);
		else ctx.writeStderr(event.text);
	}
	const outcome = await handle.outcome;

	const buildCheckpointResult = (
		facts: Omit<CheckpointFacts, "slug" | "mode" | "baseBranch">,
		narrative: string | undefined,
	): RunnerStepResult => {
		const checkpointFacts: CheckpointFacts = { slug, mode, baseBranch, ...facts };
		const checkpointMarkdown = renderRunnerCheckpoint(checkpointFacts, narrative);
		return buildResult(checkpointFacts, checkpointMarkdown);
	};

	const emitMalfunction = async (
		errorType: string,
		message: string,
		options: { diagnostics?: readonly string[]; narrative?: string; branch?: string } = {},
	): Promise<ClinkrExit<RunnerStepResult>> => {
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

	const emitChildFailure = (errorType: string, message: string, stderrTail: string) => {
		return emitMalfunction(errorType, message, {
			diagnostics: stderrTailDiagnostics(stderrTail),
		});
	};

	if (outcome.type === "startup-failed") {
		return emitMalfunction(
			"child-startup-failed",
			`Child session failed to start: ${outcome.message}`,
		);
	}
	if (outcome.type === "timed-out") {
		return emitChildFailure(
			"child-timed-out",
			`Child session timed out after ${request.timeout}s.`,
			outcome.stderrTail,
		);
	}
	if (outcome.type === "signaled") {
		const signalDisplay = outcome.signal ?? "unknown signal";
		return emitChildFailure(
			"child-signaled",
			`Child session exited after signal ${signalDisplay}.`,
			outcome.stderrTail,
		);
	}
	if (outcome.exitCode !== 0) {
		return emitChildFailure(
			"child-exit-nonzero",
			`Child session exited ${outcome.exitCode}.`,
			outcome.stderrTail,
		);
	}

	const parsed = parseRunnerReport(outcome.finalText);
	if (parsed.type === "missing") {
		return emitMalfunction("report-integrity", "Child did not produce a parseable report block.");
	}
	if (parsed.type === "invalid") {
		return emitMalfunction("report-integrity", "Child report failed integrity checks.", {
			diagnostics: parsed.problems,
		});
	}
	const report = parsed.report;
	const narrative = renderRunnerReportNarrative(report);

	if (report.status === "stop" || report.status === "blocked") {
		const status: RunnerCheckpointStatus = report.status;
		const result = buildCheckpointResult(
			{
				status,
				branch: await liveBranchDisplay(ctx),
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
		// The parser requires commitSubject when status is ready-for-parent-commit;
		// reaching this is a report-integrity malfunction, not a gate failure.
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
		changedPaths: gate.changedPaths,
	});
	if (commit.type === "error") {
		return emitMalfunction(commit.code, `Runner commit failed: ${commit.message}`, {
			narrative,
			branch: gateBranchDisplay,
		});
	}

	const usage =
		outcome.sessionFile === undefined
			? undefined
			: await summarizeRunnerSubagentUsage([outcome.sessionFile]);
	const result = buildCheckpointResult(
		{
			status: "committed",
			branch: gateBranchDisplay,
			commitSha: commit.commitSha,
			changedPaths: gate.changedPaths,
			gateChecks: gate.checks,
			...optionalEntry("usage", usage),
		},
		narrative,
	);
	return ok(result);
}

function buildResult(facts: CheckpointFacts, checkpointMarkdown: string): RunnerStepResult {
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
		usage: facts.usage ?? null,
		checkpointMarkdown,
	};
}

async function liveBranchDisplay(ctx: ObjectiveRunnerContext): Promise<string> {
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

function emitCheckpointStdout(ctx: ObjectiveRunnerContext, result: RunnerStepResult): void {
	if (ctx.outputFormat === "json") return;
	ctx.writeStdout(result.checkpointMarkdown);
}

function stderrTailDiagnostics(stderrTail: string): string[] {
	const trimmed = stderrTail.trim();
	return trimmed === "" ? [] : [`stderr tail:\n${trimmed}`];
}
