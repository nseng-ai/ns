import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";

import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";
import {
	buildStackDetailRows,
	buildStackRollupSegments,
	formatStackRowCells,
	rollupBucketForPr,
	sliceStackDetailLinesForViewport,
	stackListRows,
} from "../../src/stack-view/overlay-model.ts";
import {
	runStackViewOverlayUi,
	StackViewOverlay,
	type StackViewOverlayUiContext,
	type StackViewUiResult,
} from "../../src/stack-view/overlay-ui.ts";
import { identityTheme, taggingTheme } from "./stack-view-test-themes.ts";

const ESC = String.fromCharCode(27);
const KEY_PAGE_DOWN = `${ESC}[6~`;
const KEY_PAGE_UP = `${ESC}[5~`;

describe("overlay-model units", () => {
	describe("stackListRows", () => {
		test("keeps the list compact so the detail dominates", () => {
			expect(stackListRows({ bodyRows: 20, rowCount: 12 })).toBe(6);
			expect(stackListRows({ bodyRows: 8, rowCount: 12 })).toBe(3);
			expect(stackListRows({ bodyRows: 20, rowCount: 2 })).toBe(2);
		});

		test("never drops below 1 or exceeds max(1, bodyRows - 5) on tiny terminals", () => {
			for (let bodyRows = 1; bodyRows <= 6; bodyRows += 1) {
				const value = stackListRows({ bodyRows, rowCount: 12 });
				expect(value).toBeGreaterThanOrEqual(1);
				expect(value).toBeLessThanOrEqual(Math.max(1, bodyRows - 5));
			}
		});
	});

	describe("rollupBucketForPr", () => {
		test("walks the full status ladder and splits ready into pending vs ready", () => {
			expect(rollupBucketForPr(prFixture({ status: "no-pr", number: null }))).toBe("no-pr");
			expect(rollupBucketForPr(prFixture({ status: "draft" }))).toBe("draft");
			expect(rollupBucketForPr(prFixture({ status: "checks-failing" }))).toBe("failing");
			expect(rollupBucketForPr(prFixture({ status: "unresolved" }))).toBe("unresolved");
			expect(
				rollupBucketForPr(
					prFixture({ status: "ready", checks: { passing: 1, failing: 0, pending: 2, total: 3 } }),
				),
			).toBe("pending");
			expect(
				rollupBucketForPr(
					prFixture({ status: "ready", checks: { passing: 3, failing: 0, pending: 0, total: 3 } }),
				),
			).toBe("ready");
		});
	});

	describe("buildStackRollupSegments", () => {
		test("always emits the five core segments, omitting draft/no-pr when zero", () => {
			const segments = buildStackRollupSegments(
				modelFixture({ prs: [prFixture({ status: "ready" })] }),
			);
			const texts = segments.map((segment) => segment.text);
			expect(texts).toEqual(["1 PRs", "0 failing", "0 unresolved", "0 pending", "1 ready"]);
		});

		test("appends draft and no-pr segments when nonzero", () => {
			const segments = buildStackRollupSegments(
				modelFixture({
					prs: [
						prFixture({ status: "draft", isDraft: true }),
						prFixture({ status: "no-pr", number: null }),
					],
				}),
			);
			const texts = segments.map((segment) => segment.text);
			expect(texts).toContain("1 draft");
			expect(texts).toContain("1 no-pr");
		});
	});

	describe("formatStackRowCells", () => {
		test("omits badges on zero totals and renders both label forms", () => {
			const ready = formatStackRowCells(prFixture({ number: 12, title: "Add   widget\nfeature" }));
			expect(ready.label).toBe("#12 Add widget feature");
			expect(ready.threads).toBe("");
			expect(ready.checks).toBe("");
			expect(ready.statusWord).toBe("ready");

			const noPr = formatStackRowCells(
				prFixture({ number: null, branch: "feature/x", status: "no-pr" }),
			);
			expect(noPr.label).toBe("(no PR) feature/x");
		});

		test("prefers failing then pending then passing check cells", () => {
			expect(
				formatStackRowCells(prFixture({ checks: { passing: 1, failing: 2, pending: 3, total: 6 } }))
					.checks,
			).toBe("✗ 2/6");
			expect(
				formatStackRowCells(prFixture({ checks: { passing: 1, failing: 0, pending: 3, total: 4 } }))
					.checks,
			).toBe("⋯ 3/4");
			expect(
				formatStackRowCells(prFixture({ checks: { passing: 4, failing: 0, pending: 0, total: 4 } }))
					.checks,
			).toBe("✓ 4/4");
			expect(formatStackRowCells(prFixture({ threads: { resolved: 1, total: 3 } })).threads).toBe(
				"💬 1/3",
			);
		});
	});

	describe("buildStackDetailRows", () => {
		test("orders sections and formats thread locations", () => {
			const rows = buildStackDetailRows(
				prFixture({
					number: 7,
					title: "Detail  PR",
					branch: "feature/d",
					parentBranch: "main",
					graphiteUrl: "https://app.graphite.dev/pr/7",
					threads: { resolved: 1, total: 3 },
					checks: { passing: 2, failing: 1, pending: 1, total: 4 },
					checkEntries: [
						checkEntry({ name: "lint", workflowName: "CI", bucket: "failing" }),
						checkEntry({ name: "unit", workflowName: null, bucket: "pending" }),
					],
					unresolvedThreads: [
						threadDetail({ path: "src/a.ts", line: 10, author: "alice" }),
						threadDetail({ path: "src/b.ts", line: null, author: "bob" }),
					],
					objectiveSlugs: ["obj-a", "obj-b"],
				}),
			);
			const roles = rows.map((row) => row.role);
			expect(roles[0]).toBe("identity");
			expect(rows[0]?.text).toBe("#7 Detail PR");
			expect(rows[1]).toEqual({ role: "branch", text: "branch: feature/d → main" });
			expect(rows[2]).toEqual({ role: "url", text: "https://app.graphite.dev/pr/7" });

			const texts = rows.map((row) => row.text);
			expect(texts).toContain("FAILING CHECKS (1)");
			expect(texts).toContain("✗ lint (CI)");
			expect(texts).toContain("UNRESOLVED THREADS (2)");
			expect(texts).toContain("src/a.ts:10 · alice");
			expect(texts).toContain("src/b.ts · bob");
			expect(texts).toContain("PENDING CHECKS (1)");
			expect(texts).toContain("⋯ unit");
			expect(texts).toContain("✓ 2 passing");
			expect(texts).toContain("objectives: obj-a, obj-b");

			// section ordering: failing before unresolved before pending
			const failingIndex = texts.indexOf("FAILING CHECKS (1)");
			const unresolvedIndex = texts.indexOf("UNRESOLVED THREADS (2)");
			const pendingIndex = texts.indexOf("PENDING CHECKS (1)");
			expect(failingIndex).toBeLessThan(unresolvedIndex);
			expect(unresolvedIndex).toBeLessThan(pendingIndex);
		});

		test("drops author suffix and marks unknown paths", () => {
			const rows = buildStackDetailRows(
				prFixture({
					threads: { resolved: 0, total: 1 },
					unresolvedThreads: [threadDetail({ path: "", line: 5, author: null })],
				}),
			);
			expect(rows.map((row) => row.text)).toContain("(file unknown):5");
		});

		test("appends a truncation note when fetched threads fall short of the count", () => {
			const rows = buildStackDetailRows(
				prFixture({
					threads: { resolved: 0, total: 3 },
					unresolvedThreads: [threadDetail({ path: "src/a.ts", line: 1, author: "alice" })],
				}),
			);
			const truncation = rows.find((row) => row.role === "truncation-note");
			expect(truncation?.text).toBe("… 2 more not fetched");
		});

		test("omits empty sections entirely", () => {
			const rows = buildStackDetailRows(prFixture({ number: 3, title: "Clean" }));
			const texts = rows.map((row) => row.text);
			expect(texts.some((text) => text.startsWith("FAILING"))).toBe(false);
			expect(texts.some((text) => text.startsWith("UNRESOLVED"))).toBe(false);
			expect(texts.some((text) => text.startsWith("PENDING"))).toBe(false);
		});

		test("renders a placeholder for a PR-less row and for no selection", () => {
			const noPr = buildStackDetailRows(
				prFixture({ number: null, branch: "feature/z", objectiveSlugs: ["obj-z"] }),
			);
			expect(noPr[0]).toEqual({ role: "placeholder", text: "(no PR for branch feature/z)" });
			expect(noPr.map((row) => row.text)).toContain("objectives: obj-z");

			const none = buildStackDetailRows(undefined);
			expect(none).toEqual([{ role: "placeholder", text: "(no PR selected)" }]);
		});
	});

	describe("sliceStackDetailLinesForViewport", () => {
		test("clamps scroll to the wrapped bounds", () => {
			const lines = Array.from({ length: 10 }, (_unused, index) => `line ${index}`);
			const viewport = sliceStackDetailLinesForViewport({ lines, width: 40, rows: 4, scroll: 100 });
			expect(viewport.maxScroll).toBe(6);
			expect(viewport.scroll).toBe(6);
			expect(viewport.lines).toEqual(["line 6", "line 7", "line 8", "line 9"]);
		});
	});
});

