import { describeBranchContextGraphiteCreationSteps } from "@nseng-ai/branch-context/api";
import { buildFencedTextBlock } from "@nseng-ai/foundation/primitives";

import type { RunnerStepMode } from "./context.ts";

// Ported from the autopilot prototype's stack-navigation rule: the runner
// owns commit/verify, so the child must never reshape or navigate the
// Graphite stack mid-step.
const RUNNER_GRAPHITE_STACK_NAVIGATION_RULE =
	"Do not run `gt create`, `gt checkout`, `gt restack`, or any command whose purpose is to rebase/reorder or navigate the Graphite stack; after Graphite tracking succeeds, use plain `git switch` instead of `gt checkout` because Graphite checkout may demand a restack when a downstack branch is behind trunk. If a branch appears to need restacking, report it and stop.";

export const OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE =
	"Do not push, submit, publish, merge, land, create or update pull requests, or perform any other write-capable external action — no `git push`, `gt submit`, `gh pr create`, `ns flow submit`, or PR mutation may leave the machine from an Objective Runner step; the runner owns staging and the local commit, and the parent owns any later push/submit/handoff decision after separate human authorization.";

interface ReportFieldDescriptor {
	key: string;
	value: string;
	jsonShape: "string" | "array";
}

interface ReportSectionDescriptor {
	title: string;
	placeholder: string;
}

const REPORT_SECTION_DESCRIPTORS: readonly ReportSectionDescriptor[] = [
	{ title: "Summary", placeholder: "<what you did>" },
	{
		title: "Objective Impact",
		placeholder: "<claimed impact on the Objective roadmap>",
	},
	{
		title: "Risks/Blockers",
		placeholder: "<risks or blockers, or 'none'>",
	},
	{
		title: "Follow-Ups",
		placeholder: "<follow-up work you deferred, or 'none'>",
	},
	{
		title: "Validation",
		placeholder: "<commands you ran with results, including any deterministic fixes performed>",
	},
] as const;

export interface RunnerRecoverContext {
	branch: string;
	changedPaths: readonly string[];
}

export interface BuildRunnerChildPromptOptions {
	slug: string;
	objectivePath: string;
	mode: RunnerStepMode;
	baseBranch: string;
	reportPath: string;
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
	parts.push(
		"",
		"Rules:",
		rules(options),
		"",
		jsonReportContract(options.mode, options.reportPath),
	);
	if (options.guidance !== undefined) {
		parts.push("", "Parent guidance (follow it within the rules above):", options.guidance);
	}
	return parts.join("\n");
}

function rules(options: BuildRunnerChildPromptOptions): string {
	const branchRules =
		options.mode === "recover"
			? [
					"- Stay on the current dirty implementation branch. Do not create branches, switch branches, or reset the worktree; repair the existing attempt in place.",
				]
			: [
					`- Create your own implementation branch before changing files. ${describeBranchContextGraphiteCreationSteps(options.baseBranch)}`,
					"- You own only that implementation branch for this step; the parent owns the base branch choice and any later step stacking decisions.",
					"- After creating the implementation branch, do not switch branches again for the rest of the step.",
				];
	return [
		"- Operate only in the current repository/worktree.",
		"- Implement exactly one focused, coherent implementation slice for the Objective above.",
		"- Load Objective context yourself: follow the repo's objective-next workflow and existing skills for this Objective. Do not expect Objective content in this prompt.",
		...branchRules,
		`- ${RUNNER_GRAPHITE_STACK_NAVIGATION_RULE}`,
		`- Leave ALL changes uncommitted. Never run \`git commit\`, \`git commit --amend\`, or any command that creates or rewrites commits. ${OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE}`,
		"- Run the repository's checks and deterministic fixers for the files you changed, per the repo's prose validation policy, and report what you ran and the results in the `validation` section of your report.",
		`- Finish by writing your report as a single JSON document to \`${options.reportPath}\` — create exactly that file, containing only the JSON document (no markdown fences, no commentary). The path is outside the repository on purpose; never add it to git. Then end your final response with a 1-3 sentence summary of what you did; the summary is informational only, the JSON file is the contract.`,
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

function reportFieldDescriptors(mode: RunnerStepMode): readonly ReportFieldDescriptor[] {
	const branchValue = mode === "recover" ? "the current branch" : "your implementation branch";
	return [
		{
			key: "status",
			value: "ready-for-parent-commit | stop | blocked",
			jsonShape: "string",
		},
		{
			key: "branch",
			value: branchValue,
			jsonShape: "string",
		},
		{
			key: "roadmapItems",
			value: "roadmap item this slice advanced",
			jsonShape: "array",
		},
		{
			key: "commitSubject",
			value: "proposed commit subject line; required when status is ready-for-parent-commit",
			jsonShape: "string",
		},
		{
			key: "commitBody",
			value: "optional commit body; omit the field when you have none",
			jsonShape: "string",
		},
		{
			key: "stopReason",
			value: "why, when status is stop or blocked; omit otherwise",
			jsonShape: "string",
		},
	];
}

function jsonFieldLine(field: ReportFieldDescriptor): string {
	const value = placeholder(field.value);
	if (field.jsonShape === "array") return `  "${field.key}": ["${value}"],`;
	return `  "${field.key}": "${value}",`;
}

function placeholder(value: string): string {
	return `<${value}>`;
}

function jsonKeyFromTitle(title: string): string {
	return title
		.split(/[^A-Za-z0-9]+/u)
		.filter((part) => part.length > 0)
		.map((part, index) => (index === 0 ? lowerFirst(part) : upperFirst(lowerFirst(part))))
		.join("");
}

function lowerFirst(value: string): string {
	return `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}

function upperFirst(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function jsonReportContract(mode: RunnerStepMode, reportPath: string): string {
	const sectionLines = REPORT_SECTION_DESCRIPTORS.map((section, index) => {
		const comma = index === REPORT_SECTION_DESCRIPTORS.length - 1 ? "" : ",";
		return `    "${jsonKeyFromTitle(section.title)}": "${section.placeholder}"${comma}`;
	});
	const jsonContent = [
		"{",
		...reportFieldDescriptors(mode).map((field) => jsonFieldLine(field)),
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
