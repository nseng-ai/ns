import { describe, expect, test } from "vitest";

import { parseArgs } from "../../src/land/land-stack.ts";
import { runPostLandingSlotCleanup } from "../../src/land/post-landing-slot-cleanup.ts";
import type {
	LandingShape,
	NotifyLevel,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "../../src/land/stack/types.ts";
import { createInMemoryLandContext } from "../../src/land/testing.ts";

const SLOT_ROOT = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-02";
const BRANCH = "feature/current";

interface CleanupContextFixture {
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly confirmations: string[];
	readonly notifications: Array<{ readonly message: string; readonly level?: NotifyLevel }>;
}

function createCleanupContext(hasUI: boolean): CleanupContextFixture {
	const confirmations: string[] = [];
	const notifications: Array<{ message: string; level?: NotifyLevel }> = [];
	return {
		ctx: {
			cwd: SLOT_ROOT,
			hasUI,
			ui: {
				notify(message, level) {
					notifications.push({ message, ...(level === undefined ? {} : { level }) });
				},
				async confirm(title) {
					confirmations.push(title);
					return true;
				},
				setStatus() {},
			},
			async waitForIdle() {},
		},
		confirmations,
		notifications,
	};
}

function managedShape(): LandingShape {
	return {
		repoRoot: SLOT_ROOT,
		current: BRANCH,
		trunk: "main",
		metadataDbPath: "/repo/.git/.graphite/metadata.db",
		stack: {
			trunk: "main",
			current: BRANCH,
			actualCurrentBranch: BRANCH,
			landingTargetBranch: BRANCH,
			landingBranches: [BRANCH],
			remainingLandingBranches: [],
			descendantBranches: [],
			descendantRootBranches: [],
			warnings: [],
		},
	};
}

function expectParsed(argsText: string): ParsedArgs {
	const result = parseArgs(argsText);
	if (result.type === "failure") throw new Error(result.failure.message);
	return result.value;
}

describe("post-landing slot cleanup defaults", () => {
	test("interactive runs free the current managed slot and delete the final branch by default", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext(true);

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape: managedShape(),
		});

		expect(outcome).toEqual({ type: "success", value: undefined });
		expect(fixture.confirmations).toEqual(["Free current slot and delete local branch?"]);
		expect(worktrees.freeSlotsCalls).toEqual([
			{
				repoRoot: SLOT_ROOT,
				slots: [{ type: "managed-slot", branch: BRANCH, path: SLOT_ROOT, slotName: "slot-02" }],
			},
		]);
		expect(graphite.deleteLocalBranchCalls).toEqual([
			{ repoRoot: SLOT_ROOT, branch: BRANCH, checkedOutConflictHandling: "fail" },
		]);
	});

	test("--preserve keeps the current slot and local branch in interactive runs", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext(true);

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args: expectParsed("--preserve"),
			shape: managedShape(),
		});

		expect(outcome).toEqual({ type: "success", value: undefined });
		expect(fixture.confirmations).toEqual([]);
		expect(worktrees.freeSlotsCalls).toEqual([]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("non-interactive cleanup is still the default but requires confirmation override", async () => {
		const refused = createInMemoryLandContext();
		const refusal = await runPostLandingSlotCleanup({
			landContext: refused.context,
			ctx: createCleanupContext(false).ctx,
			args: expectParsed(""),
			shape: managedShape(),
		});
		expect(refusal.type).toBe("failure");
		expect(refused.worktrees.freeSlotsCalls).toEqual([]);
		expect(refused.graphite.deleteLocalBranchCalls).toEqual([]);

		const confirmed = createInMemoryLandContext();
		await runPostLandingSlotCleanup({
			landContext: confirmed.context,
			ctx: createCleanupContext(false).ctx,
			args: expectParsed("--yes"),
			shape: managedShape(),
		});
		expect(confirmed.worktrees.freeSlotsCalls).toHaveLength(1);
		expect(confirmed.graphite.deleteLocalBranchCalls).toHaveLength(1);
	});
});
