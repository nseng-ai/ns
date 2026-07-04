/**
 * JSON report contract for the decomposed runner step (ADR 0024).
 *
 * The subagent writes one JSON document to the begin-chosen report path; this
 * module validates it fail-closed. Validation is deliberately diagnostic-rich:
 * every missing/empty field and section becomes its own problem so a
 * report-integrity malfunction checkpoint can list them all, matching the
 * marker-block parser's behavior in `report-marker.ts`.
 */
import { formatZodIssue } from "@ns/core/primitives";
import { z } from "zod";

import {
	buildRunnerReport,
	requiresCommitSubject,
	RUNNER_REPORT_COMMIT_SUBJECT_REQUIRED_REASON,
	RUNNER_REPORT_STATUSES,
	type ParseRunnerReportResult,
} from "./report.ts";

export const runnerReportJsonSchema = z
	.object({
		status: z.enum(RUNNER_REPORT_STATUSES),
		branch: z.string().min(1, "Branch must not be empty."),
		roadmapItems: z
			.array(z.string().min(1, "Roadmap items must not be empty."))
			.min(1, "At least one roadmap item is required."),
		commitSubject: z.string().min(1, "Commit subject must not be empty.").optional(),
		commitBody: z.string().min(1, "Commit body must not be empty when present.").optional(),
		stopReason: z.string().min(1, "Stop reason must not be empty when present.").optional(),
		sections: z.object({
			summary: z.string().min(1, "Section must not be empty."),
			objectiveImpact: z.string().min(1, "Section must not be empty."),
			risksBlockers: z.string().min(1, "Section must not be empty."),
			followUps: z.string().min(1, "Section must not be empty."),
			validation: z.string().min(1, "Section must not be empty."),
		}),
	})
	.superRefine((report, ctx) => {
		if (requiresCommitSubject(report.status) && report.commitSubject === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["commitSubject"],
				message: commitSubjectRequiredMessage(),
			});
		}
	});

/**
 * Parses and validates the subagent-written report file contents.
 *
 * Fail-closed: unparseable JSON and every schema violation return `invalid`
 * with all problems accumulated (Zod reports every issue in one pass). The
 * `missing` variant is reserved for the caller's file-not-found path; this
 * function always has text to judge.
 */
export function parseRunnerReportJson(text: string): ParseRunnerReportResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { type: "invalid", problems: [`Report file is not valid JSON: ${message}`] };
	}
	const result = runnerReportJsonSchema.safeParse(parsed);
	if (!result.success) {
		return {
			type: "invalid",
			problems: result.error.issues.map((issue) => formatZodIssue(issue, { rootPath: null })),
		};
	}
	return { type: "ok", report: buildRunnerReportFromJson(result.data) };
}

function commitSubjectRequiredMessage(): string {
	return `${RUNNER_REPORT_COMMIT_SUBJECT_REQUIRED_REASON.slice(0, 1).toUpperCase()}${RUNNER_REPORT_COMMIT_SUBJECT_REQUIRED_REASON.slice(1)}.`;
}

function buildRunnerReportFromJson(data: z.infer<typeof runnerReportJsonSchema>) {
	return buildRunnerReport({
		status: data.status,
		branch: data.branch,
		roadmapItems: data.roadmapItems,
		...(data.commitSubject === undefined ? {} : { commitSubject: data.commitSubject }),
		...(data.commitBody === undefined ? {} : { commitBody: data.commitBody }),
		...(data.stopReason === undefined ? {} : { stopReason: data.stopReason }),
		sections: data.sections,
	});
}
