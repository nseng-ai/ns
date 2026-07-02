import { describe, expect, test } from "vitest";

import {
	OBJECTIVE_RUNNER_REPORT_BEGIN,
	OBJECTIVE_RUNNER_REPORT_END,
	parseRunnerReport,
	renderRunnerReportNarrative,
} from "../../../src/runner/report.ts";
import { childReportText } from "./context.ts";

describe("parseRunnerReport", () => {
	test("parses a complete ready-for-parent-commit report", () => {
		const parsed = parseRunnerReport(
			childReportText({
				branch: "feature/step-1",
				roadmapItems: ["Slice 1", "Slice 1 docs"],
				commitSubject: "Add slice one",
				commitBody: ["Introduce the widget", "Cover it with tests"],
				sectionOverrides: { Summary: "Did the thing.\nAcross two lines." },
			}),
		);

		expect(parsed).toEqual({
			type: "ok",
			report: {
				status: "ready-for-parent-commit",
				branch: "feature/step-1",
				roadmapItems: ["Slice 1", "Slice 1 docs"],
				commitSubject: "Add slice one",
				commitBody: "Introduce the widget\nCover it with tests",
				sections: {
					summary: "Did the thing.\nAcross two lines.",
					objectiveImpact: "Objective Impact content.",
					risksBlockers: "Risks/Blockers content.",
					followUps: "Follow-Ups content.",
					validation: "Validation content.",
				},
			},
		});
	});

	test("parses a stop report without commitSubject and keeps stopReason", () => {
		const parsed = parseRunnerReport(
			childReportText({ status: "stop", stopReason: "roadmap is exhausted" }),
		);

		expect(parsed.type).toBe("ok");
		if (parsed.type !== "ok") throw new Error("expected ok parse");
		expect(parsed.report.status).toBe("stop");
		expect(parsed.report.stopReason).toBe("roadmap is exhausted");
		expect(parsed.report.commitSubject).toBeUndefined();
		expect(parsed.report.commitBody).toBeUndefined();
	});

	test("returns missing when there is no marker block", () => {
		expect(parseRunnerReport("no report here")).toEqual({ type: "missing" });
	});

	test("returns missing when the end marker precedes the begin marker", () => {
		expect(
			parseRunnerReport(
				`${OBJECTIVE_RUNNER_REPORT_END}\nstatus: stop\n${OBJECTIVE_RUNNER_REPORT_BEGIN}`,
			),
		).toEqual({ type: "missing" });
	});

	test("collects every problem instead of stopping at the first", () => {
		const text = [
			OBJECTIVE_RUNNER_REPORT_BEGIN,
			"roadmapItems:",
			"",
			"## Summary",
			"",
			"## Objective Impact",
			"content",
			"",
			"## Follow-Ups",
			"content",
			OBJECTIVE_RUNNER_REPORT_END,
		].join("\n");

		const parsed = parseRunnerReport(text);

		expect(parsed.type).toBe("invalid");
		if (parsed.type !== "invalid") throw new Error("expected invalid parse");
		expect(parsed.problems).toEqual([
			"Missing required header field `status`.",
			"Missing required header field `branch`.",
			"Missing or empty required header list `roadmapItems`.",
			"Section `## Summary` is empty.",
			"Missing required section `## Risks/Blockers`.",
			"Missing required section `## Validation`.",
		]);
	});

	test("rejects an unknown status value", () => {
		const parsed = parseRunnerReport(childReportText().replace("ready-for-parent-commit", "done"));

		expect(parsed.type).toBe("invalid");
		if (parsed.type !== "invalid") throw new Error("expected invalid parse");
		expect(parsed.problems).toContain(
			'Invalid `status` value "done"; expected one of: ready-for-parent-commit | stop | blocked.',
		);
	});

	test("requires commitSubject when status is ready-for-parent-commit", () => {
		const parsed = parseRunnerReport(childReportText({ omitCommitSubject: true }));

		expect(parsed.type).toBe("invalid");
		if (parsed.type !== "invalid") throw new Error("expected invalid parse");
		expect(parsed.problems).toEqual([
			"Missing required header field `commitSubject` (required when status is ready-for-parent-commit).",
		]);
	});

	test("flags an empty section", () => {
		const parsed = parseRunnerReport(childReportText({ sectionOverrides: { Validation: "" } }));

		expect(parsed).toEqual({
			type: "invalid",
			problems: ["Section `## Validation` is empty."],
		});
	});

	test("renderRunnerReportNarrative reconstructs the five sections", () => {
		const parsed = parseRunnerReport(childReportText());
		if (parsed.type !== "ok") throw new Error("expected ok parse");

		const narrative = renderRunnerReportNarrative(parsed.report);

		expect(narrative).toBe(
			[
				"## Summary\n\nSummary content.",
				"## Objective Impact\n\nObjective Impact content.",
				"## Risks/Blockers\n\nRisks/Blockers content.",
				"## Follow-Ups\n\nFollow-Ups content.",
				"## Validation\n\nValidation content.",
			].join("\n\n"),
		);
	});
});
