import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
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
	rootPath: ".ns/objectives",
	statusFilter: "active",
	namesOnly: false,
	records: [
		{
			slug: "alpha",
			status: "open",
			latestUpdateIso: "2026-06-13T09:10:00Z",
			hasOutstandingChanges: false,
		},
	],
};

describe("renderObjectiveListHuman", () => {
	const esc = String.fromCharCode(0x1b);

	test("renders the compact human table with edges and blocked state text", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ns/objectives",
			statusFilter: "all",
			namesOnly: false,
			records: [
				{
					slug: "alpha",
					status: "open",
					isBlocked: true,
					latestUpdateIso: "2026-06-13T09:10:00Z",
					edgeCount: 2,
					hasOutstandingChanges: false,
				},
				{
					slug: "bravo-objective",
					status: "closed",
					latestUpdateIso: null,
					hasOutstandingChanges: true,
				},
			],
		};

		expect(renderObjectiveListHuman(result, { canEmitAnsi: false }).split("\n")).toEqual([
			"Objective records in this checkout",
			"Root: .ns/objectives",
			"Status filter: all",
			"",
			"OBJECTIVE        STATUS     LATEST UPDATE         BRANCHES  EDGES",
			"───────────────  ─────────  ────────────────────  ────────  ─────",
			"alpha            ⊘ blocked  2026-06-13T09:10:00Z  0         2",
			"bravo-objective  ✓ closed   (x) —                 0",
		]);
	});

	test("markdown table carries the edges column blank-when-zero and blocked state text", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ns/objectives",
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
		expect(lines).toContain("| objective | status | latest update | branches | edges |");
		expect(lines).toContain("| alpha | ⊘ blocked | — | 0 | 2 |");
		expect(lines).toContain("| bravo | ● open | — | 0 |  |");
	});

	test("human status cells use canonical ASCII glyph fallbacks", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ns/objectives",
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
		expect(output).toContain("! blocked");
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

	test("parses fully-compact update timestamps", () => {
		expect(latestUpdateIsoFromUpdateNames(["20260701T185244Z-grilling-decisions.md"])).toBe(
			"2026-07-01T18:52:44Z",
		);
	});

	test("orders fully-compact names against dashed forms by timestamp", () => {
		expect(
			latestUpdateIsoFromUpdateNames([
				"2026-06-15T223520Z-typescript-package-read-objective.md",
				"20260701T185244Z-grilling-decisions.md",
			]),
		).toBe("2026-07-01T18:52:44Z");
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
				"master|.ns/objectives": "trunk-tree",
				"feat/newer|.ns/objectives": "newer-tree",
				"feat/older|.ns/objectives": "older-tree",
				"feat/same-tree|.ns/objectives": "trunk-tree",
			},
			changedPaths: {
				"master...feat/newer|.ns/objectives": [".ns/objectives/alpha/objective.md"],
				"master...feat/older|.ns/objectives": [
					".ns/objectives/alpha/roadmap.md",
					".ns/objectives/branch-only/objective.md",
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
			return await runListObjectives(ctx, { names: false, status: "active" });
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
		// erroring the list; reporting it is the `ns objective check` linter's job.
		const malformedFrontmatter = await listWithObjectiveMd("---\nblocked: [\n---\n# alpha\n");
		expect(malformedFrontmatter).toEqual(withoutFrontmatter);

		// Blocked sentence and edges surface as blocked state text and the edge count.
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

	test("list records carry the related local branch count for show drill-down", async () => {
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
							objectiveMd: "# alpha\n\n## Thesis\n",
							updates: { "2026-06-15T223520Z-progress.md": "# Progress\n" },
						},
					],
				}),
			),
			git: new InMemoryGitGateway({
				localBranchTips: [
					{ name: "master", headIso: "2026-05-01T00:00:00Z" },
					{ name: "feat/newer", headIso: "2026-05-03T00:00:00Z" },
					{ name: "feat/older", headIso: "2026-05-02T00:00:00Z" },
				],
				treeOids: {
					"master|.ns/objectives": "trunk-tree",
					"feat/newer|.ns/objectives": "newer-tree",
					"feat/older|.ns/objectives": "older-tree",
				},
				changedPaths: {
					"master...feat/newer|.ns/objectives": [".ns/objectives/alpha/objective.md"],
					"master...feat/older|.ns/objectives": [".ns/objectives/alpha/roadmap.md"],
				},
			}),
		};

		const exit = await runListObjectives(ctx, { names: false, status: "active" });
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(exit.data.records[0]).toMatchObject({ slug: "alpha", updatedBranchCount: 2 });
		expect(renderObjectiveListHuman(exit.data)).toContain("2");
	});

	test("attributes branch-authored objective changes instead of trunk-only drift", async () => {
		const git = new InMemoryGitGateway({
			localBranchTips: [
				{ name: "master", headIso: "2026-05-01T00:00:00Z" },
				{ name: "feat/stale", headIso: "2026-05-02T00:00:00Z" },
			],
			treeOids: {
				"master|.ns/objectives": "newer-trunk-tree",
				"feat/stale|.ns/objectives": "older-branch-tree",
			},
			changedPaths: {
				"master...feat/stale|.ns/objectives": [],
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
