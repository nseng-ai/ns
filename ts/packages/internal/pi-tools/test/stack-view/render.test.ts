import { describe, expect, test } from "vitest";

import {
	buildSummaryPrompt,
	renderPlainSnapshot,
	renderStackFooter,
	renderStackRows,
	renderStackView,
	type StackViewRenderParams,
	type StackViewRenderPrimitives,
	type StackViewRenderTheme,
} from "../../src/stack-view/render.ts";
import type { StackViewModel, StackViewPr } from "../../src/stack-view/types.ts";

// A theme that wraps every styling hook in greppable delimiters so tests can
// assert both the styled text and the color/emphasis key that was applied.
const bracketTheme: StackViewRenderTheme = {
	fg: (color, text) => `[${color}]${text}[/]`,
	bg: (color, text) => `{${color}}${text}{/}`,
	bold: (text) => `<b>${text}</b>`,
};

// An empty theme exercises the all-optional fallback path (identity styling).
const plainTheme: StackViewRenderTheme = {};

function pr(overrides: Partial<StackViewPr> = {}): StackViewPr {
	return {
		branch: "feature-branch",
		parentBranch: "master",
		number: 101,
		title: "A change",
		url: "https://github.com/acme/widgets/pull/101",
		graphiteUrl: "https://app.graphite.dev/pr/101",
		isDraft: false,
		body: "Body text.",
		threads: { resolved: 0, total: 0 },
		checks: { passing: 0, failing: 0, pending: 0, total: 0 },
		status: "ready",
		objectiveSlugs: [],
		...overrides,
	};
}

// Default fixture: a realistic 3-PR stack (top-of-stack first) plus a trunk,
// with the current branch in the middle row.
function model(overrides: Partial<StackViewModel> = {}): StackViewModel {
	return {
		trunk: "master",
		currentBranch: "mid-feature",
		owner: "acme",
		repo: "widgets",
		prs: [
			pr({
				branch: "top-feature",
				number: 103,
				title: "Top change",
				graphiteUrl: "https://gt/103",
				body: "Top body.",
			}),
			pr({
				branch: "mid-feature",
				number: 102,
				title: "Mid change",
				graphiteUrl: "https://gt/102",
				body: "Mid body.",
			}),
			pr({
				branch: "base-feature",
				number: 101,
				title: "Base change",
				graphiteUrl: "https://gt/101",
				body: "Base body.",
			}),
		],
		objectivesBySlug: new Map(),
		...overrides,
	};
}

function params(overrides: Partial<StackViewRenderParams> = {}): StackViewRenderParams {
	return {
		model: model(),
		selectedIndex: 1,
		width: 80,
		theme: bracketTheme,
		...overrides,
	};
}

