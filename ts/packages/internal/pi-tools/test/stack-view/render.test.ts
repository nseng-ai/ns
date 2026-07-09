import { describe, expect, test } from "vitest";

import { buildSummaryPrompt, renderPlainSnapshot } from "../../src/stack-view/render.ts";
import type { StackViewModel, StackViewPr } from "../../src/stack-view/types.ts";
import { checkEntryFixture, threadDetailFixture } from "./stack-view-fixtures.ts";

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
		checkEntries: [],
		unresolvedThreads: [],
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

const ANSI_PATTERN = /\[[0-9;]*m/;

describe("renderPlainSnapshot", () => {
	test("renders a heading with repo and trunk", () => {
		const snapshot = renderPlainSnapshot(model());

		expect(snapshot.startsWith("# Stack: acme/widgets (trunk: master)")).toBe(true);
	});

	test("marks the current branch row with '* ' and others with '- '", () => {
		const snapshot = renderPlainSnapshot(model());
		const lines = snapshot.split("\n");

		expect(lines.some((line) => line.startsWith("* #102 mid-feature"))).toBe(true);
		expect(lines.some((line) => line.startsWith("- #103 top-feature"))).toBe(true);
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
			model({
				objectivesBySlug: new Map([["auth-revamp", [12]]]),
				prs: [
					pr({
						branch: "solo",
						number: 101,
						title: "Solo change",
						checks: { passing: 0, failing: 1, pending: 1, total: 2 },
						status: "checks-failing",
						checkEntries: [
							checkEntryFixture({ name: "build", workflowName: "CI", bucket: "failing" }),
							checkEntryFixture({ name: "lint", workflowName: null, bucket: "pending" }),
						],
						// total-resolved equals the detail count so no `[+k more]` suffix
						// (which legitimately contains `[`) muddies the no-ANSI invariant.
						threads: { resolved: 0, total: 1 },
						unresolvedThreads: [
							threadDetailFixture({ path: "src/a.ts", line: 10, author: "alice" }),
						],
					}),
				],
			}),
		);

		expect(ANSI_PATTERN.test(snapshot)).toBe(false);
		expect(snapshot).not.toContain("[");
	});

	describe("detail lines", () => {
		test("emits a failing line with workflow-name suffixes, comma-joined", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							checkEntries: [
								checkEntryFixture({ name: "build", workflowName: "CI", bucket: "failing" }),
								checkEntryFixture({ name: "typecheck", workflowName: null, bucket: "failing" }),
								checkEntryFixture({ name: "unit", workflowName: "CI", bucket: "passing" }),
							],
						}),
					],
				}),
			);

			expect(snapshot).toContain("  failing: build (CI), typecheck");
		});

		test("emits a pending line using the same name formatting", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							checkEntries: [
								checkEntryFixture({ name: "deploy", workflowName: "Release", bucket: "pending" }),
							],
						}),
					],
				}),
			);

			expect(snapshot).toContain("  pending: deploy (Release)");
		});

		test("omits failing and pending lines when there are no such entries", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							checkEntries: [
								checkEntryFixture({ name: "unit", workflowName: null, bucket: "passing" }),
							],
						}),
					],
				}),
			);

			expect(snapshot).not.toContain("  failing:");
			expect(snapshot).not.toContain("  pending:");
		});

		test("emits an unresolved line as `path:line · author`, semicolon-joined", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							threads: { resolved: 0, total: 2 },
							unresolvedThreads: [
								threadDetailFixture({ path: "src/a.ts", line: 10, author: "alice" }),
								threadDetailFixture({ path: "src/b.ts", line: 22, author: "bob" }),
							],
						}),
					],
				}),
			);

			expect(snapshot).toContain("  unresolved: src/a.ts:10 · alice; src/b.ts:22 · bob");
		});

		test("drops the line when line is null and drops the author when author is null", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							threads: { resolved: 0, total: 3 },
							unresolvedThreads: [
								threadDetailFixture({ path: "src/a.ts", line: null, author: "alice" }),
								threadDetailFixture({ path: "src/b.ts", line: 5, author: null }),
								threadDetailFixture({ path: "", line: 7, author: "carol" }),
							],
						}),
					],
				}),
			);

			expect(snapshot).toContain(
				"  unresolved: src/a.ts · alice; src/b.ts:5; (file unknown):7 · carol",
			);
		});

		test("appends [+k more] when total-resolved exceeds the detail count", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							threads: { resolved: 1, total: 5 },
							unresolvedThreads: [
								threadDetailFixture({ path: "src/a.ts", line: 10, author: "alice" }),
							],
						}),
					],
				}),
			);

			// total 5 - resolved 1 = 4 unresolved, minus 1 detail listed = 3 hidden.
			expect(snapshot).toContain("  unresolved: src/a.ts:10 · alice [+3 more]");
		});

		test("omits the [+k more] suffix when the detail count covers all unresolved", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [
						pr({
							branch: "solo",
							threads: { resolved: 0, total: 1 },
							unresolvedThreads: [
								threadDetailFixture({ path: "src/a.ts", line: 10, author: "alice" }),
							],
						}),
					],
				}),
			);

			expect(snapshot).toContain("  unresolved: src/a.ts:10 · alice");
			expect(snapshot).not.toContain("more]");
		});

		test("omits the unresolved line when there are no thread details", () => {
			const snapshot = renderPlainSnapshot(
				model({
					currentBranch: "solo",
					prs: [pr({ branch: "solo", threads: { resolved: 0, total: 3 }, unresolvedThreads: [] })],
				}),
			);

			expect(snapshot).not.toContain("  unresolved:");
		});
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

	test("wraps each PR body in collision-safe fences", () => {
		const prompt = buildSummaryPrompt(model({ prs: [pr({ body: "Meaningful body." })] }));

		expect(prompt).toContain("```text\nMeaningful body.\n```");
	});

	test("uses (no description) for an empty body", () => {
		const prompt = buildSummaryPrompt(model({ prs: [pr({ body: "   \n  " })] }));

		expect(prompt).toContain("```text\n(no description)\n```");
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
