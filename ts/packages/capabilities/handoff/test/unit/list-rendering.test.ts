import { describe, expect, test } from "vitest";

import { renderList, renderListMarkdown, type ListResult } from "../../src/core/operations/list.ts";

const BRANCH_SCOPE_RESULT: ListResult = {
	scope: "branch",
	branch: "feat/x",
	includeDeleted: false,
	handoffs: [
		{
			branch: "feat/x",
			branchState: "active",
			slug: "alpha",
			key: "alpha.md",
			entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
			updatedAt: "2026-01-01T00:00:02+00:00",
		},
		{
			branch: "feat/x",
			branchState: "active",
			slug: "longer-handoff",
			key: "longer-handoff.md",
			entryLocator: "refs/brmem/ns/handoff/feat---x:longer-handoff.md",
			updatedAt: "2026-01-01T00:00:01+00:00",
		},
	],
};

const ALL_BRANCHES_RESULT: ListResult = {
	scope: "all-branches",
	branch: null,
	includeDeleted: true,
	handoffs: [
		{
			branch: "feat/a",
			branchState: "active",
			slug: "alpha",
			key: "alpha.md",
			entryLocator: "refs/brmem/ns/handoff/feat---a:alpha.md",
			updatedAt: "2026-01-01T00:00:02+00:00",
		},
		{
			branch: "feat/deleted",
			branchState: "deleted",
			slug: "stale",
			key: "stale.md",
			entryLocator: "refs/brmem/ns/handoff/feat---deleted:stale.md",
			updatedAt: "2026-01-01T00:00:01+00:00",
		},
	],
};

describe("handoff list rendering", () => {
	const esc = String.fromCharCode(0x1b);

	test("renders branch-scope human output as an aligned table", () => {
		expect(renderList(BRANCH_SCOPE_RESULT, { canEmitAnsi: false }).split("\n")).toEqual([
			"Handoffs on feat/x",
			"",
			"HANDOFF         UPDATED",
			"alpha           2026-01-01T00:00:02+00:00",
			"longer-handoff  2026-01-01T00:00:01+00:00",
		]);
	});

	test("renders all-branches human output with branch state and include-deleted title", () => {
		expect(renderList(ALL_BRANCHES_RESULT, { canEmitAnsi: false }).split("\n")).toEqual([
			"Handoffs across branches",
			"",
			"BRANCH        STATE    HANDOFF  UPDATED",
			"feat/a        active   alpha    2026-01-01T00:00:02+00:00",
			"feat/deleted  deleted  stale    2026-01-01T00:00:01+00:00",
		]);
	});

	test("defaults human output to plain text and styles only table cells when color is enabled", () => {
		expect(renderList(BRANCH_SCOPE_RESULT)).not.toContain(esc);

		const colored = renderList(BRANCH_SCOPE_RESULT, {
			canEmitAnsi: true,
			caps: { isTty: true, colorDepth: "truecolor", columns: 80, canRenderUnicode: true },
		});
		expect(colored).toContain(`${esc}[2mHANDOFF${esc}[0m`);
		expect(colored).toContain(`${esc}[38;2;34;211;238malpha${esc}[0m`);
		expect(colored).toContain("2026-01-01T00:00:02+00:00");
		expect(colored.startsWith("Handoffs on feat/x\n\n")).toBe(true);
	});

	test("keeps markdown output pipe-based and escapes pipe characters", () => {
		const result: ListResult = {
			...BRANCH_SCOPE_RESULT,
			handoffs: [{ ...BRANCH_SCOPE_RESULT.handoffs[0]!, slug: "alpha|pipe" }],
		};

		expect(renderListMarkdown(result).split("\n")).toEqual([
			"Handoffs on feat/x",
			"",
			"| handoff | updated |",
			"| --- | --- |",
			"| alpha\\|pipe | 2026-01-01T00:00:02+00:00 |",
		]);
	});
});