describe("StackViewOverlay chrome and budget", () => {
	test("renders inside the overlay height budget with full box borders", () => {
		const lines = newView(bigModel()).render(120);
		expect(lines.length).toBeLessThanOrEqual(Math.floor(30 * 0.85));

		expect(lines[0]).toContain("┌");
		const lastLine = lines[lines.length - 1];
		expect(lastLine).toContain("└");
		expect(lastLine).toContain("┘");
	});

	test("shows the identity line, rollup, an inner divider, and the footer legend", () => {
		const lines = newView(bigModel()).render(120);
		const text = lines.join("\n");
		expect(text).toContain("acme/widgets · trunk main · on feature/1");
		expect(text).toContain("PRs");
		expect(text).toContain("ready");
		expect(dividerIndex(lines)).toBeGreaterThan(0);
		expect(text).toContain("o open · s summarize · r refresh");
	});
});

describe("StackViewOverlay list region", () => {
	test("marks the selected row and the current branch and trails a dim trunk row", () => {
		const model = modelFixture({
			currentBranch: "feature/2",
			prs: [
				prFixture({ number: 1, branch: "feature/1", title: "One" }),
				prFixture({ number: 2, branch: "feature/2", title: "Two" }),
			],
		});
		const view = newView(model, { initialIndex: 1 });
		const lines = view.render(120);
		const list = listRegion(lines);
		const selected = list.find((line) => line.includes("▸"));
		expect(selected).toBeDefined();
		expect(selected).toContain("#2 Two");
		expect(list.some((line) => line.includes("*") && line.includes("#2 Two"))).toBe(true);
		expect(list.some((line) => line.includes("─ main"))).toBe(true);
	});

	test("applies the selectedBg highlight through the tagging theme", () => {
		const view = newColorView(
			modelFixture({
				currentBranch: "feature/1",
				prs: [prFixture({ number: 1, branch: "feature/1", title: "One" })],
			}),
		);
		expect(view.render(120).join("\n")).toContain("[bg:selectedBg]");
	});

	test("follows the selection as it scrolls past the visible window", () => {
		const prs = Array.from({ length: 15 }, (_unused, index) =>
			prFixture({ number: index + 1, branch: `feature/${index + 1}`, title: `PR ${index + 1}` }),
		);
		const view = newView(modelFixture({ currentBranch: "feature/1", prs }), { initialIndex: 0 });
		expect(listRegion(view.render(120)).some((line) => line.includes("#1 "))).toBe(true);

		for (let index = 0; index < 10; index += 1) view.handleInput?.("j");
		const list = listRegion(view.render(120));
		expect(list.some((line) => line.includes("#11 "))).toBe(true);
		expect(list.some((line) => line.includes("#1 "))).toBe(false);
	});
});

