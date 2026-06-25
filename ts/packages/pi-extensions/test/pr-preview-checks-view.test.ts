import { describe, expect, test } from "vitest";

import {
	githubActionsJobLogArgs,
	isIncompleteCheck,
	splitLogLines,
} from "../src/pr-preview-checks-command.ts";
import { buildCheckRowLabel } from "../src/pr-preview-checks-model.ts";
import { checkListRows } from "../src/pr-preview-checks-view.ts";

describe("PR checks preview vertical layout", () => {
	test("allocates rows for a full-width check list above selected details", () => {
		expect(checkListRows({ totalRows: 20, checkCount: 12 })).toBe(11);
		expect(checkListRows({ totalRows: 8, checkCount: 12 })).toBe(4);
		expect(checkListRows({ totalRows: 8, checkCount: 1 })).toBe(1);
	});

	test("derives gh job log args from GitHub Actions job URLs", () => {
		expect(
			githubActionsJobLogArgs(
				"https://github.com/dagster-io/sdl-tools/actions/runs/28133533837/job/83315158463",
			),
		).toEqual(["run", "view", "28133533837", "--job", "83315158463", "--log"]);
		expect(githubActionsJobLogArgs("https://example.com/not/actions")).toBeNull();
		expect(githubActionsJobLogArgs(null)).toBeNull();
	});

	test("detects checks whose logs are not ready", () => {
		expect(
			isIncompleteCheck({
				bucket: "pending",
				kind: "check_run",
				name: "docs-build",
				workflow_name: "ci",
				status: "IN_PROGRESS",
				conclusion: null,
				state: null,
				started_at: null,
				completed_at: null,
				created_at: null,
				details_url: null,
				target_url: null,
				identity: null,
			}),
		).toBe(true);
	});

	test("normalizes gh log tabs before modal rendering", () => {
		expect(splitLogLines("typescript\tSet up job\t2026-06-24T22:51:33Z message")).toEqual([
			"typescript  Set up job  2026-06-24T22:51:33Z message",
		]);
	});

	test("keeps long check names available for full-width row rendering", () => {
		const label = buildCheckRowLabel({
			bucket: "failing",
			kind: "check_run",
			name: "very long integration test name that should not be pre-truncated by the model",
			workflow_name: "CI",
			status: "COMPLETED",
			conclusion: "FAILURE",
			state: null,
			started_at: null,
			completed_at: null,
			created_at: null,
			details_url: null,
			target_url: null,
			identity: null,
		});

		expect(label).toContain("very long integration test name that should not be pre-truncated");
		expect(label).not.toContain("…");
	});
});
