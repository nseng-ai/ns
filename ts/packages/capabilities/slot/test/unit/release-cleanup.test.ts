import { createFakeClinkrInteraction } from "@sdl/clinkr/testing";
import { describe, expect, it } from "vitest";

import { executeReleaseCleanup, planReleaseCleanup } from "../../src/lifecycle/release-cleanup.ts";
import type { FreedSlot } from "../../src/lifecycle/release-target.ts";
import { repoContext } from "../support/run-scenario.ts";
import { FakeClipboardGateway } from "../../src/gateways/clipboard.ts";
import { FakeSlotCommandGateway } from "../../src/gateways/fakes/command.ts";
import { FakeSlotRepositoryGateway } from "../../src/gateways/fakes/repository.ts";
import { FakeGraphiteStackGateway } from "@sdl/capability-kit/graphite/testing";
import { FakeSlotPrGateway } from "../../src/gateways/fakes/pr.ts";
import { FakeSlotStorageGateway } from "../../src/gateways/fakes/storage.ts";
import type { RepoSlotContext } from "../../src/context.ts";

const target: FreedSlot = {
	slotName: "slot-01",
	branchName: "feature/a",
	worktreePath: "/slots/repos/repo/worktrees/slot-01",
};

describe("release cleanup", () => {
	it("plans PR and local branch cleanup without mutation", async () => {
		const ctx = context({
			pr: new FakeSlotPrGateway({ prsByBranch: { "feature/a": { number: 7, state: "OPEN" } } }),
		});
		const cleanup = await planReleaseCleanup({
			ctx,
			targets: [target],
			cleanupActions: ["pr", "local-branch"],
			trunkBranch: "master",
		});
		expect(cleanup).toMatchObject([
			{ action: "pr", status: "planned", prNumber: 7 },
			{ action: "local-branch", status: "planned" },
		]);
		expect(ctx.git.operations()).toEqual([]);
		expect(ctx.pr.operations()).toEqual([{ type: "get-pr-for-branch", branch: "feature/a" }]);
	});

	it("executes in action order and stops on first error", async () => {
		const ctx = context({
			pr: new FakeSlotPrGateway({
				prsByBranch: { "feature/a": { number: 7, state: "OPEN" } },
				closeFailures: { 7: "close failed" },
			}),
		});
		const cleanup = await executeReleaseCleanup({
			ctx,
			targets: [target],
			cleanupActions: ["pr", "local-branch"],
			trunkBranch: "master",
		});
		expect(cleanup).toMatchObject([{ action: "pr", status: "error", message: "close failed" }]);
		expect(ctx.git.operations()).toEqual([]);
	});
});

function context(options: {
	pr: FakeSlotPrGateway;
}): RepoSlotContext & { git: FakeSlotRepositoryGateway; pr: FakeSlotPrGateway } {
	return {
		repo: repoContext(),
		git: new FakeSlotRepositoryGateway({
			worktrees: [{ path: "/repo", branch: "master" }],
			localBranches: ["master", "feature/a"],
		}),
		gt: new FakeGraphiteStackGateway(),
		pr: options.pr,
		storage: new FakeSlotStorageGateway(),
		clipboard: new FakeClipboardGateway(),
		command: new FakeSlotCommandGateway(),
		cwd: "/repo",
		renderCapabilities: { canEmitAnsi: false },
		interaction: createFakeClinkrInteraction().interaction,
		stderr: () => {},
		env: { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: false,
	};
}
