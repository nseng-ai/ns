import {
	InMemoryGitGateway,
	type InMemoryGitGatewayState,
} from "@nseng-ai/capability-kit/git/testing";
import type { Caps } from "@nseng-ai/clinkr";
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.status).toBe("ok");
		expect(data.closed).toBe(false);
		expect(data.blockedSentence).toBeNull();
		expect(data.edges).toEqual([]);
		expect(data.updatedBranches).toEqual([]);
		expect(data.updatedBranchesTruncated).toBe(false);
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.blockedSentence).toBe("Gated on the dependency.");
		expect(renderShowObjectiveHuman(data, CAPS, NOW_MS)).toContain(
			"Blocked: Gated on the dependency.",
		);
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.edges).toEqual([
			{
				objective: "beta",
				annotation: "Alpha depends on beta.",
				counterpart: { state: "active", annotation: "Beta feeds alpha." },
			},
		]);
		const human = renderShowObjectiveHuman(data, CAPS, NOW_MS);
		expect(human).toContain("this record: Alpha depends on beta.");
		expect(human).toContain("beta: Beta feeds alpha.");
	});

	test("archived counterpart reports archived state with its back-edge annotation", async () => {
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
							isArchived: true,
							objectiveMd: frontmatter(
								edgeBlock([{ objective: "alpha", annotation: "Beta feeds alpha." }]),
							),
						},
					],
				},
			}),
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({
			state: "archived",
			annotation: "Beta feeds alpha.",
		});
	});

	test("missing counterpart yields missing state and a null annotation", async () => {
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({ state: "missing", annotation: null });
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({ state: "active", annotation: null });
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.edges[0]?.counterpart).toEqual({ state: "active", annotation: null });
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.updatedBranches).toEqual(["feature-x"]);
		expect(data.updatedBranchesTruncated).toBe(false);
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
			{ slug: "alpha" },
		);

		const data = expectOk(exit);
		expect(data.updatedBranches).toEqual(["branch-000"]);
		expect(data.updatedBranchesTruncated).toBe(true);
	});

	test("unknown slug exits negative with the not-found data", async () => {
		const exit = await runShowObjective(
			contextWith({ fake: { records: [{ slug: "alpha", objectiveMd: "# alpha\n" }] } }),
			{ slug: "missing" },
		);

		if (exit.type !== "negative") throw new Error("expected negative exit");
		if (exit.data === undefined || exit.data.status !== "not-found") {
			throw new Error("expected not-found data");
		}
		expect(exit.data.slug).toBe("missing");
		expect(exit.message).toContain("missing");
	});
});

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

function expectOk(exit: Awaited<ReturnType<typeof runShowObjective>>): ShowObjectiveOkResult {
	if (exit.type !== "ok") throw new Error(`expected ok exit, got ${exit.type}`);
	if (exit.data.status !== "ok") throw new Error(`expected ok status, got ${exit.data.status}`);
	return exit.data;
}
