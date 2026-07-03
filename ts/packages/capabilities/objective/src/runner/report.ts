/**
 * Shared child-report contract: the typed report shape, statuses, mandated
 * narrative sections, and the checkpoint narrative renderer. Both report
 * media consume this module — the JSON report file (`report-file.ts`, the
 * ADR 0024 flow) and the legacy marker-block parser (`report-marker.ts`,
 * deleted with the blocking `runner-step`).
 */

export const RUNNER_REPORT_STATUSES = ["ready-for-parent-commit", "stop", "blocked"] as const;
export type RunnerReportStatus = (typeof RUNNER_REPORT_STATUSES)[number];

export const RUNNER_REPORT_SECTION_TITLES = [
	"Summary",
	"Objective Impact",
	"Risks/Blockers",
	"Follow-Ups",
	"Validation",
] as const;
export type RunnerReportSectionTitle = (typeof RUNNER_REPORT_SECTION_TITLES)[number];

export interface RunnerReportSections {
	summary: string;
	objectiveImpact: string;
	risksBlockers: string;
	followUps: string;
	validation: string;
}

export interface RunnerReport {
	status: RunnerReportStatus;
	branch: string;
	roadmapItems: readonly string[];
	/** Present exactly when status is `ready-for-parent-commit`. */
	commitSubject?: string;
	/** Optional `- ` list lines joined with newlines. */
	commitBody?: string;
	stopReason?: string;
	sections: RunnerReportSections;
}

export const RUNNER_REPORT_COMMIT_SUBJECT_REQUIRED_REASON =
	"required when status is ready-for-parent-commit";
export const RUNNER_REPORT_COMMIT_SUBJECT_REQUIRED_MESSAGE =
	"Required when status is ready-for-parent-commit.";

export interface BuildRunnerReportOptions {
	status: RunnerReportStatus;
	branch: string;
	roadmapItems: readonly string[];
	commitSubject?: string;
	commitBody?: string;
	stopReason?: string;
	sections: RunnerReportSections;
}

export type ParseRunnerReportResult =
	| { type: "ok"; report: RunnerReport }
	| { type: "invalid"; problems: readonly string[] }
	| { type: "missing" };

/** Reconstructs the five mandated sections as the child stated them. */
export function renderRunnerReportNarrative(report: RunnerReport): string {
	const bodies: Record<RunnerReportSectionTitle, string> = {
		Summary: report.sections.summary,
		"Objective Impact": report.sections.objectiveImpact,
		"Risks/Blockers": report.sections.risksBlockers,
		"Follow-Ups": report.sections.followUps,
		Validation: report.sections.validation,
	};
	return RUNNER_REPORT_SECTION_TITLES.map((title) => `## ${title}\n\n${bodies[title]}`).join(
		"\n\n",
	);
}

export function isRunnerReportStatus(value: string): value is RunnerReportStatus {
	return (RUNNER_REPORT_STATUSES as readonly string[]).includes(value);
}

export function requiresCommitSubject(status: RunnerReportStatus): boolean {
	return status === "ready-for-parent-commit";
}

export function buildRunnerReport(options: BuildRunnerReportOptions): RunnerReport {
	return {
		status: options.status,
		branch: options.branch,
		roadmapItems: [...options.roadmapItems],
		...(options.commitSubject === undefined ? {} : { commitSubject: options.commitSubject }),
		...(options.commitBody === undefined ? {} : { commitBody: options.commitBody }),
		...(options.stopReason === undefined ? {} : { stopReason: options.stopReason }),
		sections: options.sections,
	};
}
