import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { createDeferred } from "@sdl/core/testing";
import { describe, expect, test } from "vitest";

import {
	checkLogUnavailableReason,
	githubActionsJobLogArgs,
	isIncompleteCheck,
	splitLogLines,
} from "../src/pr-preview-checks-command.ts";
import { buildCheckRowLabel, type PrPreviewCheck } from "../src/pr-preview-checks-model.ts";
import {
	checkListRows,
	PrPreviewChecksView,
	type PrPreviewChecksViewModel,
} from "../src/pr-preview-checks-view.ts";

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

	test("explains canceled check logs without calling gh", () => {
		const lines = checkLogUnavailableReason({
			...previewCheck("review"),
			workflow_name: "roaster",
			conclusion: "CANCELED",
		});

		expect(lines).toEqual([
			"Logs are not available because this check was canceled.",
			"",
			"Check: roaster / review",
			"Conclusion: CANCELED",
			"GitHub can omit job logs for checks that never ran or were canceled before log upload.",
		]);
	});

	test("caches loaded log summaries by selected check", async () => {
		const alpha = previewCheck("alpha-check");
		const beta = previewCheck("beta-check");
		const alphaSummary = createDeferred<readonly string[]>();
		const loadCalls: string[] = [];
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: previewModel([alpha, beta]),
			onClose: () => {},
			onLoadLogs: (check) => {
				loadCalls.push(check.name);
				return check === alpha
					? alphaSummary.promise
					: Promise.resolve([`summary for ${check.name}`]);
			},
		});

		view.handleInput("l");
		view.handleInput("j");
		alphaSummary.resolve(["summary for alpha-check"]);
		await flushPromises();

		expect(renderText(view)).toContain("alpha-check");
		expect(renderText(view)).toContain("beta-check");
		expect(selectedDetailsText(view)).toContain("beta-check");
		expect(selectedDetailsText(view)).not.toContain("summary for alpha-check");

		view.handleInput("k");
		expect(selectedDetailsText(view)).toContain("summary for alpha-check");

		view.handleInput("l");
		expect(loadCalls).toEqual(["alpha-check"]);
	});

	test("releases loading state when a log summary request times out", async () => {
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: previewModel([previewCheck("stuck-check")]),
			onClose: () => {},
			onLoadLogs: (_check, options) =>
				new Promise<readonly string[]>((_resolve, reject) => {
					options.signal.addEventListener("abort", () => reject(options.signal.reason), {
						once: true,
					});
				}),
			logLoadTimeoutMs: 1,
		});

		view.handleInput("l");
		expect(selectedDetailsText(view)).toContain("Loading and summarizing selected check logs");

		await sleep(5);
		await flushPromises();

		expect(selectedDetailsText(view)).toContain("Log summary timed out after 1s");
		expect(selectedDetailsText(view)).not.toContain("Loading and summarizing selected check logs");
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

function previewCheck(name: string): PrPreviewCheck {
	return {
		bucket: "failing",
		kind: "check_run",
		name,
		workflow_name: "ci",
		status: "COMPLETED",
		conclusion: "FAILURE",
		state: null,
		started_at: null,
		completed_at: null,
		created_at: null,
		details_url: null,
		target_url: null,
		identity: null,
	};
}

function previewModel(checks: readonly PrPreviewCheck[]): PrPreviewChecksViewModel {
	return {
		target: {
			pr_number: 123,
			title: "Preview checks",
			url: null,
			branch: "feature/checks",
			head_ref_name: "feature/checks",
			base_ref_name: "main",
			head_ref_oid: null,
		},
		counts: { failing: checks.length, pending: 0, unknown: 0, passing: 0 },
		fetchedAt: new Date("2026-06-25T00:00:00Z"),
		checks,
	};
}

function fakeTui(): TUI {
	return {
		terminal: { rows: 18 },
		requestRender() {},
	} as TUI;
}

function identityTheme(): Theme {
	return {
		fg(_color: string, text: string): string {
			return text;
		},
		bg(_color: string, text: string): string {
			return text;
		},
	} as Theme;
}

async function flushPromises(): Promise<void> {
	for (let index = 0; index < 3; index++) await Promise.resolve();
}

async function sleep(timeoutMs: number): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
}

function renderText(view: PrPreviewChecksView): string {
	return view.render(120).join("\n");
}

function selectedDetailsText(view: PrPreviewChecksView): string {
	const lines = view.render(120);
	const detailsIndex = lines.findIndex((line) => line.includes("Selected check details"));
	return lines.slice(Math.max(0, detailsIndex)).join("\n");
}
