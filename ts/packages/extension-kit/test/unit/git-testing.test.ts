import { describe, expect, test } from "vitest";

import { InMemoryGitGateway, type GitRefsPathCall } from "@nseng-ai/foundation/git/testing";

const ROOT = "/repo";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const BRANCH = "planned-branches/branch-scoped-plan";

interface MutableGitRefsPathCall extends Omit<GitRefsPathCall, "refs"> {
	refs: string[];
}

function unsafeMutableRefsPathCalls(calls: readonly GitRefsPathCall[]): MutableGitRefsPathCall[] {
	return calls as MutableGitRefsPathCall[];
}

describe("in-memory git gateway", () => {
	test("returns configured facts and records narrow logs", async () => {
		const git = new InMemoryGitGateway({
			repoRoot: ROOT,
			optionalRepoRoot: "/optional-repo",
			currentBranch: "feature/source-plan",
			trunkBranch: "trunk",
			branchUpstream: { remoteName: "company", remoteRef: "refs/heads/stable" },
			originUrl: "git@github.com:Owner/Repo.git\n",
			headCommit: START_POINT,
			gitCommonDir: "/work/.git",
			previousBranch: "feature/previous",
			gitPaths: { "info/exclude": "/work/.git/info/exclude" },
		});

		expect(await git.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: ROOT });
		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({
			type: "found",
			value: "/optional-repo",
		});
		expect(await git.currentBranch({ cwd: "/work" })).toEqual({
			type: "branch",
			branch: "feature/source-plan",
		});
		expect(await git.trunkBranch({ cwd: "/work" })).toEqual({ type: "found", value: "trunk" });
		expect(await git.branchUpstream({ cwd: "/work", branch: "trunk" })).toEqual({
			type: "found",
			value: { remoteName: "company", remoteRef: "refs/heads/stable" },
		});
		expect(await git.originUrl({ cwd: "/work" })).toEqual({
			type: "found",
			value: "git@github.com:Owner/Repo.git\n",
		});
		expect(await git.headCommit({ cwd: "/work" })).toEqual({ ok: true, value: START_POINT });
		expect(await git.gitCommonDir({ cwd: "/work" })).toEqual({ ok: true, value: "/work/.git" });
		expect(await git.previousBranch({ cwd: "/work" })).toEqual({
			type: "found",
			value: "feature/previous",
		});
		expect(await git.gitPath({ cwd: "/work", relativePath: "info/exclude" })).toEqual({
			ok: true,
			value: "/work/.git/info/exclude",
		});
		expect(git.repoRootCalls).toEqual([{ cwd: "/work" }]);
		expect(git.optionalRepoRootCalls).toEqual([{ cwd: "/work" }]);
		expect(git.currentBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.trunkBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.branchUpstreamCalls).toEqual([{ cwd: "/work", branch: "trunk" }]);
		expect(git.originUrlCalls).toEqual([{ cwd: "/work" }]);
		expect(git.headCommitCalls).toEqual([{ cwd: "/work" }]);
		expect(git.gitCommonDirCalls).toEqual([{ cwd: "/work" }]);
		expect(git.previousBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(git.gitPathCalls).toEqual([{ cwd: "/work", relativePath: "info/exclude" }]);
	});

	test("defaults optional repo root to repo root state", async () => {
		const git = new InMemoryGitGateway({ repoRoot: "/configured" });

		expect(await git.optionalRepoRoot({ cwd: "/work" })).toEqual({
			type: "found",
			value: "/configured",
		});
	});

	test("models branch validation, presence, and creation as state", async () => {
		const git = new InMemoryGitGateway({
			existingBranches: ["existing"],
			invalidBranchRefs: ["bad branch"],
		});

		expect(await git.validateBranchRef({ cwd: ROOT, branch: "bad branch" })).toMatchObject({
			ok: false,
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "existing" })).toMatchObject({
			type: "present",
			refName: "refs/heads/existing",
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "absent",
			refName: `refs/heads/${BRANCH}`,
		});
		expect(await git.createBranchAtHead({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toMatchObject({
			type: "present",
			refName: `refs/heads/${BRANCH}`,
		});
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
			error: {
				code: "branch-presence-failed",
				message: "Could not determine local branch presence.",
			},
		});
		expect(git.localBranchPresenceCalls).toEqual([{ cwd: ROOT, branch: BRANCH }]);
	});

	test("models branch-specific local branch presence failures without hiding unrelated branch state", async () => {
		const git = new InMemoryGitGateway({
			existingBranches: ["existing"],
			localBranchPresenceFailures: {
				[BRANCH]: {
					type: "failure",
					error: { code: "custom_presence_failure", message: "Custom presence failure." },
				},
			},
		});

		expect(await git.localBranchPresence({ cwd: ROOT, branch: BRANCH })).toEqual({
			type: "error",
			error: { code: "custom_presence_failure", message: "Custom presence failure." },
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "existing" })).toMatchObject({
			type: "present",
			refName: "refs/heads/existing",
		});
		expect(await git.localBranchPresence({ cwd: ROOT, branch: "other" })).toEqual({
			type: "absent",
			refName: "refs/heads/other",
		});
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
			branchUpstream: { type: "failure" },
			originUrl: { type: "missing" },
			headCommit: { type: "failure" },
			gitCommonDir: { type: "failure" },
			previousBranch: { type: "missing" },
			gitPaths: { "info/exclude": { type: "failure" } },
			createBranchFailure: { code: "branch-create-failed", message: "Could not create branch." },
		});

		expect(await git.repoRoot({ cwd: ROOT })).toEqual({
			ok: false,
			error: { code: "repo_root_failed", message: "Could not resolve git repository root." },
		});
		expect(await git.optionalRepoRoot({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(await git.currentBranch({ cwd: ROOT })).toEqual({
			type: "failure",
			error: explicitError,
		});
		expect(await git.trunkBranch({ cwd: ROOT })).toEqual({
			type: "error",
			error: { code: "trunk_branch_failed", message: "Could not resolve trunk branch." },
		});
		expect(await git.branchUpstream({ cwd: ROOT, branch: "main" })).toEqual({
			type: "error",
			error: { code: "branch-upstream-failed", message: "Could not resolve branch upstream." },
		});
		expect(await git.originUrl({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(await git.headCommit({ cwd: ROOT })).toEqual({
			ok: false,
			error: { code: "head_commit_failed", message: "Could not resolve HEAD commit." },
		});
		expect(await git.gitPath({ cwd: ROOT, relativePath: "info/exclude" })).toEqual({
			ok: false,
			error: { code: "git_path_failed", message: "Could not resolve git path." },
		});
		expect(await git.gitCommonDir({ cwd: ROOT })).toEqual({
			ok: false,
			error: { code: "git_common_dir_failed", message: "Could not resolve git common directory." },
		});
		expect(await git.previousBranch({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(await git.createBranchAtHead({ cwd: ROOT, branch: BRANCH })).toEqual({
			ok: false,
			error: { code: "branch-create-failed", message: "Could not create branch." },
		});
		expect(git.existingBranches).toEqual([]);
	});

	test("defaults git paths under the configured fake repo git directory", async () => {
		const git = new InMemoryGitGateway({ repoRoot: "/configured-repo" });

		expect(await git.gitPath({ cwd: ROOT, relativePath: "info/exclude" })).toEqual({
			ok: true,
			value: "/configured-repo/.git/info/exclude",
		});
		expect(git.gitPathCalls).toEqual([{ cwd: ROOT, relativePath: "info/exclude" }]);
	});

	test("defaults git path failures from fake repo root failure", async () => {
		const git = new InMemoryGitGateway({ repoRoot: { type: "failure" } });

		expect(await git.gitPath({ cwd: ROOT, relativePath: "info/exclude" })).toEqual({
			ok: false,
			error: { code: "git_path_failed", message: "Could not resolve git path." },
		});
		expect(git.gitPathCalls).toEqual([{ cwd: ROOT, relativePath: "info/exclude" }]);
	});

	test("models detached current branch", async () => {
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		expect(await git.currentBranch({ cwd: ROOT })).toEqual({ type: "detached" });
	});

	test("models work tree probes and records calls", async () => {
		const defaultGit = new InMemoryGitGateway();
		const outsideGit = new InMemoryGitGateway({ isInsideWorkTree: false });
		const failure = { code: "custom_worktree_failure", message: "Custom worktree failure." };
		const failingGit = new InMemoryGitGateway({
			isInsideWorkTree: { type: "failure", error: failure },
		});

		expect(await defaultGit.isInsideWorkTree({ cwd: ROOT })).toEqual({ ok: true, value: true });
		expect(await outsideGit.isInsideWorkTree({ cwd: ROOT })).toEqual({ ok: true, value: false });
		expect(await failingGit.isInsideWorkTree({ cwd: ROOT })).toEqual({
			ok: false,
			error: failure,
		});
		expect(defaultGit.isInsideWorkTreeCalls).toEqual([{ cwd: ROOT }]);
	});

	test("keeps trunk branch as pure configured tri-state", async () => {
		const missing = new InMemoryGitGateway({
			trunkBranch: { type: "missing" },
			existingBranches: ["main"],
		});
		const found = new InMemoryGitGateway({ trunkBranch: "develop", existingBranches: [] });

		expect(await missing.trunkBranch({ cwd: ROOT })).toEqual({ type: "missing" });
		expect(missing.localBranchPresenceCalls).toEqual([]);
		expect(await found.trunkBranch({ cwd: ROOT })).toEqual({ type: "found", value: "develop" });
		expect(found.localBranchPresenceCalls).toEqual([]);
	});

	test("models default, configured, missing, and failed branch upstream facts", async () => {
		const defaultGit = new InMemoryGitGateway();
		const configured = new InMemoryGitGateway({
			branchUpstream: { remoteName: ".", remoteRef: "refs/heads/release" },
		});
		const missing = new InMemoryGitGateway({ branchUpstream: { type: "missing" } });
		const failure = new InMemoryGitGateway({
			branchUpstream: {
				type: "failure",
				error: { code: "custom-upstream-error", message: "inspection failed" },
			},
		});

		expect(await defaultGit.branchUpstream({ cwd: ROOT, branch: "main" })).toEqual({
			type: "found",
			value: { remoteName: "origin", remoteRef: "refs/heads/main" },
		});
		expect(await configured.branchUpstream({ cwd: ROOT, branch: "trunk" })).toEqual({
			type: "found",
			value: { remoteName: ".", remoteRef: "refs/heads/release" },
		});
		expect(await missing.branchUpstream({ cwd: ROOT, branch: "trunk" })).toEqual({
			type: "missing",
		});
		expect(await failure.branchUpstream({ cwd: ROOT, branch: "trunk" })).toEqual({
			type: "error",
			error: { code: "custom-upstream-error", message: "inspection failed" },
		});
		expect(configured.branchUpstreamCalls).toEqual([{ cwd: ROOT, branch: "trunk" }]);
	});

	test("models reusable git facts and records call logs", async () => {
		const controller = new AbortController();
		const git = new InMemoryGitGateway({
			dirtyPaths: [".ns/objectives"],
			localBranchTips: ["feature/a", { name: "feature/b", headIso: "2026-06-15T12:00:00+00:00" }],
			treeOids: {
				"HEAD|.ns/objectives": "tree-head",
				"main|.ns/objectives": null,
			},
			changedPaths: {
				"main..HEAD|.ns/objectives": [".ns/objectives/a/objective.md"],
			},
		});

		expect(
			await git.hasUncommittedChangesUnder({
				cwd: ROOT,
				relativePath: "./.ns/objectives/",
				signal: controller.signal,
			}),
		).toEqual({ ok: true, value: true });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toEqual({
			ok: true,
			value: [
				{ name: "feature/a", headIso: null },
				{ name: "feature/b", headIso: "2026-06-15T12:00:00+00:00" },
			],
		});
		expect(
			await git.treeOidsAtRefs({
				cwd: ROOT,
				refs: ["HEAD", "main"],
				relativePath: ".ns/objectives",
			}),
		).toEqual({
			ok: true,
			value: { HEAD: "tree-head", main: null },
		});
		expect(
			await git.changedPathsUnder({
				cwd: ROOT,
				revisionRange: "main..HEAD",
				relativePath: ".ns/objectives",
			}),
		).toEqual({
			ok: true,
			value: [".ns/objectives/a/objective.md"],
		});
		expect(git.hasUncommittedChangesUnderCalls).toEqual([
			{ cwd: ROOT, relativePath: "./.ns/objectives/", signal: controller.signal },
		]);
		expect(git.listLocalBranchTipsCalls).toEqual([{ cwd: ROOT }]);
		expect(git.treeOidsAtRefsCalls).toEqual([
			{ cwd: ROOT, refs: ["HEAD", "main"], relativePath: ".ns/objectives" },
		]);
		expect(git.changedPathsUnderCalls).toEqual([
			{ cwd: ROOT, revisionRange: "main..HEAD", relativePath: ".ns/objectives" },
		]);
	});

	test("models reusable git fact failures and immutable snapshots", async () => {
		const explicitError = { code: "custom_git_fact_failure", message: "Custom git fact failure." };
		const git = new InMemoryGitGateway({
			dirtyPathFailures: { ".ns/objectives": explicitError },
			localBranchTipsFailure: explicitError,
			treeOids: { "HEAD|.ns/objectives": explicitError },
			changedPaths: { "main..HEAD|.ns/objectives": explicitError },
		});

		expect(
			await git.hasUncommittedChangesUnder({ cwd: ROOT, relativePath: ".ns/objectives" }),
		).toEqual({ ok: false, error: explicitError });
		expect(await git.listLocalBranchTips({ cwd: ROOT })).toEqual({
			ok: false,
			error: explicitError,
		});
		expect(
			await git.treeOidsAtRefs({ cwd: ROOT, refs: ["HEAD"], relativePath: ".ns/objectives" }),
		).toEqual({ ok: false, error: explicitError });
		expect(
			await git.changedPathsUnder({
				cwd: ROOT,
				revisionRange: "main..HEAD",
				relativePath: ".ns/objectives",
			}),
		).toEqual({ ok: false, error: explicitError });

		const treeCalls = git.treeOidsAtRefsCalls;
		const mutableTreeCalls = unsafeMutableRefsPathCalls(treeCalls);
		mutableTreeCalls[0]?.refs.push("mutated");

		expect(treeCalls).toEqual([
			{ cwd: ROOT, refs: ["HEAD", "mutated"], relativePath: ".ns/objectives" },
		]);
		expect(git.treeOidsAtRefsCalls).toEqual([
			{ cwd: ROOT, refs: ["HEAD"], relativePath: ".ns/objectives" },
		]);
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

	test("defaults status paths to a clean worktree and records calls", async () => {
		const git = new InMemoryGitGateway();

		expect(await git.statusPaths({ cwd: ROOT })).toEqual({
			ok: true,
			value: { changedPaths: [] },
		});
		expect(git.statusPathsCalls).toEqual([{ cwd: ROOT }]);
	});

	test("returns canned status paths, filters pathspecs, and supports failure state", async () => {
		const dirty = new InMemoryGitGateway({
			statusPaths: { changedPaths: ["a.ts", ".ns/objectives/alpha/objective.md"] },
		});
		expect(await dirty.statusPaths({ cwd: ROOT, pathspecs: [".ns/objectives"] })).toEqual({
			ok: true,
			value: { changedPaths: [".ns/objectives/alpha/objective.md"] },
		});
		expect(dirty.statusPathsCalls).toEqual([{ cwd: ROOT, pathspecs: [".ns/objectives"] }]);

		const failing = new InMemoryGitGateway({ statusPaths: { type: "failure" } });
		expect(await failing.statusPaths({ cwd: ROOT })).toMatchObject({
			ok: false,
			error: { code: "git_status_paths_failed" },
		});
	});

	test("records stage and commit calls and returns configured outcomes", async () => {
		const git = new InMemoryGitGateway({ commitSha: "1111111111111111111111111111111111111111" });

		expect(await git.stagePaths({ cwd: ROOT, paths: ["a.ts", "b.ts"] })).toEqual({ ok: true });
		expect(await git.stagePaths({ cwd: ROOT, paths: [] })).toMatchObject({
			ok: false,
			error: { code: "git_stage_paths_failed" },
		});
		expect(await git.commit({ cwd: ROOT, message: "subject\n\nbody" })).toEqual({
			ok: true,
			value: "1111111111111111111111111111111111111111",
		});

		expect(git.stagePathsCalls).toEqual([
			{ cwd: ROOT, paths: ["a.ts", "b.ts"] },
			{ cwd: ROOT, paths: [] },
		]);
		expect(git.commitCalls).toEqual([{ cwd: ROOT, message: "subject\n\nbody" }]);
	});

	test("supports configured stage and commit failures", async () => {
		const git = new InMemoryGitGateway({
			stagePathsFailure: { code: "git_stage_paths_failed", message: "stage denied" },
			commitFailure: { code: "git_commit_failed", message: "commit denied" },
		});

		expect(await git.stagePaths({ cwd: ROOT, paths: ["a.ts"] })).toEqual({
			ok: false,
			error: { code: "git_stage_paths_failed", message: "stage denied" },
		});
		expect(await git.commit({ cwd: ROOT, message: "subject" })).toEqual({
			ok: false,
			error: { code: "git_commit_failed", message: "commit denied" },
		});
	});

	test("defaults staged changes to a clean index", async () => {
		const git = new InMemoryGitGateway();

		expect(await git.hasStagedChanges({ cwd: ROOT })).toEqual({ ok: true, value: false });
	});

	test("models staged-changes state, unstage, and checkout mutations with call logs", async () => {
		const git = new InMemoryGitGateway({
			hasStagedChanges: true,
			currentBranch: "feature/source-plan",
		});

		expect(await git.hasStagedChanges({ cwd: ROOT })).toEqual({ ok: true, value: true });
		expect(await git.checkStagedWhitespace({ cwd: ROOT })).toEqual({ ok: true });
		expect(await git.unstageAll({ cwd: ROOT })).toEqual({ ok: true });
		expect(await git.hasStagedChanges({ cwd: ROOT })).toEqual({ ok: true, value: false });
		expect(await git.checkout({ cwd: ROOT, branch: BRANCH })).toEqual({ ok: true });
		expect(await git.currentBranch({ cwd: ROOT })).toEqual({ type: "branch", branch: BRANCH });

		expect(git.hasStagedChangesCalls).toEqual([{ cwd: ROOT }, { cwd: ROOT }]);
		expect(git.checkStagedWhitespaceCalls).toEqual([{ cwd: ROOT }]);
		expect(git.unstageAllCalls).toEqual([{ cwd: ROOT }]);
		expect(git.checkoutCalls).toEqual([{ cwd: ROOT, branch: BRANCH }]);
	});

	test("supports configured staged-changes, whitespace, unstage, and checkout failures", async () => {
		const git = new InMemoryGitGateway({
			hasStagedChanges: true,
			hasStagedChangesFailure: { code: "git_staged_probe_failed", message: "probe denied" },
			checkStagedWhitespaceFailure: {
				code: "git_staged_whitespace_failed",
				message: "whitespace denied",
			},
			unstageAllFailure: { code: "git_unstage_failed", message: "unstage denied" },
			checkoutFailure: { code: "git_checkout_failed", message: "checkout denied" },
		});

		expect(await git.hasStagedChanges({ cwd: ROOT })).toEqual({
			ok: false,
			error: { code: "git_staged_probe_failed", message: "probe denied" },
		});
		expect(await git.checkStagedWhitespace({ cwd: ROOT })).toEqual({
			ok: false,
			error: { code: "git_staged_whitespace_failed", message: "whitespace denied" },
		});
		expect(await git.unstageAll({ cwd: ROOT })).toEqual({
			ok: false,
			error: { code: "git_unstage_failed", message: "unstage denied" },
		});
		expect(await git.checkout({ cwd: ROOT, branch: BRANCH })).toEqual({
			ok: false,
			error: { code: "git_checkout_failed", message: "checkout denied" },
		});
	});
});
