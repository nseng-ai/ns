import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@nseng-ai/foundation/git/testing";
import type { Caps } from "@nseng-ai/clinkr";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import {
	renderShowObjectiveHuman,
	renderShowObjectiveMarkdown,
	runShowObjective,
	type ShowObjectiveOkResult,
} from "../../src/core/operations/show-objective.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

const NOW_MS = Date.parse("2026-07-05T00:00:00Z");
const CAPS: Caps = {
	isTty: false,
	colorDepth: "none",
	columns: 100,
	canRenderUnicode: true,
};

function frontmatter(lines: readonly string[]): string {
	return ["---", ...lines, "---", "", "# Objective", "", "## Thesis", "Body.", ""].join("\n");
}

function edgeBlock(edges: readonly { objective: string; annotation: string }[]): string[] {
	const rows = edges.flatMap((edge) => [
		`  - objective: ${edge.objective}`,
		`    annotation: ${edge.annotation}`,
	]);
	return ["edges:", ...rows];
}

describe("objective show", () => {
	test("plain open record reports no blocked sentence, edges, or branches", async () => {
		const exit = await runShowObjective(
			contextWith({ fake: { records: [{ slug: "alpha", objectiveMd: "# alpha\n" }] } }),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.status).toBe("ok");
		expect(data.isClosed).toBe(false);
		expect(data.blockedSentence).toBeNull();
		expect(data.edges).toEqual([]);
		expect(data.updatedBranches).toEqual([]);
		expect(data.isUpdatedBranchesTruncated).toBe(false);
		expect(Object.hasOwn(data, "frontmatterMalformed")).toBe(false);
	});

	test("blocked record surfaces and renders the blocked sentence", async () => {
		const exit = await runShowObjective(
			contextWith({
				fake: {
					records: [
						{ slug: "alpha", objectiveMd: frontmatter(["blocked: Gated on the dependency."]) },
					],
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.blockedSentence).toBe("Gated on the dependency.");
		expect(plainHuman(data)).toContain("Blocked  Gated on the dependency.");
		expect(renderShowObjectiveMarkdown(data)).toContain("Blocked: Gated on the dependency.");
	});

	test("edge with a readable active counterpart annotation resolves both perspectives", async () => {
		const exit = await runShowObjective(
			contextWith({
				fake: {
					records: [
						{
							slug: "alpha",
							objectiveMd: frontmatter(
								edgeBlock([{ objective: "beta", annotation: "Alpha depends on beta." }]),
							),
						},
						{
							slug: "beta",
							objectiveMd: frontmatter(
								edgeBlock([{ objective: "alpha", annotation: "Beta feeds alpha." }]),
							),
						},
					],
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.edges).toEqual([
			{
				objective: "beta",
				annotation: "Alpha depends on beta.",
				counterpart: { exists: true, isClosed: false, annotation: "Beta feeds alpha." },
			},
		]);
		const human = plainHuman(data);
		expect(human).toContain("Alpha depends on beta.");
		// Healthy back-edges stay off the human surface; both sides remain on the agent markdown.
		expect(human).not.toContain("Beta feeds alpha.");
		const markdown = renderShowObjectiveMarkdown(data);
		expect(markdown).toContain("Alpha depends on beta.");
		expect(markdown).toContain("Beta feeds alpha.");
	});

	test("closed active counterpart is hidden by default", async () => {
		const exit = await runShowObjective(contextWith({ fake: closedEdgeRecords() }), {
			slug: "alpha",
			shouldIncludeClosedEdges: false,
		});

		const data = expectOk(exit);
		expect(data.edges).toEqual([]);
		expect(plainHuman(data)).not.toContain("beta  closed");
		expect(renderShowObjectiveMarkdown(data)).not.toContain("### `beta` (closed)");
	});

	test("shouldIncludeClosedEdges renders a closed active counterpart", async () => {
		const exit = await runShowObjective(contextWith({ fake: closedEdgeRecords() }), {
			slug: "alpha",
			shouldIncludeClosedEdges: true,
		});

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({
			exists: true,
			isClosed: true,
			annotation: "Beta feeds alpha.",
		});
		expect(plainHuman(data)).toContain("beta  closed");
		expect(renderShowObjectiveMarkdown(data)).toContain("### `beta` (closed)");
	});

	test("missing counterpart yields exists false and a null annotation", async () => {
		const exit = await runShowObjective(
			contextWith({
				fake: {
					records: [
						{
							slug: "alpha",
							objectiveMd: frontmatter(
								edgeBlock([{ objective: "ghost", annotation: "Alpha depends on ghost." }]),
							),
						},
					],
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({
			exists: false,
			isClosed: null,
			annotation: null,
		});
	});

	test("counterpart without a back-edge yields a null annotation", async () => {
		const exit = await runShowObjective(
			contextWith({
				fake: {
					records: [
						{
							slug: "alpha",
							objectiveMd: frontmatter(
								edgeBlock([{ objective: "beta", annotation: "Alpha depends on beta." }]),
							),
						},
						{ slug: "beta", objectiveMd: "# beta\n" },
					],
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({
			exists: true,
			isClosed: false,
			annotation: null,
		});
	});

	test("counterpart with malformed frontmatter yields a null annotation", async () => {
		const exit = await runShowObjective(
			contextWith({
				fake: {
					records: [
						{
							slug: "alpha",
							objectiveMd: frontmatter(
								edgeBlock([{ objective: "beta", annotation: "Alpha depends on beta." }]),
							),
						},
						{ slug: "beta", objectiveMd: "---\nkind: broken\n---\n# beta\n" },
					],
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({
			exists: true,
			isClosed: false,
			annotation: null,
		});
	});

	test("attributes a local branch that touches the record", async () => {
		const exit = await runShowObjective(
			contextWith({
				fake: { records: [{ slug: "alpha", objectiveMd: "# alpha\n" }] },
				git: {
					localBranchTips: ["feature-x"],
					changedPaths: {
						"main...feature-x|.ns/objectives": [".ns/objectives/alpha/objective.md"],
					},
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.updatedBranches).toEqual(["feature-x"]);
		expect(data.isUpdatedBranchesTruncated).toBe(false);
		expect(renderShowObjectiveHuman(data, CAPS, NOW_MS)).toContain("feature-x");
	});

	test("marks branch attribution truncated beyond the walk ceiling", async () => {
		const branches = Array.from(
			{ length: 51 },
			(_, index) => `branch-${String(index).padStart(3, "0")}`,
		);
		const exit = await runShowObjective(
			contextWith({
				fake: { records: [{ slug: "alpha", objectiveMd: "# alpha\n" }] },
				git: {
					localBranchTips: branches,
					changedPaths: {
						"main...branch-000|.ns/objectives": [".ns/objectives/alpha/objective.md"],
					},
				},
			}),
			{ slug: "alpha", shouldIncludeClosedEdges: false },
		);

		const data = expectOk(exit);
		expect(data.updatedBranches).toEqual(["branch-000"]);
		expect(data.isUpdatedBranchesTruncated).toBe(true);
	});

	test("renders counterpart existence without back-edge prose", () => {
		const human = plainHuman(
			okResult({
				edges: [
					{
						objective: "beta",
						annotation: "Alpha depends on beta.",
						counterpart: { exists: true, isClosed: false, annotation: "Beta feeds alpha." },
					},
					{
						objective: "ghost",
						annotation: "Alpha depends on ghost.",
						counterpart: { exists: false, isClosed: null, annotation: null },
					},
				],
			}),
		);
		expect(human).toContain("beta  found");
		expect(human).toContain("ghost  missing");
		expect(human).toContain("Alpha depends on beta.");
		expect(human).not.toContain("Beta feeds alpha.");
		expect(human).not.toContain("back-edge");
	});

	test("wraps the blocked sentence with a hanging indent at narrow widths", () => {
		const narrow: Caps = { ...CAPS, columns: 40 };
		const sentence =
			"First external publish is gated on the hard dependency landing before anything ships.";
		const human = stripTerminalEscapes(
			renderShowObjectiveHuman(okResult({ blockedSentence: sentence }), narrow, NOW_MS),
		);
		const lines = human.split("\n");
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
		const blockedIndex = lines.findIndex((line) => line.startsWith("Blocked  "));
		expect(blockedIndex).toBeGreaterThan(-1);
		expect(lines[blockedIndex + 1]).toMatch(/^ {9}\S/u);
	});

	test("ascii caps degrade glyphs and separators", () => {
		const ascii: Caps = { ...CAPS, canRenderUnicode: false };
		const human = stripTerminalEscapes(
			renderShowObjectiveHuman(
				okResult({
					blockedSentence: "Gated.",
					updateCount: 2,
					updatedBranches: ["feature-x"],
					edges: [
						{
							objective: "beta",
							annotation: "Alpha depends on beta.",
							counterpart: { exists: true, isClosed: false, annotation: null },
						},
					],
				}),
				ascii,
				NOW_MS,
			),
		);
		expect(human).not.toMatch(/[●⊘·└├]/u);
		expect(human).toContain("  -  ");
	});

	test("header drops root and silent outstanding-changes noise", () => {
		const clean = plainHuman(okResult({}));
		expect(clean).not.toContain("Root:");
		expect(clean).not.toContain("Outstanding changes");
		expect(clean).not.toContain("Uncommitted changes");
		expect(clean).toContain(".ns/objectives/alpha");
		expect(clean).toContain("no updates");

		const dirty = plainHuman(
			okResult({
				hasOutstandingChanges: true,
				updateCount: 3,
				latestUpdateIso: "2026-07-04T12:00:00Z",
			}),
		);
		expect(dirty).toContain("Uncommitted changes not yet recorded in an update.");
		expect(dirty).toContain("3 updates");
		expect(dirty).toContain("latest 12 hours ago");
	});

	test("unknown slug exits negative with the not-found data", async () => {
		const exit = await runShowObjective(
			contextWith({ fake: { records: [{ slug: "alpha", objectiveMd: "# alpha\n" }] } }),
			{ slug: "missing", shouldIncludeClosedEdges: false },
		);

		if (exit.type !== "negative") throw new Error("expected negative exit");
		if (exit.data! === undefined || exit.data!.status !== "not-found") {
			throw new Error("expected not-found data");
		}
		expect(exit.data!.slug).toBe("missing");
		expect(exit.message).toContain("missing");
	});
});

function closedEdgeRecords(): FakeObjectiveStorageGatewayOptions {
	return {
		records: [
			{
				slug: "alpha",
				objectiveMd: frontmatter(
					edgeBlock([{ objective: "beta", annotation: "Alpha depends on beta." }]),
				),
			},
			{
				slug: "beta",
				isClosed: true,
				objectiveMd: frontmatter(
					edgeBlock([{ objective: "alpha", annotation: "Beta feeds alpha." }]),
				),
			},
		],
	};
}

function contextWith(options: {
	fake: FakeObjectiveStorageGatewayOptions;
	git?: InMemoryGitGatewayState;
	trunkBranch?: string;
}): ObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: options.trunkBranch ?? "main",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(options.fake)),
		git: new InMemoryGitGateway(options.git ?? {}),
	};
}

function okResult(overrides: Partial<ShowObjectiveOkResult>): ShowObjectiveOkResult {
	return {
		status: "ok",
		slug: "alpha",
		path: ".ns/objectives/alpha",
		rootPath: ".ns/objectives",
		isClosed: false,
		blockedSentence: null,
		latestUpdateIso: null,
		updateCount: 0,
		hasOutstandingChanges: false,
		updatedBranches: [],
		isUpdatedBranchesTruncated: false,
		edges: [],
		...overrides,
	};
}

function plainHuman(data: ShowObjectiveOkResult): string {
	return stripTerminalEscapes(renderShowObjectiveHuman(data, CAPS, NOW_MS));
}

function expectOk(exit: Awaited<ReturnType<typeof runShowObjective>>): ShowObjectiveOkResult {
	if (exit.type !== "ok") throw new Error(`expected ok exit, got ${exit.type}`);
	if (exit.data!?.status !== "ok") throw new Error("expected ok status");
	return exit.data!;
}
