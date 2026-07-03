import { describeBranchContextGraphiteCreationSteps } from "@sdl/branch-context/api";

import type { RunnerStepMode } from "./context.ts";
// ADR0024-LEGACY-DELETE(import): marker constants feed only the legacy marker
// report channel below; this import goes when the marker arm goes.
import { OBJECTIVE_RUNNER_REPORT_BEGIN, OBJECTIVE_RUNNER_REPORT_END } from "./report-marker.ts";

// Ported from the autopilot prototype's stack-navigation rule: the runner
// owns commit/verify, so the child must never reshape or navigate the
// Graphite stack mid-step.
const RUNNER_GRAPHITE_STACK_NAVIGATION_RULE =
	"Do not run `gt create`, `gt checkout`, `gt restack`, or any command whose purpose is to rebase/reorder or navigate the Graphite stack; after Graphite tracking succeeds, use plain `git switch` instead of `gt checkout` because Graphite checkout may demand a restack when a downstack branch is behind trunk. If a branch appears to need restacking, report it and stop.";

export interface RunnerRecoverContext {
	branch: string;
	changedPaths: readonly string[];
}

/**
 * How the child returns its report: a marker-delimited block in its final
 * message (legacy `runner-step`) or a JSON document written to a
 * begin-chosen file path (`runner-begin`, ADR 0024).
 *
 * ADR0024-LEGACY-DELETE(the `marker` variant): when the legacy command goes,
 * collapse this option to a plain `reportPath: string`, delete the marker
 * branches in `rules`/`finalReportRule`/`reportContract`, and drop the
 * report-marker import above.
 */
export type RunnerReportChannel = { type: "marker" } | { type: "json-file"; reportPath: string };

export interface BuildRunnerChildPromptOptions {
	slug: string;
	objectivePath: string;
	mode: RunnerStepMode;
	baseBranch: string;
	reportChannel: RunnerReportChannel;
	guidance?: string;
	recoverContext?: RunnerRecoverContext;
}

/**
 * Builds the thin child prompt for one Objective Runner step.
 *
 * Deliberately thin: it points the child at the Objective record and the
 * repo's existing workflows/skills instead of inlining Objective content, and
 * it carries no tracking-update instruction — Semantic Update judgment
 * belongs to the parent (ADR 0022).
 */
export function buildRunnerChildPrompt(options: BuildRunnerChildPromptOptions): string {
	const parts = [
		"You are a fresh child implementation session for one Objective Runner step.",
		"",
		`Objective: ${options.slug}`,
		`Objective record: ${options.objectivePath}`,
		`Base branch at dispatch: ${options.baseBranch}`,
	];
	if (options.recoverContext !== undefined) {
		parts.push("", recoverPreamble(options.recoverContext));
	}
	parts.push("", "Rules:", rules(options), "", reportContract(options.mode, options.reportChannel));
	if (options.guidance !== undefined) {
		parts.push("", "Parent guidance (follow it within the rules above):", options.guidance);
	}
	return parts.join("\n");
}

function rules(options: BuildRunnerChildPromptOptions): string {
	const branchRules =
		options.mode === "recover"
			? [
					"- Stay on the current branch. Do not create branches, switch branches, or reset the worktree; repair the existing attempt in place.",
				]
			: [
					`- Create your own implementation branch before changing files. ${describeBranchContextGraphiteCreationSteps(options.baseBranch)}`,
					"- After creating the implementation branch, do not switch branches again for the rest of the step.",
				];
	return [
		"- Operate only in the current repository/worktree.",
		"- Implement exactly one focused, coherent implementation slice for the Objective above.",
		"- Load Objective context yourself: follow the repo's objective-next workflow and existing skills for this Objective. Do not expect Objective content in this prompt.",
		...branchRules,
		`- ${RUNNER_GRAPHITE_STACK_NAVIGATION_RULE}`,
		"- Leave ALL changes uncommitted. Never run `git commit`, `git commit --amend`, `git push`, or anything that submits, merges, or publishes; the runner owns staging and commit.",
		`- Run the repository's checks and deterministic fixers for the files you changed, per the repo's prose validation policy, and report what you ran and the results in the ${
			options.reportChannel.type === "marker" ? "`## Validation`" : "`validation`"
		} section of your report.`,
		finalReportRule(options.reportChannel),
	].join("\n");
}

function finalReportRule(reportChannel: RunnerReportChannel): string {
	if (reportChannel.type === "marker") {
		return "- Finish your final response with exactly one report block in the format below.";
	}
	return `- Finish by writing your report as a single JSON document to \`${reportChannel.reportPath}\` — create exactly that file, containing only the JSON document (no markdown fences, no commentary). The path is outside the repository on purpose; never add it to git. Then end your final response with a 1-3 sentence summary of what you did; the summary is informational only, the JSON file is the contract.`;
}

