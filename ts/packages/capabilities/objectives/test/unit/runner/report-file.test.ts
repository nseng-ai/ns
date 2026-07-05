import { describe, expect, test } from "vitest";

import { renderRunnerReportNarrative } from "../../../src/runner/report.ts";
import { parseRunnerReportJson } from "../../../src/runner/report-file.ts";

function validReadyReport(): Record<string, unknown> {
	return {
		status: "ready-for-parent-commit",
		branch: "feature/slice-1",
		roadmapItems: ["Ship the thing"],
		commitSubject: "Ship the thing",
		commitBody: "- detail one\n- detail two",
		sections: {
			summary: "Did the thing.",
			objectiveImpact: "Advances the roadmap.",
			risksBlockers: "none",
			followUps: "none",
			validation: "just ts-check passed",
		},
	};
}

function problemsOf(result: ReturnType<typeof parseRunnerReportJson>): readonly string[] {
	if (result.type !== "invalid") throw new Error(`Expected invalid, got ${result.type}`);
	return result.problems;
}

describe("parseRunnerReportJson", () => {
	test("parses a ready-for-parent-commit report with all fields", () => {
		const result = parseRunnerReportJson(JSON.stringify(validReadyReport()));
		expect(result).toEqual({
			type: "ok",
			report: {
				status: "ready-for-parent-commit",
				branch: "feature/slice-1",
				roadmapItems: ["Ship the thing"],
				commitSubject: "Ship the thing",
				commitBody: "- detail one\n- detail two",
				sections: {
					summary: "Did the thing.",
					objectiveImpact: "Advances the roadmap.",
					risksBlockers: "none",
					followUps: "none",
					validation: "just ts-check passed",
				},
			},
		});
	});

	test("parses stop and blocked reports without commitSubject and omits absent optionals", () => {
		for (const status of ["stop", "blocked"] as const) {
			const raw: Record<string, unknown> = {
				...validReadyReport(),
				status,
				stopReason: "scope boundary reached",
			};
			delete raw.commitSubject;
			delete raw.commitBody;
			const result = parseRunnerReportJson(JSON.stringify(raw));
			expect(result.type).toBe("ok");
			if (result.type !== "ok") continue;
			expect(result.report.status).toBe(status);
			expect(result.report.stopReason).toBe("scope boundary reached");
			expect("commitSubject" in result.report).toBe(false);
			expect("commitBody" in result.report).toBe(false);
		}
	});

	test("stopReason stays optional even for stop/blocked (parity with the marker contract)", () => {
		const raw: Record<string, unknown> = { ...validReadyReport(), status: "stop" };
		delete raw.commitSubject;
		delete raw.commitBody;
		const result = parseRunnerReportJson(JSON.stringify(raw));
		expect(result.type).toBe("ok");
		if (result.type === "ok") expect("stopReason" in result.report).toBe(false);
	});

	test("invalid JSON is a single fail-closed problem, not tolerated", () => {
		const fenced = "```json\n{}\n```";
		for (const text of ["not json", fenced, ""]) {
			const problems = problemsOf(parseRunnerReportJson(text));
			expect(problems).toHaveLength(1);
			expect(problems[0]).toMatch(/^Report file is not valid JSON: /);
		}
	});

	test("non-object JSON documents are invalid", () => {
		for (const text of ["[]", '"report"', "42", "null"]) {
			expect(parseRunnerReportJson(text).type).toBe("invalid");
		}
	});

	test("every missing field and section accumulates its own problem in one pass", () => {
		const problems = problemsOf(parseRunnerReportJson("{}"));
		for (const path of ["status", "branch", "roadmapItems", "sections"]) {
			expect(problems.some((problem) => problem.includes(path))).toBe(true);
		}
		expect(problems.length).toBeGreaterThanOrEqual(4);
	});

	test("each missing section produces its own problem", () => {
		const raw = validReadyReport();
		raw.sections = { summary: "ok" };
		const problems = problemsOf(parseRunnerReportJson(JSON.stringify(raw)));
		for (const section of ["objectiveImpact", "risksBlockers", "followUps", "validation"]) {
			expect(problems.some((problem) => problem.includes(`sections.${section}`))).toBe(true);
		}
	});

	test("empty sections and empty roadmapItems are problems", () => {
		const raw = validReadyReport();
		raw.roadmapItems = [];
		raw.sections = {
			summary: "",
			objectiveImpact: "ok",
			risksBlockers: "ok",
			followUps: "ok",
			validation: "ok",
		};
		const problems = problemsOf(parseRunnerReportJson(JSON.stringify(raw)));
		expect(problems.some((problem) => problem.includes("roadmapItems"))).toBe(true);
		expect(problems.some((problem) => problem.includes("sections.summary"))).toBe(true);
	});

	test("invalid status value is rejected", () => {
		const raw = { ...validReadyReport(), status: "done" };
		const problems = problemsOf(parseRunnerReportJson(JSON.stringify(raw)));
		expect(problems.some((problem) => problem.includes("status"))).toBe(true);
	});

	test("commitSubject is required exactly when status is ready-for-parent-commit", () => {
		const raw = validReadyReport();
		delete raw.commitSubject;
		const problems = problemsOf(parseRunnerReportJson(JSON.stringify(raw)));
		expect(problems).toEqual(["commitSubject: Required when status is ready-for-parent-commit."]);
	});

	test("unknown extra keys are stripped, not fatal", () => {
		const raw = { ...validReadyReport(), slug: "extra", somethingElse: 1 };
		const result = parseRunnerReportJson(JSON.stringify(raw));
		expect(result.type).toBe("ok");
		if (result.type === "ok") expect("slug" in result.report).toBe(false);
	});

	test("a parsed report round-trips through renderRunnerReportNarrative", () => {
		const result = parseRunnerReportJson(JSON.stringify(validReadyReport()));
		if (result.type !== "ok") throw new Error("expected ok");
		const narrative = renderRunnerReportNarrative(result.report);
		expect(narrative).toContain("## Summary\n\nDid the thing.");
		expect(narrative).toContain("## Validation\n\njust ts-check passed");
	});
});
