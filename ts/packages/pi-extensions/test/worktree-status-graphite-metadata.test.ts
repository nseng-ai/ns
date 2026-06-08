import { join } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { loadGraphiteMetadataStatus } from "../src/worktree-status/graphite-metadata.ts";
import { makeGitRepo, withTempRoot, writeGraphiteMetadataDb } from "./worktree-status-fixtures.ts";

describe("Graphite metadata status lookup", () => {
	test("reports unavailable when metadata DB is missing", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			expect(loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "feature/current" })).toEqual({
				type: "unavailable",
				reason: "missing-db",
				currentBranch: "feature/current",
			});
		});
	});

	test("loads the current branch parent and children without scanning unrelated rows", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
				{ branchName: "feature/current", parentBranchName: "main", children: ["feature/child"] },
				{ branchName: "feature/unrelated", parentBranchName: "main", children: ["feature/noise"] },
			]);

			expect(loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "feature/current" })).toEqual({
				type: "tracked",
				currentBranch: "feature/current",
				parent: "main",
				children: ["feature/child"],
				isCurrentTrunk: false,
			});
		});
	});

	test("marks the current branch as trunk from validation result", async () => {
		await withTempRoot(makeGitRepo("main"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "main", children: ["feature/current"], validationResult: "trunk" },
			]);

			expect(loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "main" })).toEqual({
				type: "tracked",
				currentBranch: "main",
				parent: undefined,
				children: ["feature/current"],
				isCurrentTrunk: true,
			});
		});
	});

	test("reports untracked when the current branch has no row", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [{ branchName: "main", validationResult: "TRUNK" }]);

			expect(loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "feature/current" })).toEqual({
				type: "untracked",
				currentBranch: "feature/current",
			});
		});
	});

	test("reports schema mismatch when required columns are missing", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			const db = new Database(join(root, ".git", ".graphite_metadata.db"));
			try {
				db.run("CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY, parent_branch_name TEXT)");
			} finally {
				db.close();
			}

			expect(loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "feature/current" })).toEqual({
				type: "unavailable",
				reason: "schema-mismatch",
				currentBranch: "feature/current",
			});
		});
	});

	test("treats malformed children JSON as no children", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "feature/current", parentBranchName: "main", rawChildren: "not json" },
			]);

			const status = loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "feature/current" });
			expect(status).toMatchObject({ type: "tracked", children: [] });
		});
	});

	test("keeps only string children from metadata arrays", async () => {
		await withTempRoot(makeGitRepo("feature/current"), (root) => {
			writeGraphiteMetadataDb(join(root, ".git"), [
				{ branchName: "feature/current", parentBranchName: "main", rawChildren: '["feature/one", 123, null, "feature/two"]' },
			]);

			const status = loadGraphiteMetadataStatus({ commonGitDir: join(root, ".git"), currentBranch: "feature/current" });
			expect(status).toMatchObject({ type: "tracked", children: ["feature/one", "feature/two"] });
		});
	});
});
