import { z } from "zod";

import type { ObjectiveMarkdownReadResult } from "../storage.ts";

/**
 * Shared check-item shape for `ns objective check`: the per-record file and
 * heading lints and the edge/blocked structural lint both report through this
 * one row type so per-slug checks and the repo-wide sweep aggregate uniformly.
 */

export const objectiveCheckItemSchema = z.object({
	path: z.string(),
	label: z.string(),
	isPassed: z.boolean(),
	severity: z.enum(["error", "warning"]),
	detail: z.string(),
});

export type ObjectiveCheckItem = z.infer<typeof objectiveCheckItemSchema>;

export function checkItem(options: {
	path: string;
	label: string;
	isPassed: boolean;
	severity: ObjectiveCheckItem["severity"];
	passDetail: string;
	failDetail: string;
}): ObjectiveCheckItem {
	return {
		path: options.path,
		label: options.label,
		isPassed: options.isPassed,
		severity: options.severity,
		detail: options.isPassed ? options.passDetail : options.failDetail,
	};
}

export function objectiveMdExistsCheck(options: {
	recordRelativePath: string;
	isPresent: boolean;
}): ObjectiveCheckItem {
	return checkItem({
		path: `${options.recordRelativePath}/objective.md`,
		label: "objective.md exists",
		isPassed: options.isPresent,
		severity: "error",
		passDetail: "present",
		failDetail: "missing",
	});
}

export function objectiveMdReadableCheck(options: {
	path: string;
	read: Exclude<ObjectiveMarkdownReadResult, { type: "missing" }>;
}): ObjectiveCheckItem {
	return checkItem({
		path: options.path,
		label: "objective.md is readable Markdown",
		isPassed: options.read.type === "ok",
		severity: "error",
		passDetail: "readable",
		failDetail: options.read.type === "ok" ? "unreadable" : options.read.message,
	});
}

export function countIssues(
	checks: readonly ObjectiveCheckItem[],
	severity: ObjectiveCheckItem["severity"],
): number {
	return checks.filter((check) => !check.isPassed && check.severity === severity).length;
}
