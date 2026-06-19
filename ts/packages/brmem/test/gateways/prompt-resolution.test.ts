import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCwdParams,
	GitErrorInfo,
	GitLocalBranchTip,
	GitOperationResult,
	GitOptionalResult,
	GitPathParams,
	GitRefsPathParams,
	GitResult,
	GitRevisionRangePathParams,
	GitGateway,
} from "@asdl/core/git";
import { describe, expect, it } from "vitest";

import { RealBrmemPromptResolver } from "../../src/prompt-resolution.ts";

describe("RealBrmemPromptResolver", () => {
	it("resolves repository roots through an injected GitGateway and checks prompt existence", async () => {
		const root = await mkdtemp(join(tmpdir(), "brmem-prompt-test-"));
		try {
			const promptPath = join(root, ".brmem", "prompts", "foo.md");
			mkdirSync(join(root, ".brmem", "prompts"), { recursive: true });
			writeFileSync(promptPath, "prompt\n", "utf8");
			const git = new FakeGitGateway({ repoRoot: root });
			const resolver = new RealBrmemPromptResolver({
				env: { ...process.env, HOME: "/tmp/brmem-home" },
				git,
			});

			expect(await resolver.repositoryRoot({ cwd: "/work" })).toEqual({
				type: "ok",
				value: root,
			});
			expect(git.repoRootCalls).toEqual([{ cwd: "/work" }]);
			expect(resolver.homeRoot()).toBe("/tmp/brmem-home");
			expect(await resolver.fileExists(promptPath)).toBe(true);
			expect(await resolver.fileExists(join(root, ".brmem", "prompts", "missing.md"))).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("maps injected GitGateway repo-root failures to not-a-git-repo", async () => {
		const gitError: GitErrorInfo = {
			code: "repo_root_failed",
			message: "git failed",
			displayCommand: "git rev-parse --show-toplevel",
		};
		const resolver = new RealBrmemPromptResolver({
			env: process.env,
			git: new FakeGitGateway({ repoRootError: gitError }),
		});

		const result = await resolver.repositoryRoot({ cwd: "/outside" });

		expect(result).toMatchObject({
			type: "error",
			error: {
				code: "not-a-git-repo",
				displayCommand: "git rev-parse --show-toplevel",
			},
		});
		if (result.type === "error")
			expect(result.error.message).toContain("Not inside a git repository: /outside");
	});
});

class FakeGitGateway implements GitGateway {
	readonly repoRootCalls: GitCwdParams[] = [];
	private readonly repoRootValue: string | undefined;
	private readonly repoRootError: GitErrorInfo | undefined;

	constructor(options: {
		repoRoot?: string | undefined;
		repoRootError?: GitErrorInfo | undefined;
	}) {
		this.repoRootValue = options.repoRoot;
		this.repoRootError = options.repoRootError;
	}

	async repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		this.repoRootCalls.push(params);
		if (this.repoRootError !== undefined) return { ok: false, error: this.repoRootError };
		if (this.repoRootValue === undefined)
			throw new Error("FakeGitGateway repoRoot was not configured");
		return { ok: true, value: this.repoRootValue };
	}

	async optionalRepoRoot(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		throw new Error("FakeGitGateway.optionalRepoRoot should not be called");
	}

	async currentBranch(_params: GitCwdParams): Promise<GitResult<string>> {
		throw new Error("FakeGitGateway.currentBranch should not be called");
	}

	async trunkBranch(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		throw new Error("FakeGitGateway.trunkBranch should not be called");
	}

	async originUrl(_params: GitCwdParams): Promise<GitOptionalResult<string>> {
		throw new Error("FakeGitGateway.originUrl should not be called");
	}

	async headCommit(_params: GitCwdParams): Promise<GitResult<string>> {
		throw new Error("FakeGitGateway.headCommit should not be called");
	}

	async gitPath(_params: GitPathParams): Promise<GitResult<string>> {
		throw new Error("FakeGitGateway.gitPath should not be called");
	}

	async validateBranchRef(_params: GitBranchParams): Promise<GitOperationResult> {
		throw new Error("FakeGitGateway.validateBranchRef should not be called");
	}

	async localBranchPresence(_params: GitBranchParams): Promise<GitBranchPresenceResult> {
		throw new Error("FakeGitGateway.localBranchPresence should not be called");
	}

	async createBranchAtHead(_params: GitBranchParams): Promise<GitOperationResult> {
		throw new Error("FakeGitGateway.createBranchAtHead should not be called");
	}

	async hasUncommittedChangesUnder(_params: GitPathParams): Promise<GitResult<boolean>> {
		throw new Error("FakeGitGateway.hasUncommittedChangesUnder should not be called");
	}

	async listLocalBranchTips(
		_params: GitCwdParams,
	): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		throw new Error("FakeGitGateway.listLocalBranchTips should not be called");
	}

	async treeOidsAtRefs(
		_params: GitRefsPathParams,
	): Promise<GitResult<Readonly<Record<string, string | null>>>> {
		throw new Error("FakeGitGateway.treeOidsAtRefs should not be called");
	}

	async changedPathsUnder(
		_params: GitRevisionRangePathParams,
	): Promise<GitResult<readonly string[]>> {
		throw new Error("FakeGitGateway.changedPathsUnder should not be called");
	}
}
