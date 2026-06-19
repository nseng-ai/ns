import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

const completeObjective = `# Alpha

## Thesis

Ship the thing.

## Scope

In scope.

## Non-Goals

Out of scope.

## Completion Criteria

Done when checked.

## Assumptions and Risks

Risks.

## Open Questions

None.
`;

const completeRoadmap = `# Roadmap

## Work

- [ ] Do it.

## Parked

Nothing.
`;

const completeUpdate = `# Progress

## Summary

Summary.

## Objective Impact

Impact.

## Follow-Ups

None.
`;

describe("objective check", () => {
	test("passes a complete open Objective record", async () => {
		const run = runScenario(["check", "alpha", "--format", "json"], {
			fake: {
				records: [
					{
						slug: "alpha",
						objectiveMd: completeObjective,
						roadmapMd: completeRoadmap,
						updates: { "progress.md": completeUpdate },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 0,
			data: {
				status: "ok",
				error: null,
				rootPath: ".asdl/objectives",
				hasRoot: true,
				slug: "alpha",
				path: ".asdl/objectives/alpha",
				hasRecord: true,
				isClosed: false,
				files: {
					objectiveMd: true,
					roadmapMd: true,
					updatesDir: true,
					closedMd: false,
				},
				updates: [{ name: "progress.md", path: ".asdl/objectives/alpha/updates/progress.md" }],
				updateCount: 1,
				errorCount: 0,
				warningCount: 0,
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("fails when required files and headings are missing", async () => {
		const run = runScenario(["check", "partial", "--format", "json"], {
			fake: {
				directories: [".asdl/objectives/partial"],
				files: { ".asdl/objectives/partial/objective.md": "# Partial\n" },
			},
		});

		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({
			exit_code: 1,
			message: "Objective check failed for slug 'partial': 8 error(s), 0 warning(s).",
			data: {
				status: "failed",
				error: "check_failed",
				slug: "partial",
				errorCount: 8,
				warningCount: 0,
			},
		});
		expect(JSON.stringify(output)).toContain("roadmap.md exists");
		expect(JSON.stringify(output)).toContain("updates/ directory exists");
		expect(JSON.stringify(output)).toContain("objective.md has ## Thesis");
	});

	test("requires closure prose for closed Objectives", async () => {
		const run = runScenario(["check", "done", "--format", "json"], {
			fake: {
				records: [
					{
						slug: "done",
						objectiveMd: completeObjective,
						roadmapMd: completeRoadmap,
						isClosed: true,
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 1,
			message: "Objective check failed for slug 'done': 1 error(s), 0 warning(s).",
			data: {
				status: "failed",
				isClosed: true,
				errorCount: 1,
				warningCount: 0,
			},
		});
	});

	test("missing and invalid slugs return stable negative envelopes", async () => {
		const missing = runScenario(["check", "--format", "json"]);
		expect(await missing.exit).toBe(0);
		expect(parseJsonOutput(missing)).toMatchObject({
			exit_code: 1,
			message: "Missing Objective slug. Pass an explicit slug.",
			data: { status: "missing_slug", error: "missing_slug" },
		});

		const invalid = runScenario(["check", "foo/bar", "--format", "json"]);
		expect(await invalid.exit).toBe(0);
		expect(parseJsonOutput(invalid)).toMatchObject({
			exit_code: 1,
			message: "Invalid Objective slug 'foo/bar'. Pass a single slug, not a path.",
			data: { status: "invalid_slug", error: "invalid_slug" },
		});
	});
});
