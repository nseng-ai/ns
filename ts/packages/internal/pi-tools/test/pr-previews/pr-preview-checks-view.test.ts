import type { TUI } from "@earendil-works/pi-tui";
import { createDeferred } from "@nseng-ai/foundation/test-kit";
import { describe, expect, test } from "vitest";

import {
	checkLogUnavailableReason,
	githubActionsJobLogArgs,
	isIncompleteCheck,
	splitLogLines,
} from "../../src/pr-previews/preview-check-logs.ts";
import {
	buildCheckRowLabel,
	buildStackEntryRowLabel,
	compactCountsSummary,
	type PrPreviewCheck,
	type PrPreviewChecksStackEntry,
} from "../../src/pr-previews/preview-checks-model.ts";
import {
	checkListRows,
	PrPreviewChecksView,
	type PrPreviewChecksViewModel,
} from "../../src/pr-previews/preview-checks-view.ts";
import { OVERLAY_MARGIN_ROWS, OVERLAY_MAX_HEIGHT_RATIO } from "../../src/overlay-kit/frame.ts";
import { identityTheme, taggingTheme } from "./preview-test-themes.ts";

describe("PR checks preview vertical layout", () => {
	test("allocates rows for a full-width check list above selected details", () => {
		expect(checkListRows({ totalRows: 20, checkCount: 12 })).toBe(11);
		expect(checkListRows({ totalRows: 8, checkCount: 12 })).toBe(4);
		expect(checkListRows({ totalRows: 8, checkCount: 1 })).toBe(1);
	});

	test("renders stack PRs above checks and details", () => {
		const firstCheck = previewCheck("typescript");
		const secondCheck = {
			...previewCheck("docs-build"),
			bucket: "passing",
		} satisfies PrPreviewCheck;
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: stackPreviewModel([
				stackEntry("feature/base", 101, [firstCheck]),
				stackEntry("feature/top", 102, [secondCheck]),
			]),
			onClose: () => {},
		});

		const text = renderText(view);
		expect(text).toContain("Stack checks preview · 2 PRs");
		expect(text).toContain("PR #101 · ✗1 · feature/base");
		expect(text).toContain("PR #102 · ✓1 · feature/top");
		expect(text).toContain("Selected stack PR checks");
		expect(selectedDetailsText(view)).toContain("typescript");
	});

	test("keeps shortcut footer inside the host overlay budget", () => {
		const terminalRows = 40;
		const view = new PrPreviewChecksView({
			tui: fakeTui(terminalRows),
			theme: identityTheme(),
			model: stackPreviewModel([
				stackEntry("feature/base", 101, [previewCheck("base-check")]),
				stackEntry("feature/top", 102, [previewCheck("top-check")]),
			]),
			onClose: () => {},
		});

		const rendered = view.render(120);
		const overlayRows = Math.min(
			Math.floor(terminalRows * OVERLAY_MAX_HEIGHT_RATIO),
			terminalRows - 2 * OVERLAY_MARGIN_ROWS,
		);

		expect(rendered).toHaveLength(overlayRows);
		expect(rendered.at(-2)).toContain("↑↓/jk PRs");
		expect(rendered.at(-1)).toContain("└");
	});

	test("navigates stack PRs with j/k before drilling into checks", () => {
		const baseCheck = previewCheck("base-check");
		const topCheck = { ...previewCheck("top-check"), bucket: "passing" } satisfies PrPreviewCheck;
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: stackPreviewModel([
				stackEntry("feature/base", 101, [baseCheck]),
				stackEntry("feature/top", 102, [topCheck]),
			]),
			onClose: () => {},
		});

		expect(renderText(view)).toContain("◆ PR #101");
		expect(renderText(view)).toContain("↑↓/jk PRs");
		expect(selectedDetailsText(view)).toContain("base-check");

		view.handleInput("j");
		expect(renderText(view)).toContain("◆ PR #102");
		expect(selectedDetailsText(view)).toContain("top-check");

		view.handleInput("k");
		expect(renderText(view)).toContain("◆ PR #101");
		expect(selectedDetailsText(view)).toContain("base-check");
	});

	test("drills into checks with enter and returns to PRs with h", () => {
		const alpha = previewCheck("alpha-check");
		const beta = { ...previewCheck("beta-check"), bucket: "passing" } satisfies PrPreviewCheck;
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: stackPreviewModel([
				stackEntry("feature/base", 101, [alpha, beta]),
				stackEntry("feature/top", 102, [previewCheck("top-check")]),
			]),
			onClose: () => {},
		});

		view.handleInput("\r");
		expect(renderText(view)).toContain("←/h or tab PR list");
		view.handleInput("j");
		expect(selectedDetailsText(view)).toContain("beta-check");
		expect(renderText(view)).toContain("◆ PR #101");

		view.handleInput("h");
		view.handleInput("j");
		expect(renderText(view)).toContain("◆ PR #102");
		expect(selectedDetailsText(view)).toContain("top-check");
	});

	test("keeps l for log summaries only after drilling into checks", () => {
		const loadCalls: string[] = [];
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: stackPreviewModel([
				stackEntry("feature/base", 101, [previewCheck("alpha-check")]),
				stackEntry("feature/top", 102, [previewCheck("top-check")]),
			]),
			onClose: () => {},
			onLoadLogs: (check) => {
				loadCalls.push(check.name);
				return Promise.resolve([`summary for ${check.name}`]);
			},
		});

		view.handleInput("l");
		expect(loadCalls).toEqual([]);
		view.handleInput("l");
		expect(loadCalls).toEqual(["alpha-check"]);

		view.handleInput("\t");
		view.handleInput("j");
		expect(renderText(view)).toContain("◆ PR #102");
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

	test("colors failing check rows distinctly from passing ones", () => {
		const failing = previewCheck("typescript");
		const passing: PrPreviewCheck = {
			...failing,
			name: "docs-build",
			bucket: "passing",
			conclusion: "SUCCESS",
		};
		const otherPassing: PrPreviewCheck = { ...passing, name: "areg-check" };
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: taggingTheme(),
			model: previewModel([failing, passing, otherPassing]),
			onClose: () => {},
		});
		view.handleInput("j");
		view.handleInput("j");

		const text = renderText(view);
		expect(text).toContain("<b>[error]");
		expect(text).toContain("[dim]");
	});

	test("compacts counts into severity-ordered badges omitting zero buckets", () => {
		expect(compactCountsSummary({ failing: 1, pending: 2, unknown: 3, passing: 4 })).toBe(
			"✗1 ⏳2 ?3 ✓4",
		);
		expect(compactCountsSummary({ failing: 0, pending: 1, unknown: 0, passing: 11 })).toBe(
			"⏳1 ✓11",
		);
		expect(compactCountsSummary({ failing: 0, pending: 0, unknown: 0, passing: 12 })).toBe("✓12");
		expect(compactCountsSummary({ failing: 0, pending: 0, unknown: 0, passing: 0 })).toBe(
			"no checks",
		);
		expect(
			compactCountsSummary({ failing: 1, pending: 0, unknown: 0, passing: 9, hasMore: true }),
		).toBe("✗1 ✓9+");
	});

	test("places the count badge between the PR number and the title", () => {
		const base = stackEntry("feature/base", 2903, [
			previewCheck("typescript"),
			{ ...previewCheck("docs-build"), bucket: "passing" } satisfies PrPreviewCheck,
		]);
		const entry = {
			...base,
			target: { ...base.target, title: "Flow land: use branch-only Graphite restacks" },
		} satisfies PrPreviewChecksStackEntry;

		expect(buildStackEntryRowLabel(entry)).toBe(
			"PR #2903 · ✗1 ✓1 · Flow land: use branch-only Graphite restacks · feature/base → main",
		);
	});

	test("keeps count badges visible when narrow widths truncate stack rows", () => {
		const base = stackEntry("flow-land-large-stack-performance/targeted-graphite-refresh", 2903, [
			previewCheck("typescript"),
		]);
		const entry = {
			...base,
			target: {
				...base.target,
				title: "Flow land: use branch-only Graphite restacks for large stack preflight refresh",
			},
		} satisfies PrPreviewChecksStackEntry;
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: identityTheme(),
			model: stackPreviewModel([entry, stackEntry("feature/top", 2904, [])]),
			onClose: () => {},
		});

		const text = view.render(60).join("\n");
		expect(text).toContain("PR #2903 · ✗1 ·");
	});

	test("renders check log summary markdown bold headings and code spans", async () => {
		const check = previewCheck("typescript");
		const view = new PrPreviewChecksView({
			tui: fakeTui(),
			theme: taggingTheme(),
			model: previewModel([check]),
			onClose: () => {},
			onLoadLogs: () => Promise.resolve(["**Failure:** `oxfmt --check` failed"]),
		});

		view.handleInput("l");
		await flushPromises();

		const details = selectedDetailsText(view);
		expect(details).toContain("<b>[mdHeading]Failure:[/]</b>");
		expect(details).toContain("[mdCode]oxfmt --check[/]");
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

function stackPreviewModel(stack: readonly PrPreviewChecksStackEntry[]): PrPreviewChecksViewModel {
	const first = stack[0] ?? stackEntry("feature/checks", 123, []);
	return {
		target: first.target,
		counts: { failing: 1, pending: 0, unknown: 0, passing: 1 },
		fetchedAt: new Date("2026-06-25T00:00:00Z"),
		checks: stack.flatMap((entry) => [...entry.checks]),
		stack,
	};
}

function stackEntry(
	branch: string,
	prNumber: number,
	checks: readonly PrPreviewCheck[],
): PrPreviewChecksStackEntry {
	return {
		target: {
			pr_number: prNumber,
			title: branch,
			url: null,
			branch,
			head_ref_name: branch,
			base_ref_name: "main",
			head_ref_oid: null,
		},
		counts: {
			failing: checks.filter((check) => check.bucket === "failing").length,
			pending: checks.filter((check) => check.bucket === "pending").length,
			unknown: checks.filter((check) => check.bucket === "unknown").length,
			passing: checks.filter((check) => check.bucket === "passing").length,
		},
		checks,
	};
}

function fakeTui(rows = 18): TUI {
	return {
		terminal: { rows },
		requestRender() {},
	} as TUI;
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
