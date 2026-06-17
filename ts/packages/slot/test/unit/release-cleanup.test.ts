import { describe, expect, it } from "vitest";

import { executeReleaseCleanup, planReleaseCleanup } from "../../src/lifecycle/release-cleanup.ts";
import type { FreedSlot } from "../../src/lifecycle/release-target.ts";
import { repoContext } from "../support/run-scenario.ts";
import { FakeClipboardGateway } from "../../src/gateways/clipboard.ts";
import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";
import { FakeSlotPrGateway } from "../../src/gateways/fakes/pr.ts";
import { FakeSlotStorageGateway } from "../../src/gateways/fakes/storage.ts";
import type { RepoSlotContext } from "../../src/context.ts";

const target: FreedSlot = { slot_name: "slot-01", branch_name: "feature/a", worktree_path: "/slots/repos/repo/worktrees/slot-01" };

describe("release cleanup", () => {
	it("plans PR and local branch cleanup without mutation", async () => {
		const ctx = context({ pr: new FakeSlotPrGateway({ prsByBranch: { "feature/a": { number: 7, state: "OPEN" } } }) });
		const cleanup = await planReleaseCleanup(ctx, [target], ["pr", "local_branch"], { trunkBranch: "master" });
		expect(cleanup).toMatchObject([{ action: "pr", status: "planned", pr_number: 7 }, { action: "local_branch", status: "planned" }]);
		expect(ctx.git.operations()).toEqual([]);
		expect(ctx.pr.operations()).toEqual([{ type: "get-pr-for-branch", branch: "feature/a" }]);
	});

	it("executes in action order and stops on first error", async () => {
		const ctx = context({ pr: new FakeSlotPrGateway({ prsByBranch: { "feature/a": { number: 7, state: "OPEN" } }, closeFailures: { 7: "close failed" } }) });
		const cleanup = await executeReleaseCleanup(ctx, [target], ["pr", "local_branch"], { trunkBranch: "master" });
		expect(cleanup).toMatchObject([{ action: "pr", status: "error", message: "close failed" }]);
		expect(ctx.git.operations()).toEqual([]);
	});
});

function context(options: { pr: FakeSlotPrGateway }): RepoSlotContext & { git: FakeSlotGitGateway; pr: FakeSlotPrGateway } {
	return {
		repo: repoContext(),
		git: new FakeSlotGitGateway({ worktrees: [{ path: "/repo", branch: "master" }], localBranches: ["master", "feature/a"] }),
		pr: options.pr,
		storage: new FakeSlotStorageGateway(),
		clipboard: new FakeClipboardGateway(),
		cwd: "/repo",
		stdin: async () => "",
		stderr: () => {},
		env: { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: false,
	};
}
