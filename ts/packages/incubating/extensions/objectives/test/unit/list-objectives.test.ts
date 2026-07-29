import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { FakeObjectiveOwnerGateway } from "../../src/core/owner-gateway.ts";
import { buildObjectiveBranchAttribution } from "../../src/core/operations/list-branch-attribution.ts";
import {
	latestUpdateIsoFromUpdateNames,
	matchesStatusFilter,
	type ObjectiveListResult,
	renderObjectiveListHuman,
	renderObjectiveListMarkdown,
	runListObjectives,
} from "../../src/core/operations/list-objectives.ts";
import { ObjectiveStorage, type ObjectiveRecordLocation } from "../../src/core/storage.ts";

const OWNER = "tester";

function nestedLocation(slug: string): ObjectiveRecordLocation {
	return {
		owner: OWNER,
		slug,
		locator: `${OWNER}/${slug}`,
		recordRelativePath: `.ns/objectives/${OWNER}/${slug}`,
		layout: "owner-nested",
		status: "open",
	};
}

const SAMPLE_RESULT: ObjectiveListResult = {
	trunkBranch: "master",
	rootPath: ".ns/objectives",
	statusFilter: "active",
	ownerScope: { type: "current", owner: OWNER },
	namesOnly: false,
	records: [
		{
			owner: OWNER,
			slug: "alpha",
			locator: "tester/alpha",
			status: "open",
			layout: "owner-nested",
			latestUpdateIso: "2026-06-13T09:10:00Z",
			hasOutstandingChanges: false,
		},
	],
};

