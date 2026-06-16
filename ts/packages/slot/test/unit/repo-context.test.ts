import { describe, expect, it } from "vitest";

import { discoverRepoOrSentinel, ensureSlotsMetadataDir } from "../../src/repo-context.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";
import { FakeSlotStorageGateway } from "../../src/gateways/fakes/storage.ts";

describe("repo context", () => {
	it("returns a sentinel when the start path is missing", async () => {
		const git = new FakeSlotGitGateway({ existingPaths: [] });
		await expect(discoverRepoOrSentinel({ cwd: "/missing", slotsRoot: "/slots", git })).resolves.toMatchObject({ type: "no_repo", errorType: "missing_start_path" });
	});

	it("returns a not-in-repo sentinel when no git common dir is found", async () => {
		const git = new FakeSlotGitGateway({ existingPaths: ["/repo"], gitCommonDir: null });
		await expect(discoverRepoOrSentinel({ cwd: "/repo", slotsRoot: "/slots", git })).resolves.toMatchObject({ type: "no_repo", errorType: "not_in_repo" });
	});

	it("derives stable repo name and slots paths from the main repo root", async () => {
		const git = new FakeSlotGitGateway({ existingPaths: ["/slot"], gitCommonDir: "/repo/.git", repositoryRoot: "/slot" });
		await expect(discoverRepoOrSentinel({ cwd: "/slot", slotsRoot: "/slots", git })).resolves.toEqual({
			type: "repo",
			root: "/slot",
			mainRepoRoot: "/repo",
			repoName: "repo",
			repoDir: "/slots/repos/repo",
			worktreesDir: "/slots/repos/repo/worktrees",
		});
	});

	it("ensures repo and worktree metadata dirs", async () => {
		const storage = new FakeSlotStorageGateway();
		await ensureSlotsMetadataDir({ type: "repo", root: "/repo", mainRepoRoot: "/repo", repoName: "repo", repoDir: "/slots/repos/repo", worktreesDir: "/slots/repos/repo/worktrees" }, storage);
		expect(storage.operations()).toEqual([
			{ type: "ensure-dir", path: "/slots/repos/repo" },
			{ type: "ensure-dir", path: "/slots/repos/repo/worktrees" },
		]);
	});
});
