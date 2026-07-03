import { InMemoryGitGateway } from "@ji/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { buildObjectiveBranchAttribution } from "../../src/core/operations/list-branch-attribution.ts";
import {
	latestUpdateIsoFromUpdateNames,
	matchesStatusFilter,
	type ObjectiveListResult,
	renderObjectiveListHuman,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../src/core/operations/list-objectives.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

const SAMPLE_RESULT: ObjectiveListResult = {
	trunkBranch: "master",
	rootPath: ".ji/objectives",
	statusFilter: "active",
	namesOnly: false,
	updatedBranchesIncluded: true,
	records: [
		{
			slug: "alpha",
			status: "open",
			latestUpdateIso: "2026-06-13T09:10:00Z",
			updatedBranches: ["feat/alpha"],
			hasOutstandingChanges: false,
		},
	],
};

describe("renderObjectiveListHuman", () => {
	const esc = String.fromCharCode(0x1b);

	test("renders the full human table with edges, blocked sub-state, and branch attribution continuations", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ji/objectives",
			statusFilter: "all",
			namesOnly: false,
			updatedBranchesIncluded: true,
			records: [
				{
					slug: "alpha",
					status: "open",
					isBlocked: true,
					latestUpdateIso: "2026-06-13T09:10:00Z",
					edgeCount: 2,
					updatedBranches: ["feat/alpha", "feat/beta"],
					hasOutstandingChanges: false,
				},
				{
					slug: "bravo-objective",
					status: "closed",
					latestUpdateIso: null,
					updatedBranches: [],
					hasOutstandingChanges: true,
				},
			],
		};

		expect(renderObjectiveListHuman(result, { canEmitAnsi: false }).split("\n")).toEqual([
			"Objective records in this checkout",
			"Root: .ji/objectives",
			"Status filter: all",
			"",
			"OBJECTIVE        STATUS            LATEST UPDATE         EDGES  UPDATED BRANCHES",
			"───────────────  ────────────────  ────────────────────  ─────  ────────────────",
			"alpha            ⊘ open (blocked)  2026-06-13T09:10:00Z  2      ├ 1/2 feat/alpha",
			"                                                                └ 2/2 feat/beta",
			"bravo-objective  ✓ closed          (x) —                        —",
		]);
	});

	test("markdown table carries the edges column blank-when-zero and the blocked open sub-state", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ji/objectives",
			statusFilter: "all",
			namesOnly: false,
			records: [
				{
					slug: "alpha",
					status: "open",
					isBlocked: true,
					latestUpdateIso: null,
					edgeCount: 2,
					hasOutstandingChanges: false,
				},
				{ slug: "bravo", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
			],
		};

		const lines = renderObjectiveListMarkdown(result).split("\n");
		expect(lines).toContain("| objective | status | latest update | edges |");
		expect(lines).toContain("| alpha | ⊘ open (blocked) | — | 2 |");
		expect(lines).toContain("| bravo | ● open | — |  |");
	});

	test("human status cells use canonical ASCII glyph fallbacks", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ji/objectives",
			statusFilter: "all",
			namesOnly: false,
			records: [
				{ slug: "alpha", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
				{
					slug: "blocked",
					status: "open",
					isBlocked: true,
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
				{ slug: "closed", status: "closed", latestUpdateIso: null, hasOutstandingChanges: false },
			],
		};

		const output = renderObjectiveListHuman(result, {
			canEmitAnsi: false,
			caps: { isTty: false, colorDepth: "none", columns: 80, canRenderUnicode: false },
		});
		expect(output).toContain("o open");
		expect(output).toContain("! open (blocked)");
		expect(output).toContain("v closed");
	});

	test("draws a header rule and stays plain when color is disabled", () => {
		const output = renderObjectiveListHuman(SAMPLE_RESULT, { canEmitAnsi: false });
		expect(output).not.toContain(esc);
		expect(output).toContain("OBJECTIVE");
		const lines = output.split("\n");
		const headerIndex = lines.findIndex((line) => line.startsWith("OBJECTIVE"));
		expect(lines[headerIndex + 1]?.startsWith("─")).toBe(true); // SIMPLE_HEAD rule under the header
	});

	test("defaults to no color when capabilities are omitted", () => {
		expect(renderObjectiveListHuman(SAMPLE_RESULT)).not.toContain(esc);
	});

	test("emits bold-cyan header and slug plus dim timestamp when color is enabled", () => {
		const output = renderObjectiveListHuman(SAMPLE_RESULT, { canEmitAnsi: true });
		expect(output).toContain(`${esc}[1;36mOBJECTIVE${esc}[0m`);
		expect(output).toContain(`${esc}[1;36malpha${esc}[0m`);
		expect(output).toContain(`${esc}[2m2026-06-13T09:10:00Z${esc}[0m`);
	});
});