describe("renderObjectiveListHuman", () => {
	const esc = String.fromCharCode(0x1b);

	test("renders owner-grouped human tables with edges and blocked state text", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ns/objectives",
			statusFilter: "all",
			ownerScope: { type: "all" },
			namesOnly: false,
			records: [
				{
					owner: OWNER,
					slug: "alpha",
					locator: "tester/alpha",
					status: "open",
					layout: "owner-nested",
					isBlocked: true,
					latestUpdateIso: "2026-06-13T09:10:00Z",
					edgeCount: 2,
					hasOutstandingChanges: false,
				},
				{
					owner: OWNER,
					slug: "bravo-objective",
					locator: "tester/bravo-objective",
					status: "closed",
					layout: "legacy-flat-closed",
					latestUpdateIso: null,
					hasOutstandingChanges: true,
				},
			],
		};

		expect(renderObjectiveListHuman(result, { canEmitAnsi: false }).split("\n")).toEqual([
			"Objective records in this checkout",
			"Root: .ns/objectives",
			"Owner scope: all owners",
			"Status filter: all",
			"",
			"@tester",
			"OBJECTIVE        STATUS     LATEST UPDATE         BRANCHES  EDGES",
			"───────────────  ─────────  ────────────────────  ────────  ─────",
			"alpha            ⊘ blocked  2026-06-13T09:10:00Z  0         2",
			"bravo-objective  ✓ closed   (x) —                 0",
		]);
	});

	test("markdown output groups records under owner headings", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ns/objectives",
			statusFilter: "all",
			ownerScope: { type: "all" },
			namesOnly: false,
			records: [
				{
					owner: OWNER,
					slug: "alpha",
					locator: "tester/alpha",
					status: "open",
					layout: "owner-nested",
					isBlocked: true,
					latestUpdateIso: null,
					edgeCount: 2,
					hasOutstandingChanges: false,
				},
				{
					owner: "other",
					slug: "bravo",
					locator: "other/bravo",
					status: "open",
					layout: "owner-nested",
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
			],
		};

		const lines = renderObjectiveListMarkdown(result).split("\n");
		expect(lines).toContain("## @tester");
		expect(lines).toContain("## @other");
		expect(lines).toContain("| alpha | ⊘ blocked | — | 0 | 2 |");
		expect(lines).toContain("| bravo | ● open | — | 0 |  |");
	});

	test("names output emits one full locator per line", () => {
		const result: ObjectiveListResult = {
			...SAMPLE_RESULT,
			namesOnly: true,
			records: [
				...SAMPLE_RESULT.records,
				{
					owner: "other",
					slug: "bravo",
					locator: "other/bravo",
					status: "open",
					layout: "owner-nested",
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
			],
		};
		expect(renderObjectiveListHuman(result)).toBe("tester/alpha\nother/bravo");
		expect(renderObjectiveListMarkdown(result)).toBe("tester/alpha\nother/bravo");
	});

	test("human status cells use canonical ASCII glyph fallbacks", () => {
		const result: ObjectiveListResult = {
			trunkBranch: "master",
			rootPath: ".ns/objectives",
			statusFilter: "all",
			ownerScope: { type: "current", owner: OWNER },
			namesOnly: false,
			records: [
				{
					owner: OWNER,
					slug: "alpha",
					locator: "tester/alpha",
					status: "open",
					layout: "owner-nested",
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
				{
					owner: OWNER,
					slug: "blocked",
					locator: "tester/blocked",
					status: "open",
					layout: "owner-nested",
					isBlocked: true,
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
				{
					owner: OWNER,
					slug: "closed",
					locator: "tester/closed",
					status: "closed",
					layout: "owner-nested",
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
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

describe("objective list owner scope", () => {
	function ctxWithRecords(
		owner: FakeObjectiveOwnerGateway = new FakeObjectiveOwnerGateway({ owner: OWNER }),
	): ObjectiveCliContext {
		return {
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			repoRoot: "/repo",
			trunkBranch: "master",
			storage: new ObjectiveStorage(
				new FakeObjectiveStorageGateway({
					records: [
						{ owner: OWNER, slug: "alpha" },
						{ owner: "other", slug: "bravo" },
					],
				}),
			),
			git: new InMemoryGitGateway(),
			owner,
		};
	}

	test("defaults to the authenticated current owner", async () => {
		const exit = await runListObjectives(ctxWithRecords(), {
			names: false,
			status: "active",
			allOwners: false,
		});
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.ownerScope).toEqual({ type: "current", owner: OWNER });
		expect(exit.data.records.map((record) => record.locator)).toEqual(["tester/alpha"]);
	});

	test("--owner selects a namespace without authentication", async () => {
		const ownerGateway = new FakeObjectiveOwnerGateway({});
		const exit = await runListObjectives(ctxWithRecords(ownerGateway), {
			names: false,
			status: "active",
			owner: "other",
			allOwners: false,
		});
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.ownerScope).toEqual({ type: "explicit", owner: "other" });
		expect(exit.data.records.map((record) => record.locator)).toEqual(["other/bravo"]);
		expect(ownerGateway.callCount).toBe(0);
	});

	test("--all-owners lists every discovered owner without authentication", async () => {
		const ownerGateway = new FakeObjectiveOwnerGateway({});
		const exit = await runListObjectives(ctxWithRecords(ownerGateway), {
			names: false,
			status: "active",
			allOwners: true,
		});
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.ownerScope).toEqual({ type: "all" });
		expect(exit.data.records.map((record) => record.locator)).toEqual([
			"other/bravo",
			"tester/alpha",
		]);
		expect(ownerGateway.callCount).toBe(0);
	});

	test("--owner with --all-owners is a usage error", async () => {
		const exit = await runListObjectives(ctxWithRecords(), {
			names: false,
			status: "active",
			owner: OWNER,
			allOwners: true,
		});
		expect(exit.type).toBe("usageError");
	});

	test("invalid explicit owner is a usage error validated offline", async () => {
		const exit = await runListObjectives(ctxWithRecords(), {
			names: false,
			status: "active",
			owner: "Bad_Handle",
			allOwners: false,
		});
		expect(exit.type).toBe("usageError");
	});

	test("default listing without an authenticated owner fails with guidance", async () => {
		const exit = await runListObjectives(ctxWithRecords(new FakeObjectiveOwnerGateway({})), {
			names: false,
			status: "active",
			allOwners: false,
		});
		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("--all-owners");
	});

	test("--status filtering stays orthogonal to owner scope", async () => {
		const ctx: ObjectiveCliContext = {
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			repoRoot: "/repo",
			trunkBranch: "master",
			storage: new ObjectiveStorage(
				new FakeObjectiveStorageGateway({
					records: [
						{ owner: OWNER, slug: "open-record" },
						{ owner: OWNER, slug: "closed-record", isClosed: true },
						{ owner: OWNER, slug: "legacy-record", layout: "legacy-flat-closed" },
					],
				}),
			),
			git: new InMemoryGitGateway(),
			owner: new FakeObjectiveOwnerGateway({ owner: OWNER }),
		};

		const closedOnly = await runListObjectives(ctx, {
			names: true,
			status: "closed",
			allOwners: false,
		});
		if (closedOnly.type !== "ok") throw new Error("expected ok exit");
		expect(closedOnly.data.records.map((record) => record.locator)).toEqual([
			"tester/closed-record",
			"tester/legacy-record",
		]);
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

	test("fake-backed branch attribution prefilters branches and attributes locators", async () => {
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
				"master...feat/newer|.ns/objectives": [".ns/objectives/tester/alpha/objective.md"],
				"master...feat/older|.ns/objectives": [
					".ns/objectives/tester/alpha/roadmap.md",
					".ns/objectives/tester/branch-only/objective.md",
				],
			},
		});

		const result = await buildObjectiveBranchAttribution(git, {
			repoRoot: "/repo",
			trunkBranch: "master",
			locations: [nestedLocation("alpha")],
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.value.updatedBranchesByLocator.get("tester/alpha")).toEqual([
			"feat/newer",
			"feat/older",
		]);
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
								owner: OWNER,
								slug: "alpha",
								objectiveMd,
								updates: { "2026-06-15T223520Z-progress.md": "# Progress\n" },
							},
						],
					}),
				),
				git: new InMemoryGitGateway(),
				owner: new FakeObjectiveOwnerGateway({ owner: OWNER }),
			};
			return await runListObjectives(ctx, { names: false, status: "active", allOwners: false });
		};

		// A record without frontmatter lists exactly as before: no edge/blocked keys at all.
		const withoutFrontmatter = await listWithObjectiveMd("# alpha\n\n## Thesis\n");
		if (withoutFrontmatter.type !== "ok") throw new Error("expected ok exit");
		expect(withoutFrontmatter.data.records).toEqual([
			{
				owner: OWNER,
				slug: "alpha",
				locator: "tester/alpha",
				status: "open",
				layout: "owner-nested",
				latestUpdateIso: "2026-06-15T22:35:20Z",
				hasOutstandingChanges: false,
			},
		]);

		// Frontmatter carrying no blocked sentence and no edges lists identically to none.
		const emptyFrontmatter = await listWithObjectiveMd(
			`---\nowner: ${OWNER}\nedges: []\n---\n# alpha\n\n## Thesis\n`,
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
				`owner: ${OWNER}`,
				"blocked: Gated on an upstream landing.",
				"edges:",
				"  - objective: tester/bravo",
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
				owner: OWNER,
				slug: "alpha",
				locator: "tester/alpha",
				status: "open",
				layout: "owner-nested",
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
							owner: OWNER,
							slug: "alpha",
							objectiveMd: `---\nowner: ${OWNER}\n---\n# alpha\n\n## Thesis\n`,
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
					"master...feat/newer|.ns/objectives": [".ns/objectives/tester/alpha/objective.md"],
					"master...feat/older|.ns/objectives": [".ns/objectives/tester/alpha/roadmap.md"],
				},
			}),
			owner: new FakeObjectiveOwnerGateway({ owner: OWNER }),
		};

		const exit = await runListObjectives(ctx, { names: false, status: "active", allOwners: false });
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
			locations: [nestedLocation("alpha")],
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.value.updatedBranchesByLocator.get("tester/alpha")).toEqual([]);
		expect(git.changedPathsUnderCalls.map((call) => call.revisionRange)).toEqual([
			"master...feat/stale",
		]);
	});
});
