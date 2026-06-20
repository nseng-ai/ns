import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@asdl/core/git/testing";

import { RealPrAddressGitGateway } from "../../src/gateways.ts";

describe("RealPrAddressGitGateway", () => {
	test("passes current branch results through from the core git gateway", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/demo" });
		const gateway = new RealPrAddressGitGateway({ git });

		const result = await gateway.getCurrentBranch({ cwd: "/repo", env: { PATH: "/fake/bin" } });

		expect(result).toEqual({ type: "branch", branch: "feature/demo" });
		expect(git.currentBranchCalls).toEqual([{ cwd: "/repo" }]);
	});

	test("maps core worktree booleans to pr-address repo context results", async () => {
		const inside = new RealPrAddressGitGateway({
			git: new InMemoryGitGateway({ isInsideWorkTree: true }),
		});
		const outside = new RealPrAddressGitGateway({
			git: new InMemoryGitGateway({ isInsideWorkTree: false }),
		});

		await expect(inside.isInsideWorkTree({ cwd: "/repo" })).resolves.toEqual({ type: "inside" });
		await expect(outside.isInsideWorkTree({ cwd: "/repo" })).resolves.toEqual({
			type: "outside",
		});
	});

	test("maps core worktree probe failures to pr-address failures", async () => {
		const failure = { code: "work_tree_probe_failed", message: "boom" };
		const gateway = new RealPrAddressGitGateway({
			git: new InMemoryGitGateway({ isInsideWorkTree: { type: "failure", error: failure } }),
		});

		await expect(gateway.isInsideWorkTree({ cwd: "/repo" })).resolves.toEqual({
			type: "failure",
			failure,
		});
	});
});