describe("StackViewOverlay detail pane", () => {
	test("renders the selected PR's sections", () => {
		const view = newView(bigModel(), { initialIndex: 0 });
		const text = view.render(120).join("\n");
		expect(text).toContain("FAILING CHECKS");
	});

	test("switches detail to the next PR and resets the scroll", () => {
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [
				prFixture({
					number: 1,
					branch: "feature/1",
					title: "First",
					checks: { passing: 0, failing: 20, pending: 0, total: 20 },
					checkEntries: Array.from({ length: 20 }, (_unused, index) =>
						checkEntry({ name: `check-${index}`, workflowName: null, bucket: "failing" }),
					),
				}),
				prFixture({ number: 2, branch: "feature/2", title: "Second" }),
			],
		});
		const view = newView(model, { initialIndex: 0 });
		view.handleInput?.(KEY_PAGE_DOWN);
		view.handleInput?.("j");
		const text = view.render(120).join("\n");
		expect(text).toContain("#2 Second");
		expect(text).toContain("branch: feature/2 → main");
	});

	test("scrolls a long detail down and back up", () => {
		const pr = prFixture({
			number: 1,
			branch: "feature/1",
			title: "Long",
			checks: { passing: 0, failing: 40, pending: 0, total: 40 },
			checkEntries: Array.from({ length: 40 }, (_unused, index) =>
				checkEntry({ name: `check-${index}`, workflowName: null, bucket: "failing" }),
			),
		});
		const view = newView(modelFixture({ currentBranch: "feature/1", prs: [pr] }), {
			initialIndex: 0,
		});
		const initial = detailRegion(view.render(120));
		view.handleInput?.(KEY_PAGE_DOWN);
		const scrolled = detailRegion(view.render(120));
		expect(scrolled).not.toEqual(initial);
		view.handleInput?.(KEY_PAGE_UP);
		expect(detailRegion(view.render(120))).toEqual(initial);
	});
});

