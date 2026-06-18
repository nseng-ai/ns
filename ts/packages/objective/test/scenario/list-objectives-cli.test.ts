import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("objective list", () => {
	test("help exposes minimal inventory options and rejects removed status values", async () => {
		const help = runScenario(["list", "--help"]);
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: objective list");
		expect(output).toContain("List Objective records in the current checkout.");
		expect(output).toContain("--names");
		expect(output).toContain("--status");
		expect(output).toContain("--minimal");
		expect(output).not.toContain("--branches");
		expect(output).not.toContain("--updated-branches");

		const invalid = runScenario(["list", "--status", "in-flight"]);
		expect(await invalid.exit).toBe(2);
		expect(invalid.stderr.join("")).toContain("status");
	});

	test("returns minimal JSON envelope with active open records by default", async () => {
		const run = runScenario(["list", "--minimal", "--format", "json"], {
			fake: {
				records: [
					{ slug: "open-one", updates: { "2026-06-15T223520Z-typescript-package-read-objective.md": "# Update\n" } },
					{ slug: "closed-one", isClosed: true, updates: { "2026-06-14T210415Z-closed.md": "# Closed\n" } },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				trunkBranch: "master",
				rootPath: ".asdl/objectives",
				statusFilter: "active",
				namesOnly: false,
				records: [
					{
						slug: "open-one",
						status: "open",
						latestUpdateIso: "2026-06-15T22:35:20Z",
						hasOutstandingChanges: false,
					},
				],
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("filters open closed and all active-root records while omitting archive-root records", async () => {
		const fake = {
			records: [{ slug: "alpha" }, { slug: "done", isClosed: true }],
			directories: [".asdl/objective-archive/archived"],
		};
		const open = runScenario(["list", "--minimal", "--format", "json", "--status", "open"], { fake });
		const closed = runScenario(["list", "--format", "json", "--status", "closed"], { fake });
		const all = runScenario(["list", "--format", "json", "--status", "all"], { fake });

		expect(await open.exit).toBe(0);
		expect(await closed.exit).toBe(0);
		expect(await all.exit).toBe(0);
		expect(recordSlugs(parseJsonOutput(open))).toEqual(["alpha"]);
		expect(recordSlugs(parseJsonOutput(closed))).toEqual(["done"]);
		expect(recordSlugs(parseJsonOutput(all))).toEqual(["alpha", "done"]);
		expect((parseJsonOutput(closed) as { data: { updatedBranchesIncluded: boolean } }).data.updatedBranchesIncluded).toBe(true);
		expect((parseJsonOutput(all) as { data: { updatedBranchesIncluded: boolean } }).data.updatedBranchesIncluded).toBe(true);
	});

	test("includes incomplete direct child directories as active records", async () => {
		const run = runScenario(["list", "--minimal", "--format", "json"], {
			fake: { directories: [".asdl/objectives/incomplete"] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				trunkBranch: "master",
				rootPath: ".asdl/objectives",
				statusFilter: "active",
				namesOnly: false,
				records: [{ slug: "incomplete", status: "open", latestUpdateIso: null, hasOutstandingChanges: false }],
			},
		});
	});

	test("names-only output emits filtered slug lines without headings", async () => {
		const run = runScenario(["list", "--names", "--status", "all"], {
			fake: { records: [{ slug: "alpha" }, { slug: "beta", isClosed: true }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("alpha\nbeta\n");
		expect(run.stderr).toEqual([]);
	});

	test("renders minimal Markdown and aliases md to markdown", async () => {
		const run = runScenario(["list", "--minimal", "--format", "md", "--status", "all"], {
			fake: {
				records: [
					{ slug: "alpha", updates: { "2026-06-08-1723-node-runtime-compatibility-hardened.md": "# Update\n" } },
					{ slug: "done", isClosed: true },
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("# Objective records in this checkout");
		expect(output).toContain("Root: `.asdl/objectives`");
		expect(output).toContain("Status filter: `all`");
		expect(output).toContain("| objective | status | latest update |");
		expect(output).toContain("| alpha | ○ open | 2026-06-08T17:23:00Z |");
		expect(output).toContain("| done | ✓ closed | — |");
	});

	test("dirty markers appear in JSON, human, and Markdown renderers", async () => {
		const fake = { records: [{ slug: "alpha" }] };
		const git = { dirtyPaths: [".asdl/objectives/alpha"] };
		const json = runScenario(["list", "--format", "json"], { fake, git });
		const minimalJson = runScenario(["list", "--minimal", "--format", "json"], { fake, git });
		const human = runScenario(["list"], { fake, git });
		const markdown = runScenario(["list", "--format", "markdown"], { fake, git });

		expect(await json.exit).toBe(0);
		expect(await minimalJson.exit).toBe(0);
		expect(await human.exit).toBe(0);
		expect(await markdown.exit).toBe(0);
		expect(parseJsonOutput(json)).toEqual({
			exit_code: 0,
			data: {
				trunkBranch: "master",
				rootPath: ".asdl/objectives",
				statusFilter: "active",
				namesOnly: false,
				updatedBranchesIncluded: true,
				records: [{ slug: "alpha", status: "open", latestUpdateIso: null, updatedBranches: [], hasOutstandingChanges: true }],
			},
		});
		expect(parseJsonOutput(minimalJson)).toEqual({
			exit_code: 0,
			data: {
				trunkBranch: "master",
				rootPath: ".asdl/objectives",
				statusFilter: "active",
				namesOnly: false,
				records: [{ slug: "alpha", status: "open", latestUpdateIso: null, hasOutstandingChanges: true }],
			},
		});
		expect(human.stdout.join("")).toContain("alpha | ○ open | (x) — | —");
		expect(markdown.stdout.join("")).toContain("| alpha | ○ open | (x) — | — |");
	});

	test("default JSON human and Markdown include branch attribution rows", async () => {
		const fake = {
			records: [{ slug: "alpha" }, { slug: "beta" }, { slug: "closed-one", isClosed: true }],
		};
		const git = {
			localBranchTips: [
				{ name: "master", headIso: "2026-05-01T00:00:00Z" },
				{ name: "feat/beta", headIso: "2026-05-03T00:00:00Z" },
				{ name: "feat/alpha", headIso: "2026-05-02T00:00:00Z" },
				{ name: "feat/same-tree", headIso: "2026-05-04T00:00:00Z" },
			],
			treeOids: {
				"master|.asdl/objectives": "trunk-tree",
				"feat/beta|.asdl/objectives": "beta-tree",
				"feat/alpha|.asdl/objectives": "alpha-tree",
				"feat/same-tree|.asdl/objectives": "trunk-tree",
			},
			changedPaths: {
				"master...feat/beta|.asdl/objectives": [".asdl/objectives/beta/roadmap.md", ".asdl/objectives/closed-one/objective.md"],
				"master...feat/alpha|.asdl/objectives": [".asdl/objectives/alpha/objective.md"],
			},
		};
		const json = runScenario(["list", "--format", "json", "--status", "all"], { fake, git });
		const human = runScenario(["list", "--status", "all"], { fake, git });
		const markdown = runScenario(["list", "--format", "markdown", "--status", "all"], { fake, git });

		expect(await json.exit).toBe(0);
		expect(await human.exit).toBe(0);
		expect(await markdown.exit).toBe(0);
		expect(parseJsonOutput(json)).toEqual({
			exit_code: 0,
			data: {
				trunkBranch: "master",
				rootPath: ".asdl/objectives",
				statusFilter: "all",
				namesOnly: false,
				updatedBranchesIncluded: true,
				records: [
					{ slug: "alpha", status: "open", latestUpdateIso: null, updatedBranches: ["feat/alpha"], hasOutstandingChanges: false },
					{ slug: "beta", status: "open", latestUpdateIso: null, updatedBranches: ["feat/beta"], hasOutstandingChanges: false },
					{ slug: "closed-one", status: "closed", latestUpdateIso: null, updatedBranches: ["feat/beta"], hasOutstandingChanges: false },
				],
			},
		});
		expect(human.stdout.join("")).toContain("Updated branches");
		expect(human.stdout.join("")).toContain("alpha | ○ open | — | └ feat/alpha");
		expect(markdown.stdout.join("")).toContain("| objective | status | latest update | updated branches |");
		expect(markdown.stdout.join("")).toContain("| beta | ○ open | — | feat/beta |");
	});

	test("updated branches are ordered by latest branch tip and truncate after newest changed branches", async () => {
		const branchCount = 51;
		const branches = Array.from({ length: branchCount }, (_value, index) => ({
			name: `feat/${index.toString().padStart(2, "0")}`,
			headIso: `2026-05-01T00:${(branchCount - index).toString().padStart(2, "0")}:00Z`,
		}));
		const git = {
			localBranchTips: [{ name: "master", headIso: "2026-04-01T00:00:00Z" }, ...branches],
			treeOids: Object.fromEntries([
				["master|.asdl/objectives", "trunk-tree"],
				...branches.map((branch) => [`${branch.name}|.asdl/objectives`, `${branch.name}-tree`]),
			]),
			changedPaths: Object.fromEntries(branches.map((branch) => [`master...${branch.name}|.asdl/objectives`, [".asdl/objectives/alpha/objective.md"]])),
		};
		const run = runScenario(["list", "--format", "json"], { fake: { records: [{ slug: "alpha" }] }, git });
		const human = runScenario(["list"], { fake: { records: [{ slug: "alpha" }] }, git });

		expect(await run.exit).toBe(0);
		expect(await human.exit).toBe(0);
		const output = parseJsonOutput(run) as { data: { updatedBranchesTruncated: boolean; records: [{ updatedBranches: string[] }] } };
		expect(output.data.updatedBranchesTruncated).toBe(true);
		expect(output.data.records[0].updatedBranches).toHaveLength(50);
		expect(output.data.records[0].updatedBranches.slice(0, 2)).toEqual(["feat/00", "feat/01"]);
		expect(output.data.records[0].updatedBranches).not.toContain("feat/50");
		expect(human.stdout.join("")).toContain("limited to newest 50 changed local branches");
	});

	test("names and minimal modes omit branch attribution fields", async () => {
		const fake = { records: [{ slug: "alpha" }] };
		const git = {
			localBranchTips: ["master", "feat/alpha"],
			treeOids: { "master|.asdl/objectives": "trunk-tree", "feat/alpha|.asdl/objectives": "alpha-tree" },
			changedPaths: { "master..feat/alpha|.asdl/objectives": [".asdl/objectives/alpha/objective.md"] },
		};
		const minimal = runScenario(["list", "--minimal", "--format", "json"], { fake, git });
		const namesJson = runScenario(["list", "--names", "--format", "json"], { fake, git });
		const namesHuman = runScenario(["list", "--names"], { fake, git });

		expect(await minimal.exit).toBe(0);
		expect(await namesJson.exit).toBe(0);
		expect(await namesHuman.exit).toBe(0);
		expect(JSON.stringify(parseJsonOutput(minimal))).not.toContain("updatedBranches");
		expect(JSON.stringify(parseJsonOutput(namesJson))).not.toContain("updatedBranches");
		expect(namesHuman.stdout.join("")).toBe("alpha\n");
	});

	test("branch attribution git failures return structured failure envelopes", async () => {
		const run = runScenario(["list", "--format", "json"], {
			fake: { records: [{ slug: "alpha" }] },
			git: { localBranchTipsFailure: { code: "git_failed", message: "branch tips failed" } },
		});

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toEqual({ exit_code: 2, error_type: "git_failed", message: "branch tips failed" });
	});
});

function recordSlugs(output: unknown): string[] {
	if (typeof output !== "object" || output === null || !("data" in output)) throw new Error("missing data");
	const data = output.data;
	if (typeof data !== "object" || data === null || !("records" in data) || !Array.isArray(data.records)) {
		throw new Error("missing records");
	}
	return data.records.map((record: unknown) => {
		if (typeof record !== "object" || record === null || !("slug" in record) || typeof record.slug !== "string") {
			throw new Error("missing slug");
		}
		return record.slug;
	});
}
