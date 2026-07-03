import { z } from "zod";

/**
 * Shared check-item shape for `sdl objective check`: the per-record file and
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

export function countIssues(
	checks: readonly ObjectiveCheckItem[],
	severity: ObjectiveCheckItem["severity"],
): number {
	return checks.filter((check) => !check.isPassed && check.severity === severity).length;
}
