import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@asdl/core/git/testing";

const ROOT = "/repo";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const BRANCH = "planned-branches/branch-scoped-plan";

describe("in-memory git gateway", () => {
	test("returns configured facts and records narrow logs", async () => {
		const git = new InMemoryGitGateway({
			repoRoot: ROOT,
			optionalRepoRoot: "/optional-repo",
			currentBranch: "feature/source-plan",
			trunkBranch: "trunk",
			originUrl: "git@github.com:Owner/Repo.git\n",
			headCommit: START_POINT,
		});

		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: ROOT });
		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({ type: "found", value: "/optional-repo" });
		expect(await git.currentBranch({ cwd: "/work" })).toEqual({ ok: true, value: "feature/source-plan" });
		expect(await git.trunkBranch({ cwd: "/work" })).toEqual({ type: "found", value: "trunk" });
		expect(await git.originUrl({ cwd: "/work" })).toEqual({ type: "found", value: "git@github.com:Owner/Repo.git\n" });
		expect(await git.headCommit({ cwd: "/work" })).toEqual({ ok: true, value: START_POINT });
		expect(git.repoRootCalls).toEqual([{ cwd: "/work" }]);
		expect(git.optionalRepoRootCalls).toEqual([{ cwd: "/work" }]);
		expect(git.currentBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.trunkBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.originUrlCalls).toEqual([{ cwd: "/work" }]);
		expect(git.headCommitCalls).toEqual([{ cwd: "/work" }]);
	});

	test("defaults optional repo root to repo root state", async () => {
		const git = new InMemoryGitGateway({ repoRoot: "/configured" });

		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({ type: "found", value: "/configured" });
	});

	test("models branch validation, presence, and creation as state", async () => {
		const git = new InMemoryGitGateway({ existingBranches: ["existing"], invalidBranchRefs: ["bad branch"] });

		expect(await git.validateBranchRef({ cwd: ROOT, branch: "bad branch" })).toMatchObject({ ok: false });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "existing" })).toMatchObject({ type: "present", refName: "refs/heads/existing" });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({ type: "absent", refName: `refs/heads/${BRANCH}` });
		expect(await git.createBranchAtHead({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toMatchObject({ type: "present", refName: `refs/heads/${BRANCH}` });
		expect(git.existingBranches).toEqual(["existing", BRANCH].sort());
		expect(git.validateBranchRefCalls).toEqual([{ cwd: ROOT, branch: "bad branch" }]);
		expect(git.localBranchPresenceCalls).toEqual([
			{ cwd: ROOT, branch: "existing" },
			{ cwd: ROOT, branch: BRANCH },
			{ cwd: ROOT, branch: BRANCH },
		]);
		expect(git.createBranchAtHeadCalls).toEqual([{ cwd: ROOT, branch: BRANCH }]);
	});

	test("models global local branch presence failure after recording the call", async () => {
		const git = new InMemoryGitGateway({ localBranchPresenceFailure: { type: "failure" } });

		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "error",
			error: { code: "branch_presence_failed", message: "Could not determine local branch presence." },
		});
		expect(git.localBranchPresenceCalls).toEqual([{ cwd: ROOT, branch: BRANCH }]);
	});

	test("models branch-specific local branch presence failures without hiding unrelated branch state", async () => {
		const git = new InMemoryGitGateway({
			existingBranches: ["existing"],
			localBranchPresenceFailures: {
				[BRANCH]: { type: "failure", error: { code: "custom_presence_failure", message: "Custom presence failure." } },
			},
		});

		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "error",
			error: { code: "custom_presence_failure", message: "Custom presence failure." },
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "existing" })).toMatchObject({ type: "present", refName: "refs/heads/existing" });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "other" })).toEqual({ type: "absent", refName: "refs/heads/other" });
		expect(git.localBranchPresenceCalls).toEqual([
			{ cwd: ROOT, branch: BRANCH },
			{ cwd: ROOT, branch: "existing" },
			{ cwd: ROOT, branch: "other" },
		]);
	});

	test("supports failure and missing state overrides", async () => {
		const explicitError = { code: "custom", message: "Custom failure." };
		const git = new InMemoryGitGateway({
			repoRoot: { type: "failure" },
			optionalRepoRoot: { type: "missing" },
			currentBranch: { type: "failure", error: explicitError },
			trunkBranch: { type: "failure" },
			originUrl: { type: "missing" },
			headCommit: { type: "failure" },
			createBranchFailure: { code: "branch_create_failed", message: "Could not create branch." },
		});

		expect(await git.repoRoot({ cwd: ROOT })).toEqual({ ok: false, error: { code: "repo_root_failed", message: "Could not resolve git repository root." } });
		expect(await git.optionalRepoRoot({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(await git.currentBranch({ cwd: ROOT })).toEqual({ ok: false, error: explicitError });
		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({ type: "error", error: { code: "trunk_branch_failed", message: "Could not resolve trunk branch." } });
		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(await git.headCommit({ cwd: ROOT })).toEqual({ ok: false, error: { code: "head_commit_failed", message: "Could not resolve HEAD commit." } });
		expect(await git.createBranchAtHead({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: false, error: { code: "branch_create_failed", message: "Could not create branch." } });
		expect(git.existingBranches).toEqual([]);
	});

	test("models detached current branch with real-parity error", async () => {
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		expect(await git.currentBranch({ cwd: ROOT })).toEqual({
			ok: false,
			error: {
				code: "detached_head",
				message: "git branch --show-current returned no current branch.\nCommand: git branch --show-current",
				displayCommand: "git branch --show-current",
			},
		});
	});

	test("keeps trunk branch as pure configured tri-state", async () => {
		const missing = new InMemoryGitGateway({ trunkBranch: { type: "missing" }, existingBranches: ["main"] });
		const found = new InMemoryGitGateway({ trunkBranch: "develop", existingBranches: [] });

		expect(await missing.trunkBranch({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(missing.localBranchPresenceCalls).toEqual([]);
		expect(await found.trunkBranch({ cwd: ROOT })).toEqual({ type: "found", value: "develop" });
		expect(found.localBranchPresenceCalls).toEqual([]);
	});

	test("models reusable git facts and records call logs", async () => {
		const controller = new AbortController();
		const git = new InMemoryGitGateway({
			dirtyPaths: [".asdl/objectives"],
			localBranchTips: ["feature/a", { name: "feature/b", headIso: "2026-06-15T12:00:00+00:00" }],
			treeOids: {
				"HEAD|.asdl/objectives": "tree-head",
				"main|.asdl/objectives": null,
			},
			changedPaths: {
				"main..HEAD|.asdl/objectives": [".asdl/objectives/a/objective.md"],
			},
		});

		expect(await git.hasUncommittedChangesUnder({ cwd: ROOT, relativePath: "./.asdl/objectives/", signal: controller.signal })).toEqual({ ok: true, value: true });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toEqual({
			ok: true,
			value: [
				{ name: "feature/a", headIso: null },
				{ name: "feature/b", headIso: "2026-06-15T12:00:00+00:00" },
			],
		});
		expect(await git.treeOidsAtRefs({ cwd: ROOT, refs: ["HEAD", "main"], relativePath: ".asdl/objectives" })).toEqual({
			ok: true,
			value: { HEAD: "tree-head", main: null },
		});
		expect(await git.changedPathsUnder({ cwd: ROOT, revisionRange: "main..HEAD", relativePath: ".asdl/objectives" })).toEqual({
			ok: true,
			value: [".asdl/objectives/a/objective.md"],
		});
		expect(git.hasUncommittedChangesUnderCalls).toEqual([{ cwd: ROOT, relativePath: "./.asdl/objectives/", signal: controller.signal }]);
		expect(git.listLocalBranchTipsCalls).toEqual([{ cwd: ROOT }]);
		expect(git.treeOidsAtRefsCalls).toEqual([{ cwd: ROOT, refs: ["HEAD", "main"], relativePath: ".asdl/objectives" }]);
		expect(git.changedPathsUnderCalls).toEqual([{ cwd: ROOT, revisionRange: "main..HEAD", relativePath: ".asdl/objectives" }]);
	});

	test("models reusable git fact failures and immutable snapshots", async () => {
		const explicitError = { code: "custom_git_fact_failure", message: "Custom git fact failure." };
		const git = new InMemoryGitGateway({
			dirtyPathFailures: { ".asdl/objectives": explicitError },
			localBranchTipsFailure: explicitError,
			treeOids: { "HEAD|.asdl/objectives": explicitError },
			changedPaths: { "main..HEAD|.asdl/objectives": explicitError },
		});

		expect(await git.hasUncommittedChangesUnder({ cwd: ROOT, relativePath: ".asdl/objectives" })).toEqual({ ok: false, error: explicitError });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toEqual({ ok: false, error: explicitError });
		expect(await git.treeOidsAtRefs({ cwd: ROOT, refs: ["HEAD"], relativePath: ".asdl/objectives" })).toEqual({ ok: false, error: explicitError });
		expect(await git.changedPathsUnder({ cwd: ROOT, revisionRange: "main..HEAD", relativePath: ".asdl/objectives" })).toEqual({ ok: false, error: explicitError });

		const treeCalls = git.treeOidsAtRefsCalls;
		const mutableTreeCalls = treeCalls as unknown as { refs: string[] }[];
		mutableTreeCalls[0]?.refs.push("mutated");

		expect(treeCalls).toEqual([{ cwd: ROOT, refs: ["HEAD", "mutated"], relativePath: ".asdl/objectives" }]);
		expect(git.treeOidsAtRefsCalls).toEqual([{ cwd: ROOT, refs: ["HEAD"], relativePath: ".asdl/objectives" }]);
	});

	test("call logs copy signal and are immutable snapshots", async () => {
		const git = new InMemoryGitGateway();
		const controller = new AbortController();

		await git.repoRoot({ cwd: ROOT, signal: controller.signal });
		const calls = git.repoRootCalls;
		const mutableCalls = calls as { cwd: string }[];
		mutableCalls[0] = { cwd: "/mutated" };

		expect(calls).toEqual([{ cwd: "/mutated" }]);
		expect(git.repoRootCalls).toEqual([{ cwd: ROOT, signal: controller.signal }]);
	});
});