const ANSI_PATTERN = /\[[0-9;]*m/;

describe("renderStackRows", () => {
	test("emits one line per PR followed by the dim trunk row", () => {
		const lines = renderStackRows(params({ theme: plainTheme, selectedIndex: 5 }));

		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("#103 Top change");
		expect(lines[1]).toContain("#102 Mid change");
		expect(lines[2]).toContain("#101 Base change");
		const trunkLine = lines[3]!;
		expect(trunkLine).toContain("─ master");
		expect(trunkLine.startsWith("  ")).toBe(true);
		expect(trunkLine).not.toContain("▸");
	});

	test("dims the trunk row via the theme and never marks it selectable", () => {
		const lines = renderStackRows(params({ selectedIndex: 99 }));

		expect(lines[3]).toBe("  [dim]─ master[/]");
	});

	test("selected row gets the ▸ marker and focus background", () => {
		const lines = renderStackRows(params({ selectedIndex: 0 }));

		expect(lines[0]!.includes("▸")).toBe(true);
		expect(lines[0]).toContain("{selectedBg}");
		// A non-selected row uses leading spaces instead of the ▸ marker.
		expect(lines[2]!.startsWith("▸")).toBe(false);
	});

	test("selected label is styled accent + bold", () => {
		const lines = renderStackRows(params({ selectedIndex: 0 }));

		expect(lines[0]).toContain("[accent]<b>#103 Top change</b>[/]");
	});

	test("current-branch row gets an accent * cue and others do not", () => {
		const lines = renderStackRows(params({ selectedIndex: 0 }));

		// mid-feature is the current branch (index 1) but not selected here.
		expect(lines[1]).toContain("[accent]*[/]");
		expect(lines[2]).not.toContain("[accent]*[/]");
	});

	test("selected current row carries both ▸ and the * cue", () => {
		const lines = renderStackRows(params({ selectedIndex: 1 }));

		expect(lines[1]!.includes("▸")).toBe(true);
		expect(lines[1]).toContain("[accent]*[/]");
	});

	test("renders #N title for PR rows and (no PR) branch for rows without a PR", () => {
		const lines = renderStackRows(
			params({
				theme: plainTheme,
				selectedIndex: 5,
				model: model({
					currentBranch: "orphan",
					prs: [pr({ branch: "orphan", number: null, status: "no-pr" })],
				}),
			}),
		);

		expect(lines[0]).toContain("(no PR) orphan");
		expect(lines[0]).not.toContain("#");
	});

	describe("threads badge", () => {
		test("is omitted when total is zero", () => {
			const lines = renderStackRows(params({ selectedIndex: 5, model: model({ prs: [pr()] }) }));

			expect(lines[0]).not.toContain("💬");
		});

		test("uses warning styling while threads remain unresolved", () => {
			const lines = renderStackRows(
				params({
					selectedIndex: 5,
					model: model({ prs: [pr({ threads: { resolved: 1, total: 3 } })] }),
				}),
			);

			expect(lines[0]).toContain("[warning]💬 1/3[/]");
		});

		test("uses muted styling once all threads are resolved", () => {
			const lines = renderStackRows(
				params({
					selectedIndex: 5,
					model: model({ prs: [pr({ threads: { resolved: 3, total: 3 } })] }),
				}),
			);

			expect(lines[0]).toContain("[muted]💬 3/3[/]");
		});
	});

	describe("checks badge precedence", () => {
		function rowFor(checks: StackViewPr["checks"]): string {
			return renderStackRows(
				params({ selectedIndex: 5, model: model({ prs: [pr({ checks })] }) }),
			)[0]!;
		}

		test("failing wins even when checks are also pending", () => {
			const line = rowFor({ passing: 1, failing: 2, pending: 2, total: 5 });
			expect(line).toContain("[error]✗ 2/5[/]");
			expect(line).not.toContain("⋯");
			expect(line).not.toContain("✓");
		});

		test("pending shows when none are failing", () => {
			const line = rowFor({ passing: 2, failing: 0, pending: 3, total: 5 });
			expect(line).toContain("[warning]⋯ 3/5[/]");
			expect(line).not.toContain("✗");
		});

		test("all passing shows the success check", () => {
			const line = rowFor({ passing: 5, failing: 0, pending: 0, total: 5 });
			expect(line).toContain("[success]✓ 5/5[/]");
		});

		test("is omitted when there are no checks", () => {
			const line = rowFor({ passing: 0, failing: 0, pending: 0, total: 0 });
			expect(line).not.toContain("✓");
			expect(line).not.toContain("✗");
			expect(line).not.toContain("⋯");
		});
	});

	describe("status words", () => {
		function statusRow(status: StackViewPr["status"], number: number | null = 101): string {
			return renderStackRows(
				params({ selectedIndex: 5, model: model({ prs: [pr({ status, number })] }) }),
			)[0]!;
		}

		test("draft", () => expect(statusRow("draft")).toContain("[muted]draft[/]"));
		test("checks failing", () =>
			expect(statusRow("checks-failing")).toContain("[error]checks failing[/]"));
		test("unresolved", () => expect(statusRow("unresolved")).toContain("[warning]unresolved[/]"));
		test("ready", () => expect(statusRow("ready")).toContain("[success]ready[/]"));
		test("no-pr", () => expect(statusRow("no-pr", null)).toContain("[dim]no-pr[/]"));
	});
});

describe("width behavior", () => {
	test("every plain-theme line stays within a narrow width", () => {
		const width = 24;
		const lines = renderStackRows(
			params({
				theme: plainTheme,
				width,
				selectedIndex: 1,
				model: model({
					prs: [
						pr({ branch: "top-feature", number: 103, title: "Top change" }),
						pr({
							branch: "mid-feature",
							number: 102,
							title: "A rather long middle title that overflows the panel",
							threads: { resolved: 1, total: 4 },
							checks: { passing: 1, failing: 1, pending: 1, total: 3 },
							status: "checks-failing",
						}),
						pr({ branch: "base-feature", number: 101, title: "Base change" }),
					],
				}),
			}),
		);

		expect(lines.every((line) => line.length <= width)).toBe(true);
	});

	test("overlong titles are truncated with an ellipsis", () => {
		const width = 28;
		const lines = renderStackRows(
			params({
				theme: plainTheme,
				width,
				selectedIndex: 5,
				model: model({
					prs: [
						pr({
							number: 101,
							title: "This title is far too long to ever fit inside the panel width",
						}),
					],
				}),
			}),
		);

		expect(lines[0]).toContain("…");
		expect(lines[0]!.length).toBeLessThanOrEqual(width);
	});
});

describe("renderStackFooter", () => {
	test("shows the selected PR's Graphite URL", () => {
		const lines = renderStackFooter(params({ selectedIndex: 0 }));

		expect(lines[0]).toBe("[accent]https://gt/103[/]");
	});

	test("shows a dim placeholder when the selected row has no PR / no URL", () => {
		const lines = renderStackFooter(
			params({
				selectedIndex: 0,
				model: model({ prs: [pr({ number: null, graphiteUrl: "", status: "no-pr" })] }),
			}),
		);

		expect(lines[0]).toBe("[dim](no Graphite URL for this row)[/]");
	});

	test("shows a dim placeholder for an out-of-range selection", () => {
		const lines = renderStackFooter(params({ selectedIndex: 42 }));

		expect(lines[0]).toBe("[dim](no Graphite URL for this row)[/]");
	});

	test("renders an objectives block when the slug map is non-empty", () => {
		const lines = renderStackFooter(
			params({
				model: model({
					objectivesBySlug: new Map([
						["auth-revamp", [12, 34]],
						["render-layer", [56]],
					]),
				}),
			}),
		);
		const output = lines.join("\n");

		expect(output).toContain("[muted]Objectives:[/]");
		expect(output).toContain("[text]auth-revamp (#12, #34)[/]");
		expect(output).toContain("[text]render-layer (#56)[/]");
	});

	test("omits the objectives block when the slug map is empty", () => {
		const lines = renderStackFooter(params());

		expect(lines.join("\n")).not.toContain("Objectives:");
	});

	test("ends with the dim key legend", () => {
		const lines = renderStackFooter(params());

		expect(lines[lines.length - 1]).toBe(
			"[dim]↑/↓ move · o open · s summarize · r refresh · q close[/]",
		);
	});
});

describe("renderStackView", () => {
	test("composes rows, a blank spacer, then the footer", () => {
		const config = params({ theme: plainTheme, width: 80, selectedIndex: 1 });
		const rows = renderStackRows(config);
		const footer = renderStackFooter(config);
		const view = renderStackView(config);

		expect(view).toHaveLength(rows.length + 1 + footer.length);
		expect(view.slice(0, rows.length)).toEqual(rows);
		expect(view[rows.length]).toBe("");
		expect(view.slice(rows.length + 1)).toEqual(footer);
	});
});

describe("renderPlainSnapshot", () => {
	test("renders a heading with repo and trunk", () => {
		const snapshot = renderPlainSnapshot(model());

		expect(snapshot.startsWith("# Stack: acme/widgets (trunk: master)")).toBe(true);
	});

	test("marks the current branch row with '* ' and others with '- '", () => {
		const snapshot = renderPlainSnapshot(model());
		const lines = snapshot.split("\n");

		expect(lines.some((line) => line.startsWith("* #102 Mid change"))).toBe(true);
		expect(lines.some((line) => line.startsWith("- #103 Top change"))).toBe(true);
	});

	test("includes per-row meta (threads, checks, status)", () => {
		const snapshot = renderPlainSnapshot(
			model({
				currentBranch: "solo",
				prs: [
					pr({
						branch: "solo",
						number: 101,
						title: "Solo change",
						threads: { resolved: 1, total: 2 },
						checks: { passing: 1, failing: 1, pending: 1, total: 3 },
						status: "unresolved",
					}),
				],
			}),
		);

		expect(snapshot).toContain("threads 1/2, checks 1✓ 1✗ 1⋯, unresolved");
	});

	test("includes Graphite URLs for PR rows but not for no-pr rows", () => {
		const snapshot = renderPlainSnapshot(
			model({
				currentBranch: "top-feature",
				prs: [
					pr({ branch: "top-feature", number: 103, graphiteUrl: "https://gt/103" }),
					pr({ branch: "orphan", number: null, graphiteUrl: "", status: "no-pr" }),
				],
			}),
		);

		expect(snapshot).toContain("  https://gt/103");
		expect(snapshot).toContain("  branch: orphan");
		expect(snapshot).not.toContain("(no PR) orphan\n  https");
	});

	test("renders an objectives section when the map is non-empty", () => {
		const snapshot = renderPlainSnapshot(
			model({ objectivesBySlug: new Map([["auth-revamp", [12, 34]]]) }),
		);

		expect(snapshot).toContain("## Objectives");
		expect(snapshot).toContain("- auth-revamp (#12, #34)");
	});

	test("contains no ANSI escape sequences", () => {
		const snapshot = renderPlainSnapshot(
			model({ objectivesBySlug: new Map([["auth-revamp", [12]]]) }),
		);

		expect(ANSI_PATTERN.test(snapshot)).toBe(false);
	});
});

describe("buildSummaryPrompt", () => {
	test("emits PRs bottom-up (nearest-trunk first)", () => {
		const prompt = buildSummaryPrompt(model());

		expect(prompt).toContain("PRs, bottom-up (3 total):");
		// model.prs is top-first [103, 102, 101]; the summary reads base-up.
		const basePos = prompt.indexOf("#101 Base change");
		const midPos = prompt.indexOf("#102 Mid change");
		const topPos = prompt.indexOf("#103 Top change");
		expect(basePos).toBeGreaterThan(-1);
		expect(basePos).toBeLessThan(midPos);
		expect(midPos).toBeLessThan(topPos);
		expect(prompt).toContain("## PR 1 of 3");
		expect(prompt).toContain("## PR 3 of 3");
	});

	test("wraps each PR body in description delimiters", () => {
		const prompt = buildSummaryPrompt(model({ prs: [pr({ body: "Meaningful body." })] }));

		expect(prompt).toContain("<<<description\nMeaningful body.\ndescription>>>");
	});

	test("uses (no description) for an empty body", () => {
		const prompt = buildSummaryPrompt(model({ prs: [pr({ body: "   \n  " })] }));

		expect(prompt).toContain("<<<description\n(no description)\ndescription>>>");
	});

	test("lists objectives when present", () => {
		const prompt = buildSummaryPrompt(
			model({ objectivesBySlug: new Map([["auth-revamp", [12, 34]]]) }),
		);

		expect(prompt).toContain("Objectives edited by this stack:");
		expect(prompt).toContain("- auth-revamp (#12, #34)");
		expect(prompt).not.toContain("- None recorded.");
	});

	test("records '- None recorded.' when there are no objectives", () => {
		const prompt = buildSummaryPrompt(model());

		expect(prompt).toContain("Objectives edited by this stack:\n- None recorded.");
	});
});

describe("injected primitives", () => {
	test("a custom truncateToWidth is used for every emitted line", () => {
		const primitives: StackViewRenderPrimitives = {
			truncateToWidth: (value) => `${value}##CUT##`,
		};
		const lines = renderStackRows(params({ theme: plainTheme, primitives }));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines.every((line) => line.includes("##CUT##"))).toBe(true);
	});
});