describe("StackViewOverlay settles", () => {
	test("opens the selected PR's Graphite URL with the current selection", () => {
		const settled: StackViewUiResult[] = [];
		const model = modelFixture({
			currentBranch: "feature/2",
			prs: [
				prFixture({ number: 1, branch: "feature/1", graphiteUrl: "https://g/1" }),
				prFixture({ number: 2, branch: "feature/2", graphiteUrl: "https://g/2" }),
			],
		});
		const view = newView(model, { initialIndex: 1, onDone: (result) => settled.push(result) });
		view.handleInput?.("o");
		expect(settled).toEqual([
			{ outcome: { action: "open", url: "https://g/2" }, selectedIndex: 1 },
		]);
	});

	test("ignores open on a no-pr row", () => {
		const settled: StackViewUiResult[] = [];
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [prFixture({ number: null, branch: "feature/1", graphiteUrl: "", status: "no-pr" })],
		});
		const view = newView(model, { initialIndex: 0, onDone: (result) => settled.push(result) });
		view.handleInput?.("o");
		expect(settled).toEqual([]);
	});

	test("settles summarize, refresh, and close with the current selection", () => {
		expectSettle("s", { action: "summarize" });
		expectSettle("r", { action: "refresh" });
		expectSettle("q", { action: "close" });
		expectSettle(ESC, { action: "close" });
	});
});