describe("objective list helpers", () => {
	test("matches checkout-local status filters", () => {
		expect(matchesStatusFilter("open", "active")).toBe(true);
		expect(matchesStatusFilter("closed", "active")).toBe(false);
		expect(matchesStatusFilter("open", "open")).toBe(true);
		expect(matchesStatusFilter("closed", "closed")).toBe(true);
		expect(matchesStatusFilter("open", "all")).toBe(true);
		expect(matchesStatusFilter("closed", "all")).toBe(true);
	});

	test("selects latest timestamp-prefixed direct update name deterministically", () => {
		expect(
			latestUpdateIsoFromUpdateNames([
				"2026-06-08-1723-node-runtime-compatibility-hardened.md",
				"notes.md",
				"2026-06-15T223520Z-typescript-package-read-objective.md",
			]),
		).toBe("2026-06-15T22:35:20Z");
	});

	test("returns null when no update name has an accepted timestamp prefix", () => {
		expect(latestUpdateIsoFromUpdateNames(["alpha.md", "zeta.md"])).toBeNull();
	});

	test("fake-backed branch attribution prefilters branches and attributes active objective slugs", async () => {
		const git = new InMemoryGitGateway({
			localBranchTips: [
				{ name: "master", headIso: "2026-05-01T00:00:00Z" },
				{ name: "feat/older", headIso: "2026-05-02T00:00:00Z" },
				{ name: "feat/newer", headIso: "2026-05-03T00:00:00Z" },
				{ name: "feat/same-tree", headIso: "2026-05-04T00:00:00Z" },
			],
			treeOids: {
				"master|.ji/objectives": "trunk-tree",
				"feat/newer|.ji/objectives": "newer-tree",
				"feat/older|.ji/objectives": "older-tree",
				"feat/same-tree|.ji/objectives": "trunk-tree",
			},
			changedPaths: {
				"master...feat/newer|.ji/objectives": [".ji/objectives/alpha/objective.md"],
				"master...feat/older|.ji/objectives": [
					".ji/objectives/alpha/roadmap.md",
					".ji/objectives/branch-only/objective.md",
				],
			},
		});

		const result = await buildObjectiveBranchAttribution(git, {
			repoRoot: "/repo",
			trunkBranch: "master",
			slugs: new Set(["alpha"]),
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.value.updatedBranchesBySlug.get("alpha")).toEqual(["feat/newer", "feat/older"]);
		expect(git.changedPathsUnderCalls.map((call) => call.revisionRange)).toEqual([
			"master...feat/newer",
			"master...feat/older",
		]);
	});

	test("list carries Record Frontmatter edge/blocked facts and stays unchanged without them", async () => {
		const listWithObjectiveMd = async (objectiveMd: string) => {
			const ctx: ObjectiveCliContext = {
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				repoRoot: "/repo",
				trunkBranch: "master",
				storage: new ObjectiveStorage(
					new FakeObjectiveStorageGateway({
						records: [
							{
								slug: "alpha",
								objectiveMd,
								updates: { "2026-06-15T223520Z-progress.md": "# Progress\n" },
							},
						],
					}),
				),
				git: new InMemoryGitGateway(),
			};
			return await runListObjectives(ctx, { names: false, status: "active", minimal: true });
		};

		// A record without frontmatter lists exactly as before: no edge/blocked keys at all.
		const withoutFrontmatter = await listWithObjectiveMd("# alpha\n\n## Thesis\n");
		if (withoutFrontmatter.type !== "ok") throw new Error("expected ok exit");
		expect(withoutFrontmatter.data.records).toEqual([
			{
				slug: "alpha",
				status: "open",
				latestUpdateIso: "2026-06-15T22:35:20Z",
				hasOutstandingChanges: false,
			},
		]);

		// Frontmatter carrying no blocked sentence and no edges lists identically to none.
		const emptyFrontmatter = await listWithObjectiveMd(
			"---\nedges: []\n---\n# alpha\n\n## Thesis\n",
		);
		expect(emptyFrontmatter).toEqual(withoutFrontmatter);

		// Malformed frontmatter renders safely minimal — like no frontmatter — instead of
		// erroring the list; reporting it is the `sdl objective check` linter's job.
		const malformedFrontmatter = await listWithObjectiveMd("---\nblocked: [\n---\n# alpha\n");
		expect(malformedFrontmatter).toEqual(withoutFrontmatter);

		// Blocked sentence and edges surface as the blocked sub-state and the edge count,
		// including under --minimal.
		const blockedWithEdges = await listWithObjectiveMd(
			[
				"---",
				"blocked: Gated on an upstream landing.",
				"edges:",
				"  - objective: bravo",
				"    annotation: Consumed as a hard dependency.",
				"---",
				"# alpha",
				"",
				"## Thesis",
				"",
			].join("\n"),
		);
		if (blockedWithEdges.type !== "ok") throw new Error("expected ok exit");
		expect(blockedWithEdges.data.records).toEqual([
			{
				slug: "alpha",
				status: "open",
				isBlocked: true,
				latestUpdateIso: "2026-06-15T22:35:20Z",
				edgeCount: 1,
				hasOutstandingChanges: false,
			},
		]);
	});

	test("attributes branch-authored objective changes instead of trunk-only drift", async () => {
		const git = new InMemoryGitGateway({
			localBranchTips: [
				{ name: "master", headIso: "2026-05-01T00:00:00Z" },
				{ name: "feat/stale", headIso: "2026-05-02T00:00:00Z" },
			],
			treeOids: {
				"master|.ji/objectives": "newer-trunk-tree",
				"feat/stale|.ji/objectives": "older-branch-tree",
			},
			changedPaths: {
				"master...feat/stale|.ji/objectives": [],
			},
		});

		const result = await buildObjectiveBranchAttribution(git, {
			repoRoot: "/repo",
			trunkBranch: "master",
			slugs: new Set(["alpha"]),
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.value.updatedBranchesBySlug.get("alpha")).toEqual([]);
		expect(git.changedPathsUnderCalls.map((call) => call.revisionRange)).toEqual([
			"master...feat/stale",
		]);
	});
});
