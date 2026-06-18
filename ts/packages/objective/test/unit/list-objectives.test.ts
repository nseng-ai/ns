import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import { buildObjectiveBranchAttribution } from "../../src/operations/list-branch-attribution.ts";
import { latestUpdateIsoFromUpdateNames, matchesStatusFilter, type ObjectiveListResult, renderObjectiveListHuman } from "../../src/operations/list-objectives.ts";

const SAMPLE_RESULT: ObjectiveListResult = {
	trunkBranch: "master",
	rootPath: ".asdl/objectives",
	statusFilter: "active",
	namesOnly: false,
	updatedBranchesIncluded: true,
	records: [{ slug: "alpha", status: "open", latestUpdateIso: "2026-06-13T09:10:00Z", updatedBranches: ["feat/alpha"], hasOutstandingChanges: false }],
};

describe("renderObjectiveListHuman", () => {
	const esc = String.fromCharCode(0x1b);

	test("draws a header rule and stays plain when color is disabled", () => {
		const output = renderObjectiveListHuman(SAMPLE_RESULT, { color: false });
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
		const output = renderObjectiveListHuman(SAMPLE_RESULT, { color: true });
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
				"master|.asdl/objectives": "trunk-tree",
				"feat/newer|.asdl/objectives": "newer-tree",
				"feat/older|.asdl/objectives": "older-tree",
				"feat/same-tree|.asdl/objectives": "trunk-tree",
			},
			changedPaths: {
				"master...feat/newer|.asdl/objectives": [".asdl/objectives/alpha/objective.md"],
				"master...feat/older|.asdl/objectives": [".asdl/objectives/alpha/roadmap.md", ".asdl/objectives/branch-only/objective.md"],
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
		expect(git.changedPathsUnderCalls.map((call) => call.revisionRange)).toEqual(["master...feat/newer", "master...feat/older"]);
	});

	test("attributes branch-authored objective changes instead of trunk-only drift", async () => {
		const git = new InMemoryGitGateway({
			localBranchTips: [
				{ name: "master", headIso: "2026-05-01T00:00:00Z" },
				{ name: "feat/stale", headIso: "2026-05-02T00:00:00Z" },
			],
			treeOids: {
				"master|.asdl/objectives": "newer-trunk-tree",
				"feat/stale|.asdl/objectives": "older-branch-tree",
			},
			changedPaths: {
				"master...feat/stale|.asdl/objectives": [],
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
		expect(git.changedPathsUnderCalls.map((call) => call.revisionRange)).toEqual(["master...feat/stale"]);
	});
});