describe("StackViewOverlay edges", () => {
	test("renders an empty stack and no-ops navigation", () => {
		const settled: StackViewUiResult[] = [];
		const view = newView(modelFixture({ prs: [] }), { onDone: (result) => settled.push(result) });
		const text = view.render(120).join("\n");
		expect(text).toContain("(no stacked branches)");
		view.handleInput?.("j");
		view.handleInput?.("k");
		expect(settled).toEqual([]);
		view.handleInput?.("q");
		expect(settled).toEqual([{ outcome: { action: "close" }, selectedIndex: 0 }]);
	});

	test("shows the no-pr rollup segment and placeholder for an all-no-pr stack", () => {
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [prFixture({ number: null, branch: "feature/1", status: "no-pr" })],
		});
		const text = newView(model, { initialIndex: 0 }).render(120).join("\n");
		expect(text).toContain("no-pr");
		expect(text).toContain("(no PR for branch feature/1)");
	});

	test("does not throw on a narrow width or a tiny terminal", () => {
		expect(() => newView(bigModel()).render(10)).not.toThrow();
		const tinyView = new StackViewOverlay({
			tui: fakeTui(8),
			theme: identityTheme(),
			model: bigModel(),
			initialIndex: 0,
			done: () => {},
		});
		const lines = tinyView.render(120);
		expect(lines[0]).toContain("┌");
		expect(lines[lines.length - 1]).toContain("┘");
	});
});

describe("runStackViewOverlayUi", () => {
	test("returns undefined when the host has no interactive UI", async () => {
		await expect(
			runStackViewOverlayUi(bigModel(), { hasUI: false, ui: {} }),
		).resolves.toBeUndefined();
		await expect(
			runStackViewOverlayUi(bigModel(), { hasUI: true, ui: {} }),
		).resolves.toBeUndefined();
	});

	test("passes the overlay options and focuses the handle", async () => {
		const harness = runWithFakeCtx(bigModel());
		expect(harness.capturedOptions).toEqual({
			overlay: true,
			overlayOptions: { width: "90%", maxHeight: "85%", margin: 1 },
			onHandle: expect.any(Function),
		});
		expect(harness.focusCalls).toBe(1);
		harness.component?.handleInput?.("q");
		await harness.promise;
	});

	test("seeds the selection from the current branch", async () => {
		const model = modelFixture({
			currentBranch: "feature/3",
			prs: [
				prFixture({ number: 1, branch: "feature/1" }),
				prFixture({ number: 2, branch: "feature/2" }),
				prFixture({ number: 3, branch: "feature/3" }),
			],
		});
		const harness = runWithFakeCtx(model);
		harness.component?.handleInput?.("q");
		await expect(harness.promise).resolves.toEqual({
			outcome: { action: "close" },
			selectedIndex: 2,
		});
	});

	test("seeds from an explicit clamped selectedIndex", async () => {
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [
				prFixture({ number: 1, branch: "feature/1" }),
				prFixture({ number: 2, branch: "feature/2" }),
			],
		});
		const harness = runWithFakeCtx(model, { selectedIndex: 99 });
		harness.component?.handleInput?.("q");
		await expect(harness.promise).resolves.toEqual({
			outcome: { action: "close" },
			selectedIndex: 1,
		});
	});
});

interface NewViewOptions {
	initialIndex?: number;
	onDone?: (result: StackViewUiResult) => void;
}

function newView(model: StackViewModel, options: NewViewOptions = {}): StackViewOverlay {
	return new StackViewOverlay({
		tui: fakeTui(),
		theme: identityTheme(),
		model,
		initialIndex: options.initialIndex ?? 0,
		done: options.onDone ?? (() => {}),
	});
}

function newColorView(model: StackViewModel): StackViewOverlay {
	return new StackViewOverlay({
		tui: fakeTui(),
		theme: taggingTheme(),
		model,
		initialIndex: 0,
		done: () => {},
	});
}

function expectSettle(input: string, outcome: StackViewUiResult["outcome"]): void {
	const settled: StackViewUiResult[] = [];
	const view = newView(bigModel(), { initialIndex: 0, onDone: (result) => settled.push(result) });
	view.handleInput?.(input);
	expect(settled).toEqual([{ outcome, selectedIndex: 0 }]);
}

interface FakeCtxHarness {
	capturedOptions: unknown;
	component: Component | undefined;
	focusCalls: number;
	promise: Promise<StackViewUiResult | undefined>;
}

