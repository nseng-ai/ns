import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	detectGitOperationInProgressAt,
	resolveWorktreeGitDirs,
	type GitOperationInProgress,
	type GitWorktreeStateFs,
} from "@nseng-ai/foundation/git";
import { detectGitOperationInProgress } from "../../src/git/worktree-state.ts";

const tempRoots: string[] = [];

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "ns-kit-worktree-state-"));
	tempRoots.push(dir);
	return dir;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("git worktree state", () => {
	test.each([
		["merge", "MERGE_HEAD"],
		["cherry-pick", "CHERRY_PICK_HEAD"],
		["revert", "REVERT_HEAD"],
		["rebase", "rebase-merge"],
		["bisect", "BISECT_LOG"],
	] satisfies Array<[GitOperationInProgress, string]>)(
		"detects %s operation markers",
		(operation, markerPath) => {
			const root = tempDir();
			const gitDir = join(root, ".git");
			mkdirSync(gitDir, { recursive: true });
			if (markerPath === "rebase-merge") {
				mkdirSync(join(gitDir, markerPath));
			} else {
				writeFileSync(join(gitDir, markerPath), "marker");
			}

			expect(detectGitOperationInProgress(gitDir)).toEqual({ operation, branch: null });
			expect(detectGitOperationInProgressAt(root)).toEqual({ operation, branch: null });
		},
	);

	test.each(["rebase-merge", "rebase-apply"])("recovers branch from %s head-name", (rebaseDir) => {
		const root = tempDir();
		const gitDir = join(root, ".git");
		mkdirSync(join(gitDir, rebaseDir), { recursive: true });
		writeFileSync(join(gitDir, rebaseDir, "head-name"), " refs/heads/feature/rebase \n");

		expect(detectGitOperationInProgress(gitDir)).toEqual({
			operation: "rebase",
			branch: "feature/rebase",
		});
	});

	test("resolves .git directory with HEAD", () => {
		const root = tempDir();
		const gitDir = join(root, ".git");
		mkdirSync(gitDir);
		writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/main\n");

		expect(resolveWorktreeGitDirs(root)).toEqual({
			type: "resolved",
			dirs: { gitDir, commonGitDir: gitDir, headPath: join(gitDir, "HEAD"), hasHead: true },
		});
	});

	test("resolves relative gitdir pointer and relative commondir", () => {
		const root = tempDir();
		const adminDir = join(root, "admin", "worktrees", "wt");
		const commonGitDir = join(root, "admin");
		mkdirSync(adminDir, { recursive: true });
		writeFileSync(join(root, ".git"), "gitdir: admin/worktrees/wt\n");
		writeFileSync(join(adminDir, "HEAD"), "ref: refs/heads/main\n");
		writeFileSync(join(adminDir, "commondir"), "../..\n");

		expect(resolveWorktreeGitDirs(root)).toEqual({
			type: "resolved",
			dirs: {
				gitDir: adminDir,
				commonGitDir,
				headPath: join(adminDir, "HEAD"),
				hasHead: true,
			},
		});
	});

	test("resolves absolute gitdir pointer and absent HEAD", () => {
		const root = tempDir();
		const adminDir = join(root, "absolute-admin");
		mkdirSync(adminDir);
		writeFileSync(join(root, ".git"), `gitdir:${adminDir}\n`);

		expect(resolveWorktreeGitDirs(root)).toEqual({
			type: "resolved",
			dirs: {
				gitDir: adminDir,
				commonGitDir: adminDir,
				headPath: join(adminDir, "HEAD"),
				hasHead: false,
			},
		});
	});

	test("classifies non-gitdir file and missing dot-git", () => {
		const root = tempDir();
		expect(resolveWorktreeGitDirs(root)).toEqual({ type: "no-dot-git" });
		writeFileSync(join(root, ".git"), "not a gitdir file\n");
		expect(resolveWorktreeGitDirs(root)).toEqual({ type: "not-gitdir-file" });
	});

	test("reports unreadable fs seam failures", () => {
		const fs: GitWorktreeStateFs = {
			pathKind(path) {
				if (path === resolve("/repo/.git")) throw new Error("stat failed");
				return "missing";
			},
			readTextFile() {
				throw new Error("read failed");
			},
		};

		expect(resolveWorktreeGitDirs("/repo", { fs })).toMatchObject({
			type: "unreadable",
			path: resolve("/repo/.git"),
		});
	});
});