function recoverPreamble(recoverContext: RunnerRecoverContext): string {
	const changedPathLines =
		recoverContext.changedPaths.length === 0
			? ["- (none recorded)"]
			: recoverContext.changedPaths.map((path) => `- ${path}`);
	const parts = [
		"Recovery mode: a previous runner step failed and left uncommitted work behind.",
		`You are on the dirty branch \`${recoverContext.branch}\`. Repair the attempt on this same branch.`,
		"Changed paths left by the failed attempt:",
		...changedPathLines,
	];
	return parts.join("\n");
}

function reportContract(mode: RunnerStepMode, reportChannel: RunnerReportChannel): string {
	if (reportChannel.type === "json-file") {
		return jsonReportContract(mode, reportChannel.reportPath);
	}
	const branchLine =
		mode === "recover" ? "branch: <the current branch>" : "branch: <your implementation branch>";
	return [
		"Report block format (all header fields and all five sections are mandatory unless marked optional; keep it concise):",
		"",
		OBJECTIVE_RUNNER_REPORT_BEGIN,
		"status: ready-for-parent-commit | stop | blocked",
		branchLine,
		"roadmapItems:",
		"- <roadmap item this slice advanced>",
		"commitSubject: <proposed commit subject line; required when status is ready-for-parent-commit>",
		"commitBody:",
		"- <optional commit body bullet; omit the field when you have none>",
		"stopReason: <why, when status is stop or blocked; omit otherwise>",
		"",
		"## Summary",
		"<what you did>",
		"",
		"## Objective Impact",
		"<claimed impact on the Objective roadmap>",
		"",
		"## Risks/Blockers",
		"<risks or blockers, or 'none'>",
		"",
		"## Follow-Ups",
		"<follow-up work you deferred, or 'none'>",
		"",
		"## Validation",
		"<commands you ran with results, including any deterministic fixes performed>",
		OBJECTIVE_RUNNER_REPORT_END,
	].join("\n");
}

function jsonReportContract(mode: RunnerStepMode, reportPath: string): string {
	const branchValue = mode === "recover" ? "<the current branch>" : "<your implementation branch>";
	return [
		`Report file format (a single JSON document at \`${reportPath}\`; all fields and all five sections are mandatory unless marked optional; keep it concise):`,
		"",
		"```json",
		"{",
		'  "status": "<ready-for-parent-commit | stop | blocked>",',
		`  "branch": "${branchValue}",`,
		'  "roadmapItems": ["<roadmap item this slice advanced>"],',
		'  "commitSubject": "<proposed commit subject line; required when status is ready-for-parent-commit>",',
		'  "commitBody": "<optional commit body; omit the field when you have none>",',
		'  "stopReason": "<why, when status is stop or blocked; omit otherwise>",',
		'  "sections": {',
		'    "summary": "<what you did>",',
		'    "objectiveImpact": "<claimed impact on the Objective roadmap>",',
		'    "risksBlockers": "<risks or blockers, or \'none\'>",',
		'    "followUps": "<follow-up work you deferred, or \'none\'>",',
		'    "validation": "<commands you ran with results, including any deterministic fixes performed>"',
		"  }",
		"}",
		"```",
	].join("\n");
}