function runWithFakeCtx(
	model: StackViewModel,
	options: { selectedIndex?: number } = {},
): FakeCtxHarness {
	const harness: FakeCtxHarness = {
		capturedOptions: undefined,
		component: undefined,
		focusCalls: 0,
		promise: Promise.resolve(undefined),
	};
	const ctx: StackViewOverlayUiContext = {
		hasUI: true,
		ui: {
			custom<T>(
				factory: (
					tui: TUI,
					theme: Theme,
					keybindings: unknown,
					done: (value: T) => void,
				) => Component,
				opts?: unknown,
			): Promise<T> {
				harness.capturedOptions = opts;
				return new Promise<T>((resolve) => {
					harness.component = factory(fakeTui(), identityTheme(), undefined, resolve);
					const handled = opts as { onHandle?: (handle: { focus(): void }) => void } | undefined;
					handled?.onHandle?.({
						focus: () => {
							harness.focusCalls += 1;
						},
					});
				});
			},
		},
	};
	harness.promise = runStackViewOverlayUi(model, ctx, options);
	return harness;
}

function fakeTui(rows = 30): TUI {
	return {
		terminal: { rows },
		requestRender() {},
	} as TUI;
}

function dividerIndex(lines: string[]): number {
	return lines.findIndex((line) => line.includes("│") && line.includes("─".repeat(10)));
}

function listRegion(lines: string[]): string[] {
	return lines.slice(4, Math.max(4, dividerIndex(lines)));
}

function detailRegion(lines: string[]): string[] {
	const start = dividerIndex(lines);
	return lines.slice(start + 1, lines.length - 3);
}

function bigModel(): StackViewModel {
	return modelFixture({
		currentBranch: "feature/1",
		prs: [
			prFixture({
				number: 1,
				branch: "feature/1",
				title: "First",
				status: "checks-failing",
				threads: { resolved: 1, total: 2 },
				checks: { passing: 1, failing: 1, pending: 0, total: 2 },
				checkEntries: [checkEntry({ name: "lint", workflowName: "CI", bucket: "failing" })],
				unresolvedThreads: [threadDetail({ path: "src/a.ts", line: 4, author: "alice" })],
			}),
			prFixture({ number: 2, branch: "feature/2", title: "Second", status: "ready" }),
		],
	});
}

/** Build a check entry, defaulting the detail-only fields the overlay model ignores. */
function checkEntry(overrides: Partial<StackViewCheckEntry> = {}): StackViewCheckEntry {
	return {
		name: "check",
		workflowName: null,
		bucket: "passing",
		status: null,
		conclusion: null,
		detailsUrl: null,
		identity: null,
		...overrides,
	};
}

/** Build a thread detail, defaulting the comment/id fields the overlay model ignores. */
function threadDetail(overrides: Partial<StackViewThreadDetail> = {}): StackViewThreadDetail {
	return {
		id: null,
		path: "",
		line: null,
		author: null,
		comments: [],
		lastCommentId: null,
		totalComments: 0,
		...overrides,
	};
}

function prFixture(overrides: Partial<StackViewPr> = {}): StackViewPr {
	return {
		branch: "feature/1",
		parentBranch: "main",
		number: 1,
		title: "First PR",
		url: "https://github.com/acme/widgets/pull/1",
		graphiteUrl: "https://app.graphite.dev/pr/1",
		isDraft: false,
		body: "Body text",
		threads: { resolved: 0, total: 0 },
		checks: { passing: 0, failing: 0, pending: 0, total: 0 },
		checkEntries: [],
		unresolvedThreads: [],
		status: "ready",
		objectiveSlugs: [],
		...overrides,
	};
}

function modelFixture(overrides: Partial<StackViewModel> = {}): StackViewModel {
	return {
		trunk: "main",
		currentBranch: "feature/1",
		prs: [prFixture()],
		owner: "acme",
		repo: "widgets",
		objectivesBySlug: new Map(),
		...overrides,
	};
}
