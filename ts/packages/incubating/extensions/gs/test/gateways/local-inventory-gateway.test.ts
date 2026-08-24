import type { GitGateway } from "@nseng-ai/foundation/git";
import { describe, expect, it } from "vitest";

import {
	RealGsLocalInventoryGateway,
	type GsStateReadResult,
	type GsStateReader,
} from "../../src/core/real-local-inventory-gateway.ts";

const VALID_STATE = JSON.stringify({
	schemaVersion: 1,
	stacks: [{ trunk: { branch: "main" }, branches: [{ branch: "feature" }] }],
});

function createGateway(options: {
	gitResult?: Awaited<ReturnType<Pick<GitGateway, "gitPath">["gitPath"]>>;
	localBranchTipsResult?: Awaited<
		ReturnType<Pick<GitGateway, "listLocalBranchTips">["listLocalBranchTips"]>
	>;
	readResult?: GsStateReadResult;
}) {
	const readPaths: string[] = [];
	const gitPathCalls: Array<{ cwd: string; relativePath: string }> = [];
	const git: Pick<GitGateway, "gitPath" | "listLocalBranchTips"> = {
		async gitPath(params) {
			gitPathCalls.push(params);
			return (
				options.gitResult ?? {
					ok: true,
					value: "/repo/.git/worktrees/current/gh-stack",
				}
			);
		},
		async listLocalBranchTips() {
			return (
				options.localBranchTipsResult ?? {
					ok: true,
					value: [{ name: "feature", headSha: "abc123", headIso: null }],
				}
			);
		},
	};
	const stateReader: GsStateReader = {
		async readState(path) {
			readPaths.push(path);
			return options.readResult ?? { type: "found", contents: VALID_STATE };
		},
	};
	return {
		gateway: new RealGsLocalInventoryGateway({ git, stateReader }),
		readPaths,
		gitPathCalls,
	};
}

describe("RealGsLocalInventoryGateway", () => {
	it("resolves and reads state from the invoking worktree Git directory", async () => {
		const { gateway, readPaths, gitPathCalls } = createGateway({});

		await expect(gateway.readLocalInventory({ cwd: "/repo/worktree" })).resolves.toEqual({
			ok: true,
			value: {
				worktreeGitDir: "/repo/.git/worktrees/current",
				stacks: [
					{
						number: null,
						base: "main",
						branches: [{ name: "feature", pullRequest: null }],
					},
				],
			},
		});
		expect(gitPathCalls).toEqual([{ cwd: "/repo/worktree", relativePath: "gh-stack" }]);
		expect(readPaths).toEqual(["/repo/.git/worktrees/current/gh-stack"]);
	});

	it("keeps a recorded stack when any contained branch exists locally", async () => {
		const { gateway } = createGateway({
			readResult: {
				type: "found",
				contents: JSON.stringify({
					schemaVersion: 1,
					stacks: [
						{
							number: 4,
							trunk: { branch: "main" },
							branches: [{ branch: "deleted" }, { branch: "existing" }],
						},
						{
							number: 3,
							trunk: { branch: "main" },
							branches: [{ branch: "also-deleted" }],
						},
					],
				}),
			},
			localBranchTipsResult: {
				ok: true,
				value: [{ name: "existing", headSha: "abc123", headIso: null }],
			},
		});

		await expect(gateway.readLocalInventory({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			value: {
				worktreeGitDir: "/repo/.git/worktrees/current",
				stacks: [
					{
						number: 4,
						base: "main",
						branches: [
							{ name: "deleted", pullRequest: null },
							{ name: "existing", pullRequest: null },
						],
					},
				],
			},
		});
	});

	it("does not keep a recorded stack only because its base exists locally", async () => {
		const { gateway } = createGateway({
			localBranchTipsResult: {
				ok: true,
				value: [{ name: "main", headSha: "abc123", headIso: null }],
			},
		});
		await expect(gateway.readLocalInventory({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			value: { worktreeGitDir: "/repo/.git/worktrees/current", stacks: [] },
		});
	});

	it("treats an absent state file as an empty inventory", async () => {
		const { gateway } = createGateway({ readResult: { type: "missing" } });
		await expect(gateway.readLocalInventory({ cwd: "/repo" })).resolves.toEqual({
			ok: true,
			value: { worktreeGitDir: "/repo/.git/worktrees/current", stacks: [] },
		});
	});

	it("classifies a Git failure", async () => {
		const { gateway } = createGateway({
			gitResult: { ok: false, error: { code: "git_path_failed", message: "not a repo" } },
		});
		const result = await gateway.readLocalInventory({ cwd: "/not-repo" });
		expect(result).toMatchObject({
			ok: false,
			error: { type: "git-repository-unavailable" },
		});
	});

	it("classifies a local branch listing failure as a Git failure", async () => {
		const { gateway } = createGateway({
			localBranchTipsResult: {
				ok: false,
				error: { code: "git_branch_tips_failed", message: "could not list branches" },
			},
		});
		const result = await gateway.readLocalInventory({ cwd: "/repo" });
		expect(result).toMatchObject({
			ok: false,
			error: { type: "git-repository-unavailable" },
		});
	});

	it("classifies a state read failure", async () => {
		const { gateway } = createGateway({
			readResult: { type: "failure", message: "permission denied" },
		});
		const result = await gateway.readLocalInventory({ cwd: "/repo" });
		expect(result).toMatchObject({
			ok: false,
			error: { type: "gh-stack-state-read-failed" },
		});
	});

	it.each([
		["invalid JSON", "{"],
		["unsupported structure", JSON.stringify({ schemaVersion: 1, stacks: [{}] })],
	])("classifies %s as unsupported state", async (_label, contents) => {
		const { gateway } = createGateway({ readResult: { type: "found", contents } });
		const result = await gateway.readLocalInventory({ cwd: "/repo" });
		expect(result).toMatchObject({
			ok: false,
			error: { type: "gh-stack-state-unsupported" },
		});
	});
});
