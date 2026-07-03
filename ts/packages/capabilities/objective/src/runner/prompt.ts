import { describeBranchContextGraphiteCreationSteps } from "@ns/branch-context/api";

import type { RunnerStepMode } from "./context.ts";
// ADR0024-LEGACY-DELETE(import): marker constants feed only the legacy marker
// report channel below; this import goes when the marker arm goes.
import { OBJECTIVE_RUNNER_REPORT_BEGIN, OBJECTIVE_RUNNER_REPORT_END } from "./report-marker.ts";

// Ported from the autopilot prototype's stack-navigation rule: the runner
// owns commit/verify, so the child must never reshape or navigate the
// Graphite stack mid-step.
const RUNNER_GRAPHITE_STACK_NAVIGATION_RULE =
	"Do not run `gt create`, `gt checkout`, `gt restack`, or any command whose purpose is to rebase/reorder or navigate the Graphite stack; after Graphite tracking succeeds, use plain `git switch` instead of `gt checkout` because Graphite checkout may demand a restack when a downstack branch is behind trunk. If a branch appears to need restacking, report it and stop.";

interface ReportFieldDescriptor {
	markerLine: string;
	jsonLine: string;
}

interface ReportSectionDescriptor {
	markerHeading: string;
	jsonKey: string;
	placeholder: string;
}

interface ReportChannelDescriptor {
	validationSectionLabel: string;
	finalReportRule: string;
	contract(mode: RunnerStepMode): string;
}

const REPORT_SECTION_DESCRIPTORS: readonly ReportSectionDescriptor[] = [
	{ markerHeading: "## Summary", jsonKey: "summary", placeholder: "<what you did>" },
	{
		markerHeading: "## Objective Impact",
		jsonKey: "objectiveImpact",
		placeholder: "<claimed impact on the Objective roadmap>",
	},
	{
		markerHeading: "## Risks/Blockers",
		jsonKey: "risksBlockers",
		placeholder: "<risks or blockers, or 'none'>",
	},
	{
		markerHeading: "## Follow-Ups",
		jsonKey: "followUps",
		placeholder: "<follow-up work you deferred, or 'none'>",
	},
	{
		markerHeading: "## Validation",
		jsonKey: "validation",
		placeholder: "<commands you ran with results, including any deterministic fixes performed>",
	},
] as const;

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
	const reportDescriptor = reportChannelDescriptor(options.reportChannel);
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
	parts.push(
		"",
		"Rules:",
		rules(options, reportDescriptor),
		"",
		reportDescriptor.contract(options.mode),
	);
	if (options.guidance !== undefined) {
		parts.push("", "Parent guidance (follow it within the rules above):", options.guidance);
	}
	return parts.join("\n");
}

function rules(
	options: BuildRunnerChildPromptOptions,
	reportDescriptor: ReportChannelDescriptor,
): string {
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
		`- Run the repository's checks and deterministic fixers for the files you changed, per the repo's prose validation policy, and report what you ran and the results in the ${reportDescriptor.validationSectionLabel} section of your report.`,
		reportDescriptor.finalReportRule,
	].join("\n");
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

function reportChannelDescriptor(reportChannel: RunnerReportChannel): ReportChannelDescriptor {
	if (reportChannel.type === "marker") {
		return {
			validationSectionLabel: "`## Validation`",
			finalReportRule:
				"- Finish your final response with exactly one report block in the format below.",
			contract: markerReportContract,
		};
	}
	return {
		validationSectionLabel: "`validation`",
		finalReportRule: `- Finish by writing your report as a single JSON document to \`${reportChannel.reportPath}\` — create exactly that file, containing only the JSON document (no markdown fences, no commentary). The path is outside the repository on purpose; never add it to git. Then end your final response with a 1-3 sentence summary of what you did; the summary is informational only, the JSON file is the contract.`,
		contract: (mode) => jsonReportContract(mode, reportChannel.reportPath),
	};
}

function reportFieldDescriptors(mode: RunnerStepMode): readonly ReportFieldDescriptor[] {
	const branchMarkerValue =
		mode === "recover" ? "<the current branch>" : "<your implementation branch>";
	return [
		{
			markerLine: "status: ready-for-parent-commit | stop | blocked",
			jsonLine: '  "status": "<ready-for-parent-commit | stop | blocked>",',
		},
		{ markerLine: `branch: ${branchMarkerValue}`, jsonLine: `  "branch": "${branchMarkerValue}",` },
		{
			markerLine: "roadmapItems:\n- <roadmap item this slice advanced>",
			jsonLine: '  "roadmapItems": ["<roadmap item this slice advanced>"],',
		},
		{
			markerLine:
				"commitSubject: <proposed commit subject line; required when status is ready-for-parent-commit>",
			jsonLine:
				'  "commitSubject": "<proposed commit subject line; required when status is ready-for-parent-commit>",',
		},
		{
			markerLine: "commitBody:\n- <optional commit body bullet; omit the field when you have none>",
			jsonLine: '  "commitBody": "<optional commit body; omit the field when you have none>",',
		},
		{
			markerLine: "stopReason: <why, when status is stop or blocked; omit otherwise>",
			jsonLine: '  "stopReason": "<why, when status is stop or blocked; omit otherwise>",',
		},
	];
}

function markerReportContract(mode: RunnerStepMode): string {
	const lines = [
		"Report block format (all header fields and all five sections are mandatory unless marked optional; keep it concise):",
		"",
		OBJECTIVE_RUNNER_REPORT_BEGIN,
	];
	for (const field of reportFieldDescriptors(mode)) lines.push(...field.markerLine.split("\n"));
	lines.push("");
	for (const section of REPORT_SECTION_DESCRIPTORS) {
		lines.push(section.markerHeading, section.placeholder, "");
	}
	lines.push(OBJECTIVE_RUNNER_REPORT_END);
	return lines.join("\n");
}

function jsonReportContract(mode: RunnerStepMode, reportPath: string): string {
	const sectionLines = REPORT_SECTION_DESCRIPTORS.map((section, index) => {
		const comma = index === REPORT_SECTION_DESCRIPTORS.length - 1 ? "" : ",";
		return `    "${section.jsonKey}": "${section.placeholder}"${comma}`;
	});
	const jsonContent = [
		"{",
		...reportFieldDescriptors(mode).map((field) => field.jsonLine),
		'  "sections": {',
		...sectionLines,
		"  }",
		"}",
	].join("\n");
	return [
		`Report file format (a single JSON document at \`${reportPath}\`; all fields and all five sections are mandatory unless marked optional; keep it concise):`,
		"",
		buildFencedTextBlock(jsonContent, "json"),
	].join("\n");
}

function buildFencedTextBlock(content: string, language = "text"): string {
	const matches = content.match(/`+/gu) ?? [];
	const longestBacktickRun = Math.max(0, ...matches.map((match) => match.length));
	const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
	return `${fence}${language}\n${content}\n${fence}`;
}
