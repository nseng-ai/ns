import { describe, expect, test } from "vitest";

import {
	GraphiteBranchCreationProvider,
	PlainGitBranchCreationProvider,
	loadWorkflowBranchCreationConfig,
} from "@nseng-ai/extension-kit/branch-creation";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/extension-kit/graphite/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

function configGateway(text: string | undefined): ProjectConfigGateway {
	return {
		readTextFile: () => (text === undefined ? { type: "missing" } : { type: "found", text }),
		pathExists: () => ({ type: "missing" }),
	};
}

describe("workflow branch creation configuration", () => {
	test.each([
		[undefined, "plain-git"],
		["", "plain-git"],
		['[workflow]\nbranch-creation = "plain-git"', "plain-git"],
		['[workflow]\nbranch-creation = "graphite"', "graphite"],
	] as const)("resolves %j", (source, mode) => {
		const result = loadWorkflowBranchCreationConfig({
			repoRoot: "/repo",
			gateway: configGateway(source),
		});
		expect(result).toEqual({ ok: true, value: { branchCreation: mode } });
	});

	test.each([
		["[workflow", "invalid-toml"],
		['workflow = "graphite"', "invalid-workflow"],
		['[workflow]\nbranch-creation = "jj"', "invalid-branch-creation"],
	] as const)("fails closed for invalid configuration", (source, code) => {
		const result = loadWorkflowBranchCreationConfig({
			repoRoot: "/repo",
			gateway: configGateway(source),
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe(code);
			expect(result.error.message).toContain("ns.toml");
		}
	});
});

describe("built-in branch creation providers", () => {
	test("plain Git resolves HEAD, creates from its commit, and returns verified facts", async () => {
		const git = new InMemoryGitGateway({ headCommit: "abc123" });
		const provider = new PlainGitBranchCreationProvider(git);
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "current-head" },
		});
		expect(result).toEqual({
			ok: true,
			value: {
				startPoint: "abc123",
				startRef: "HEAD",
				relationship: { type: "none" },
			},
		});
		expect(git.headCommitCalls).toEqual([{ cwd: "/repo" }]);
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: "/repo", branch: "feature/new", startPoint: "abc123" },
		]);
		expect(git.localBranchPresenceCalls).toEqual([{ cwd: "/repo", branch: "feature/new" }]);
	});

	test("plain Git fails HEAD resolution before creating a branch", async () => {
		const git = new InMemoryGitGateway({
			headCommit: { type: "failure", error: { code: "head-failed", message: "no HEAD" } },
		});
		const provider = new PlainGitBranchCreationProvider(git);
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "current-head" },
		});
		expect(result).toEqual({
			ok: false,
			error: { code: "head-failed", message: "no HEAD", branchCreated: false },
		});
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(git.localBranchPresenceCalls).toEqual([]);
	});

	test("plain Git preserves explicit start facts", async () => {
		const git = new InMemoryGitGateway();
		const provider = new PlainGitBranchCreationProvider(git);
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "explicit", startPoint: "abc123", startRef: "refs/heads/main" },
		});
		expect(result).toEqual({
			ok: true,
			value: {
				startPoint: "abc123",
				startRef: "refs/heads/main",
				relationship: { type: "none" },
			},
		});
		expect(git.headCommitCalls).toEqual([]);
	});

	test("Graphite resolves the current parent once, delegates Git creation, and returns tracking facts", async () => {
		const git = new InMemoryGitGateway({
			currentBranch: "feature/parent",
			headCommit: "abc123",
		});
		const graphite = new InMemoryGraphiteBranchGateway();
		const provider = new GraphiteBranchCreationProvider({ git, graphite });
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "current-head" },
		});
		expect(result).toEqual({
			ok: true,
			value: {
				startPoint: "abc123",
				startRef: "HEAD",
				relationship: { type: "tracked-parent", parentBranch: "feature/parent" },
			},
		});
		expect(git.currentBranchCalls).toEqual([{ cwd: "/repo" }]);
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: "/repo", branch: "feature/parent" }]);
		expect(graphite.trackBranchCalls).toEqual([
			{ cwd: "/repo", branch: "feature/new", parentBranch: "feature/parent" },
		]);
	});

	test("Graphite preserves explicit start facts and uses only the explicit parent", async () => {
		const git = new InMemoryGitGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const provider = new GraphiteBranchCreationProvider({ git, graphite });
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: {
				type: "explicit",
				startPoint: "abc123",
				startRef: "refs/heads/main",
				parentBranch: "feature/parent",
			},
		});
		expect(result).toEqual({
			ok: true,
			value: {
				startPoint: "abc123",
				startRef: "refs/heads/main",
				relationship: { type: "tracked-parent", parentBranch: "feature/parent" },
			},
		});
		expect(git.currentBranchCalls).toEqual([]);
		expect(git.headCommitCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: "/repo", branch: "feature/new", startPoint: "abc123" },
		]);
	});

	test("Graphite rejects an explicit basis without a parent before mutation", async () => {
		const git = new InMemoryGitGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const provider = new GraphiteBranchCreationProvider({ git, graphite });
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "explicit", startPoint: "abc123", startRef: "refs/heads/main" },
		});
		expect(result).toEqual({
			ok: false,
			error: {
				code: "graphite-parent-required",
				branchCreated: false,
				message:
					"Graphite branch creation requires an explicit parent branch for an explicit basis.",
			},
		});
		expect(git.currentBranchCalls).toEqual([]);
		expect(git.headCommitCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(graphite.checkBranchTrackedCalls).toEqual([]);
		expect(graphite.trackBranchCalls).toEqual([]);
	});

	test("Graphite reports partial failure after creating the local branch", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/parent" });
		const graphite = new InMemoryGraphiteBranchGateway({
			trackFailure: { code: "track-failed", message: "tracking failed" },
		});
		const provider = new GraphiteBranchCreationProvider({ git, graphite });
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "current-head" },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.branchCreated).toBe(true);
			expect(result.error.message).toContain("No attached plan was stored");
		}
	});
});
