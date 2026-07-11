import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { loadGraphiteMetadataStatus } from "@nseng-ai/capability-kit/graphite/status";
import {
	makeGitRepo,
	runSqliteStatements,
	withTempRoot,
	writeGraphiteMetadataDb,
	writeLocalBranchRef,
	writeLocalBranchRefsForMetadataChildren,
} from "./status-fixtures.ts";

const CURRENT_NS_TOOLS_METADATA_FIXTURE = new URL(
	"./fixtures/graphite-metadata/sdl-tools-current.graphite_metadata.db",
	import.meta.url,
);
const sqliteAvailable = spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).status === 0;
const sqliteTest = sqliteAvailable ? test : test.skip;

describe("Graphite metadata real sqlite integration", () => {
	sqliteTest("loads branch topology from a real Graphite metadata database", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			const gitDir = join(root, ".git");
			writeGraphiteMetadataDb(gitDir, [
				{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
				{ branchName: "feature/current", parentBranchName: "main", children: ["feature/child"] },
				{ branchName: "feature/unrelated", parentBranchName: "main", children: ["feature/noise"] },
			]);
			writeLocalBranchRef(gitDir, "feature/child");

			expect(
				loadGraphiteMetadataStatus({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: ["feature/child"],
				isCurrentTrunk: false,
				stackTopologyCounts: { downstackCount: 0, upstackCount: 1 },
			});
		});
	});

	sqliteTest("maps a real schema mismatch to unavailable", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			runSqliteStatements(join(root, ".git", ".graphite_metadata.db"), [
				"CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY, parent_branch_name TEXT);",
			]);

			expect(
				loadGraphiteMetadataStatus({
					commonGitDir: join(root, ".git"),
					currentBranch: "feature/current",
				}),
			).toEqual({
				type: "unavailable",
				reason: "schema-mismatch",
				currentBranch: "feature/current",
			});
		});
	});

	sqliteTest("parses the copied historical Graphite database fixture", async () => {
		await withTempRoot(makeGitRepo("master"), (root) => {
			const gitDir = join(root, ".git");
			copyFileSync(CURRENT_NS_TOOLS_METADATA_FIXTURE, join(gitDir, ".graphite_metadata.db"));
			writeLocalBranchRefsForMetadataChildren(gitDir, "master");

			const status = loadGraphiteMetadataStatus({
				commonGitDir: join(root, ".git"),
				currentBranch: "master",
			});
			expect(status).toMatchObject({
				type: "tracked",
				currentBranch: "master",
				parent: undefined,
				isCurrentTrunk: true,
			});
			if (status.type !== "tracked")
				throw new Error("expected copied Graphite fixture to track master");
			expect(status.children).toContain("add-retros-branch-retro-command");
			expect(status.children.length).toBeGreaterThan(10);
			expect(status.stackTopologyCounts?.downstackCount).toBe(0);
			// Only master's direct children have live refs in this fixture, so the
			// live-filtered upstack walk stops one level above trunk.
			expect(status.stackTopologyCounts?.upstackCount).toBe(status.children.length);
		});
	});
});
