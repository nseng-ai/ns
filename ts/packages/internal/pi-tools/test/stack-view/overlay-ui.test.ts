import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";

import type {
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";
import {
	buildStackDetailRows,
	buildStackRollupSegments,
	formatStackRowCells,
	rollupBucketForPr,
	stackListRows,
} from "../../src/stack-view/overlay-model.ts";
import { sliceWrappedDetailLinesForViewport } from "../../src/overlay-kit/viewport.ts";
import { checkEnrichmentKey, threadEnrichmentKey } from "../../src/stack-view/enrichment-keys.ts";
import type { EnrichmentEntry } from "../../src/stack-view/enrichment-store.ts";
import type { StackEnrichmentPort } from "../../src/stack-view/enrichment-engine.ts";
import { composeBodyLayout } from "../../src/stack-view/compose-model.ts";
import {
	runStackViewOverlayUi,
	StackViewOverlay,
	type StackViewComposeOption,
	type StackViewOverlayUiContext,
	type StackViewUiResult,
} from "../../src/stack-view/overlay-ui.ts";
import {
	checkEntryFixture,
	createFakeComposePort,
	type FakeComposePort,
	threadDetailFixture,
} from "./stack-view-fixtures.ts";
import { identityTheme, taggingTheme } from "./stack-view-test-themes.ts";

const ESC = String.fromCharCode(27);
const KEY_PAGE_DOWN = `${ESC}[6~`;
const KEY_PAGE_UP = `${ESC}[5~`;
const TAB = "\t";
const CTRL_C = "\x03";
const CTRL_Y = "\x19";
const ENTER = "\r";

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
						checkEntryFixture({ name: "lint", workflowName: "CI", bucket: "failing" }),
						checkEntryFixture({ name: "unit", workflowName: null, bucket: "pending" }),
						checkEntryFixture({ name: "build", workflowName: "CI", bucket: "passing" }),
						checkEntryFixture({ name: "typecheck", workflowName: null, bucket: "passing" }),
					],
					unresolvedThreads: [
						threadDetailFixture({ path: "src/a.ts", line: 10, author: "alice" }),
						threadDetailFixture({ path: "src/b.ts", line: null, author: "bob" }),
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
			// The aggregate `✓ N passing` line is replaced by a listed PASSING CHECKS section.
			expect(texts).toContain("PASSING CHECKS (2)");
			expect(texts).toContain("✓ build (CI)");
			expect(texts).toContain("✓ typecheck");
			expect(texts.some((text) => /^✓ \d+ passing$/.test(text))).toBe(false);
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
					unresolvedThreads: [threadDetailFixture({ path: "", line: 5, author: null })],
				}),
			);
			expect(rows.map((row) => row.text)).toContain("(file unknown):5");
		});

		test("appends a truncation note when fetched threads fall short of the count", () => {
			const rows = buildStackDetailRows(
				prFixture({
					threads: { resolved: 0, total: 3 },
					unresolvedThreads: [threadDetailFixture({ path: "src/a.ts", line: 1, author: "alice" })],
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

		test("shows a summarizing placeholder after the thread while its summary is pending", () => {
			const thread = threadDetailFixture({
				id: "t1",
				path: "src/a.ts",
				line: 3,
				author: "alice",
				lastCommentId: "c1",
			});
			const pr = prFixture({ threads: { resolved: 0, total: 1 }, unresolvedThreads: [thread] });
			const enrichment = enrichmentMap([[requireThreadKey(thread), { state: "pending" }]]);

			const rows = buildStackDetailRows(pr, enrichment);
			const threadIndex = rows.findIndex((row) => row.role === "thread");
			expect(rows[threadIndex + 1]).toEqual({ role: "summary-pending", text: "  …summarizing" });
		});

		test("renders a ready thread summary with collapsed whitespace after the thread", () => {
			const thread = threadDetailFixture({
				id: "t1",
				path: "src/a.ts",
				line: 3,
				author: "alice",
				lastCommentId: "c1",
			});
			const pr = prFixture({ threads: { resolved: 0, total: 1 }, unresolvedThreads: [thread] });
			const enrichment = enrichmentMap([
				[requireThreadKey(thread), { state: "ready", summary: "please  rename\nthe   method" }],
			]);

			const rows = buildStackDetailRows(pr, enrichment);
			const threadIndex = rows.findIndex((row) => row.role === "thread");
			expect(rows[threadIndex + 1]).toEqual({
				role: "thread-summary",
				text: "  ↳ asks: please rename the method",
			});
		});

		test("a failed thread summary degrades to the bare thread row", () => {
			const thread = threadDetailFixture({
				id: "t1",
				path: "src/a.ts",
				line: 3,
				author: "alice",
				lastCommentId: "c1",
			});
			const pr = prFixture({ threads: { resolved: 0, total: 1 }, unresolvedThreads: [thread] });
			const enrichment = enrichmentMap([[requireThreadKey(thread), { state: "failed" }]]);

			const rows = buildStackDetailRows(pr, enrichment);
			expect(
				rows.some((row) => row.role === "summary-pending" || row.role === "thread-summary"),
			).toBe(false);
		});

		test("emits check-why continuation rows for a multi-line ready check summary, capped at three lines", () => {
			const check = checkEntryFixture({
				name: "lint",
				workflowName: "CI",
				bucket: "failing",
				identity: "ci/lint",
				conclusion: "FAILURE",
			});
			const pr = prFixture({
				checks: { passing: 0, failing: 1, pending: 0, total: 1 },
				checkEntries: [check],
			});
			const enrichment = enrichmentMap([
				[
					checkEnrichmentKey(check),
					{ state: "ready", summary: "first cause\nsecond line\nthird line\nfourth line" },
				],
			]);

			const rows = buildStackDetailRows(pr, enrichment);
			const whyRows = rows.filter((row) => row.role === "check-why").map((row) => row.text);
			expect(whyRows).toEqual(["  ↳ why: first cause", "     second line", "     third line"]);
		});

		test("without an enrichment map, emits no summary rows but still lists passing checks", () => {
			const thread = threadDetailFixture({
				id: "t1",
				path: "src/a.ts",
				line: 3,
				author: "alice",
				lastCommentId: "c1",
			});
			const pr = prFixture({
				threads: { resolved: 0, total: 1 },
				unresolvedThreads: [thread],
				checks: { passing: 1, failing: 1, pending: 0, total: 2 },
				checkEntries: [
					checkEntryFixture({ name: "lint", workflowName: "CI", bucket: "failing" }),
					checkEntryFixture({ name: "build", workflowName: "CI", bucket: "passing" }),
				],
			});

			const rows = buildStackDetailRows(pr);
			expect(
				rows.some(
					(row) =>
						row.role === "summary-pending" ||
						row.role === "thread-summary" ||
						row.role === "check-why",
				),
			).toBe(false);
			const texts = rows.map((row) => row.text);
			expect(texts).toContain("PASSING CHECKS (1)");
			expect(texts).toContain("✓ build (CI)");
			expect(texts.some((text) => /^✓ \d+ passing$/.test(text))).toBe(false);
		});

		test("omits the PASSING CHECKS section when there are no passing entries", () => {
			const rows = buildStackDetailRows(
				prFixture({
					checks: { passing: 0, failing: 1, pending: 0, total: 1 },
					checkEntries: [
						checkEntryFixture({ name: "lint", workflowName: "CI", bucket: "failing" }),
					],
				}),
			);
			expect(rows.some((row) => row.text.startsWith("PASSING CHECKS"))).toBe(false);
		});
	});

	describe("sliceWrappedDetailLinesForViewport", () => {
		test("clamps scroll to the wrapped bounds", () => {
			const lines = Array.from({ length: 10 }, (_unused, index) => `line ${index}`);
			const viewport = sliceWrappedDetailLinesForViewport({
				lines,
				width: 40,
				rows: 4,
				scroll: 100,
			});
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
		expect(text).toContain("o open · b copy branch · s summarize · r refresh");
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
						checkEntryFixture({ name: `check-${index}`, workflowName: null, bucket: "failing" }),
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
				checkEntryFixture({ name: `check-${index}`, workflowName: null, bucket: "failing" }),
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

	test("settles copy-branch for the selected PR", () => {
		const settled: StackViewUiResult[] = [];
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [
				prFixture({ number: 1, branch: "feature/1" }),
				prFixture({ number: 2, branch: "feature/2" }),
			],
		});
		const view = newView(model, { initialIndex: 1, onDone: (result) => settled.push(result) });
		view.handleInput?.("b");
		expect(settled).toEqual([
			{ outcome: { action: "copy-branch", branch: "feature/2" }, selectedIndex: 1 },
		]);
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

describe("StackViewOverlay enrichment", () => {
	test("requests enrichment for the initial selection and again on each move", () => {
		const fake = createFakeEnrichment();
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [
				prFixture({ number: 1, branch: "feature/1" }),
				prFixture({ number: 2, branch: "feature/2" }),
			],
		});
		const view = new StackViewOverlay({
			tui: fakeTui(),
			theme: identityTheme(),
			model,
			initialIndex: 0,
			done: () => {},
			enrichment: fake.port,
		});
		expect(fake.ensureRowBranches).toEqual(["feature/1"]);
		view.handleInput?.("j");
		view.handleInput?.("k");
		expect(fake.ensureRowBranches).toEqual(["feature/1", "feature/2", "feature/1"]);
	});

	test("re-renders on engine change and stops once settled", () => {
		const fake = createFakeEnrichment();
		const recording = renderRecordingTui();
		const view = new StackViewOverlay({
			tui: recording.tui,
			theme: identityTheme(),
			model: bigModel(),
			initialIndex: 0,
			done: () => {},
			enrichment: fake.port,
		});
		const before = recording.renders();
		fake.fireChange();
		expect(recording.renders()).toBe(before + 1);

		view.handleInput?.("q"); // settle → unsubscribe
		const afterSettle = recording.renders();
		fake.fireChange();
		expect(recording.renders()).toBe(afterSettle);
		expect(fake.listenerCount()).toBe(0);
	});

	test("dispose unsubscribes idempotently", () => {
		const fake = createFakeEnrichment();
		const recording = renderRecordingTui();
		new StackViewOverlay({
			tui: recording.tui,
			theme: identityTheme(),
			model: bigModel(),
			initialIndex: 0,
			done: () => {},
			enrichment: fake.port,
		}).dispose();
		expect(fake.listenerCount()).toBe(0);
		const after = recording.renders();
		fake.fireChange();
		expect(recording.renders()).toBe(after);
	});

	test("progressively fills the detail pane as a thread summary arrives", () => {
		const fake = createFakeEnrichment();
		const thread = threadDetailFixture({
			id: "t1",
			path: "src/a.ts",
			line: 2,
			author: "alice",
			lastCommentId: "c1",
		});
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [
				prFixture({
					number: 1,
					branch: "feature/1",
					threads: { resolved: 0, total: 1 },
					unresolvedThreads: [thread],
				}),
			],
		});
		const key = requireThreadKey(thread);
		fake.setSnapshot(enrichmentMap([[key, { state: "pending" }]]));
		const view = new StackViewOverlay({
			tui: fakeTui(),
			theme: identityTheme(),
			model,
			initialIndex: 0,
			done: () => {},
			enrichment: fake.port,
		});
		expect(view.render(120).join("\n")).toContain("…summarizing");

		fake.setSnapshot(enrichmentMap([[key, { state: "ready", summary: "rename the method" }]]));
		fake.fireChange();
		const text = view.render(120).join("\n");
		expect(text).toContain("↳ asks: rename the method");
		expect(text).not.toContain("…summarizing");
	});

	test("renders a degradation line when summaries are unavailable", () => {
		const fake = createFakeEnrichment();
		fake.setDegradedReason("model registry unavailable");
		const view = new StackViewOverlay({
			tui: fakeTui(),
			theme: identityTheme(),
			model: bigModel(),
			initialIndex: 0,
			done: () => {},
			enrichment: fake.port,
		});
		expect(view.render(120).join("\n")).toContain(
			"(summaries unavailable: model registry unavailable)",
		);
	});

	test("pins the degradation line below the detail viewport on tall content", () => {
		const fake = createFakeEnrichment();
		fake.setDegradedReason("model registry unavailable");
		const manyThreads = Array.from({ length: 40 }, (_unused, index) =>
			threadDetailFixture({ path: `src/file-${index}.ts`, line: index + 1 }),
		);
		const model = modelFixture({
			currentBranch: "feature/1",
			prs: [
				prFixture({
					number: 1,
					branch: "feature/1",
					threads: { resolved: 0, total: manyThreads.length },
					unresolvedThreads: manyThreads,
				}),
			],
		});
		const view = new StackViewOverlay({
			tui: fakeTui(),
			theme: identityTheme(),
			model,
			initialIndex: 0,
			done: () => {},
			enrichment: fake.port,
		});
		const detail = detailRegion(view.render(120));
		// Content overflows the pane, yet the notice is the final detail line.
		const lastLine = detail[detail.length - 1] ?? "";
		expect(lastLine).toContain("(summaries unavailable: model registry unavailable)");
		expect(detail.join("\n")).toContain("src/file-0.ts");
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

describe("composeBodyLayout", () => {
	test("collapses the draft below 12 rows and apportions ~30% above", () => {
		const cases: Array<{
			bodyRows: number;
			editorRows: number;
			transcriptRows: number;
			draftRows: number;
		}> = [
			{ bodyRows: 5, editorRows: 1, transcriptRows: 1, draftRows: 1 },
			{ bodyRows: 5, editorRows: 3, transcriptRows: 1, draftRows: 1 },
			{ bodyRows: 11, editorRows: 1, transcriptRows: 7, draftRows: 1 },
			{ bodyRows: 11, editorRows: 3, transcriptRows: 5, draftRows: 1 },
			{ bodyRows: 12, editorRows: 1, transcriptRows: 6, draftRows: 3 },
			{ bodyRows: 12, editorRows: 3, transcriptRows: 4, draftRows: 3 },
			{ bodyRows: 20, editorRows: 1, transcriptRows: 11, draftRows: 6 },
			{ bodyRows: 20, editorRows: 3, transcriptRows: 9, draftRows: 6 },
			{ bodyRows: 40, editorRows: 1, transcriptRows: 27, draftRows: 10 },
			{ bodyRows: 40, editorRows: 3, transcriptRows: 25, draftRows: 10 },
		];
		for (const item of cases) {
			expect(composeBodyLayout({ bodyRows: item.bodyRows, editorRows: item.editorRows })).toEqual({
				transcriptRows: item.transcriptRows,
				draftRows: item.draftRows,
			});
		}
	});
});

describe("StackViewOverlay compose mode", () => {
	test("`p` and Tab enter compose only when the compose option is present", () => {
		const withCompose = newComposeView();
		withCompose.view.handleInput?.("p");
		expect(withCompose.view.render(120).join("\n")).toContain("compose ·");

		const viaTab = newComposeView();
		viaTab.view.handleInput?.(TAB);
		expect(viaTab.view.render(120).join("\n")).toContain("compose ·");

		const noCompose = newComposeView({ withCompose: false });
		noCompose.view.handleInput?.("p");
		const text = noCompose.view.render(120).join("\n");
		expect(text).not.toContain("compose ·");
		expect(text).toContain("s summarize");
		expect(noCompose.settled).toEqual([]);
	});

	test("browse footer advertises compose only when the option is present", () => {
		expect(newComposeView().view.render(120).join("\n")).toContain("p compose");
		expect(newComposeView({ withCompose: false }).view.render(120).join("\n")).not.toContain(
			"p compose",
		);
	});

	test("typed characters reach the editor and Enter submits the trimmed text", () => {
		const harness = newComposeView();
		harness.view.handleInput?.("p");
		for (const char of " hi ") harness.view.handleInput?.(char);
		harness.view.handleInput?.(ENTER);
		expect(harness.fake.sendCalls).toEqual(["hi"]);
	});

	test("`q` types into the editor and never closes the overlay", () => {
		const harness = newComposeView();
		harness.view.handleInput?.("p");
		harness.view.handleInput?.("q");
		expect(harness.settled).toEqual([]);
		harness.view.handleInput?.(ENTER);
		expect(harness.fake.sendCalls).toEqual(["q"]);
	});

	test("Esc returns to browse and re-entering compose reuses the same port", () => {
		const harness = newComposeView();
		harness.view.handleInput?.("p");
		expect(harness.getPortCalls()).toBe(1);
		harness.view.handleInput?.(ESC);
		expect(harness.view.render(120).join("\n")).not.toContain("compose ·");
		harness.view.handleInput?.("p");
		expect(harness.view.render(120).join("\n")).toContain("compose ·");
		expect(harness.getPortCalls()).toBe(1);
	});

	test("Ctrl+Y with a non-empty draft settles compose-inject", () => {
		const harness = newComposeView();
		harness.fake.setDraft("drafted reply");
		harness.view.handleInput?.("p");
		harness.view.handleInput?.(CTRL_Y);
		expect(harness.settled).toEqual([
			{ outcome: { action: "compose-inject", draft: "drafted reply" }, selectedIndex: 0 },
		]);
	});

	test("Ctrl+Y with no draft does not settle and shows a transient hint", () => {
		const harness = newComposeView();
		harness.view.handleInput?.("p");
		harness.view.handleInput?.(CTRL_Y);
		expect(harness.settled).toEqual([]);
		expect(harness.view.render(120).join("\n")).toContain("no draft yet");
	});

	test("Ctrl+C aborts the current turn through the port", () => {
		const harness = newComposeView();
		harness.view.handleInput?.("p");
		harness.view.handleInput?.(CTRL_C);
		expect(harness.fake.abortCalls()).toBe(1);
	});

	test("PgUp scrolls the transcript window", () => {
		const harness = newComposeView();
		harness.fake.setTranscript({
			entries: Array.from({ length: 60 }, (_unused, index) => ({
				kind: "assistant" as const,
				text: `line ${index}`,
			})),
			isStreaming: false,
		});
		harness.view.handleInput?.("p");
		const before = harness.view.render(120).join("\n");
		harness.view.handleInput?.(KEY_PAGE_UP);
		expect(harness.view.render(120).join("\n")).not.toBe(before);
	});

	test("the draft pane collapses to a status line on a tiny terminal", () => {
		const harness = newComposeView({ rows: 14 });
		harness.fake.setDraft("a\nb\nc");
		harness.view.handleInput?.("p");
		expect(harness.view.render(120).join("\n")).toContain("draft: 3 lines · ctrl+y to inject");
	});

	test("surfaces the port's unavailable reason in the compose header", () => {
		const harness = newComposeView();
		harness.fake.setUnavailableReason("no model selected in this session");
		harness.view.handleInput?.("p");
		expect(harness.view.render(120).join("\n")).toContain(
			"unavailable: no model selected in this session",
		);
	});

	test("a port onChange requests a re-render", () => {
		const harness = newComposeView();
		harness.view.handleInput?.("p");
		const before = harness.tui.renders();
		harness.fireOnChange();
		expect(harness.tui.renders()).toBe(before + 1);
	});
});

interface ComposeHarness {
	view: StackViewOverlay;
	fake: FakeComposePort;
	settled: StackViewUiResult[];
	getPortCalls: () => number;
	fireOnChange: () => void;
	tui: { renders: () => number };
}

/** Build an overlay wired to a fake compose port; the overlay attaches its own onChange listener. */
function newComposeView(options: { withCompose?: boolean; rows?: number } = {}): ComposeHarness {
	const fake = createFakeComposePort();
	const settled: StackViewUiResult[] = [];
	const recording = renderRecordingTui(options.rows ?? 30);
	let getPortCalls = 0;
	const compose: StackViewComposeOption = {
		getPort: () => {
			getPortCalls += 1;
			return fake.port;
		},
	};
	const view = new StackViewOverlay({
		tui: recording.tui,
		theme: identityTheme(),
		model: bigModel(),
		initialIndex: 0,
		done: (result) => settled.push(result),
		...(options.withCompose === false ? {} : { compose }),
	});
	return {
		view,
		fake,
		settled,
		getPortCalls: () => getPortCalls,
		fireOnChange: () => fake.fireOnChange(),
		tui: { renders: recording.renders },
	};
}

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

function fakeTui(rows = 30, onRender: () => void = () => {}): TUI {
	const tui = {
		terminal: fakeTerminal(rows),
		requestRender: onRender,
	} satisfies Partial<TUI>;
	return tui as TUI;
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
				checkEntries: [checkEntryFixture({ name: "lint", workflowName: "CI", bucket: "failing" })],
				unresolvedThreads: [threadDetailFixture({ path: "src/a.ts", line: 4, author: "alice" })],
			}),
			prFixture({ number: 2, branch: "feature/2", title: "Second", status: "ready" }),
		],
	});
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

function enrichmentMap(
	entries: ReadonlyArray<[string, EnrichmentEntry]>,
): ReadonlyMap<string, EnrichmentEntry> {
	return new Map(entries);
}

function requireThreadKey(thread: StackViewThreadDetail): string {
	const key = threadEnrichmentKey(thread);
	if (key === null) throw new Error("expected a non-null thread key");
	return key;
}

interface FakeEnrichment {
	port: StackEnrichmentPort;
	ensureRowBranches: string[];
	fireChange(): void;
	setSnapshot(map: ReadonlyMap<string, EnrichmentEntry>): void;
	setDegradedReason(reason: string | null): void;
	listenerCount(): number;
}

/** A scripted {@link StackEnrichmentPort}: records ensureRow, lets tests drive onChange/snapshot/degraded. */
function createFakeEnrichment(): FakeEnrichment {
	const ensureRowBranches: string[] = [];
	const listeners = new Set<() => void>();
	let currentSnapshot: ReadonlyMap<string, EnrichmentEntry> = new Map();
	let degraded: string | null = null;
	const port: StackEnrichmentPort = {
		snapshot: () => currentSnapshot,
		ensureRow: (pr) => {
			ensureRowBranches.push(pr.branch);
		},
		ensureAll: async () => {},
		progress: () => null,
		degradedReason: () => degraded,
		onChange: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		abort: () => {},
	};
	return {
		port,
		ensureRowBranches,
		fireChange: () => {
			for (const listener of listeners) listener();
		},
		setSnapshot: (map) => {
			currentSnapshot = map;
		},
		setDegradedReason: (reason) => {
			degraded = reason;
		},
		listenerCount: () => listeners.size,
	};
}

/** A fake TUI that counts requestRender calls. */
function renderRecordingTui(rows = 30): { tui: TUI; renders: () => number } {
	let count = 0;
	return { tui: fakeTui(rows, () => (count += 1)), renders: () => count };
}

function fakeTerminal(rows: number): TUI["terminal"] {
	const terminal = { rows } satisfies Partial<TUI["terminal"]>;
	return terminal as TUI["terminal"];
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
