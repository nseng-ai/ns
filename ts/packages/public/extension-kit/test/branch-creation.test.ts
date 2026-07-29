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
	test("plain Git creates from HEAD and verifies the local ref", async () => {
		const git = new InMemoryGitGateway();
		const provider = new PlainGitBranchCreationProvider(git);
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "current-head", startPoint: "abc", startRef: "HEAD" },
		});
		expect(result).toEqual({ ok: true });
		expect(git.createBranchAtHeadCalls).toEqual([{ cwd: "/repo", branch: "feature/new" }]);
		expect(git.localBranchPresenceCalls).toEqual([{ cwd: "/repo", branch: "feature/new" }]);
	});

	test("Graphite validates the parent, creates the Git branch, and tracks it", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/parent" });
		const graphite = new InMemoryGraphiteBranchGateway();
		const provider = new GraphiteBranchCreationProvider({ git, graphite });
		const result = await provider.createBranch({
			cwd: "/repo",
			branch: "feature/new",
			basis: { type: "current-head", startPoint: "abc", startRef: "HEAD" },
		});
		expect(result).toEqual({ ok: true });
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: "/repo", branch: "feature/parent" }]);
		expect(graphite.trackBranchCalls).toEqual([
			{ cwd: "/repo", branch: "feature/new", parentBranch: "feature/parent" },
		]);
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
			basis: { type: "current-head", startPoint: "abc", startRef: "HEAD" },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.branchCreated).toBe(true);
			expect(result.error.message).toContain("No attached plan was stored");
		}
	});
});
