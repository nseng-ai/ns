import { describe, expect, test } from "vitest";

import { optionalEntry } from "@ns/core/primitives";

import { parseArgs } from "../../src/land/land-stack.ts";
import {
	resolvePostLandingSlotCleanupDecision,
	runPostLandingSlotCleanup,
	type PostLandingSlotCleanupDecision,
} from "../../src/land/post-landing-slot-cleanup.ts";
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

function createCleanupContext(options: {
	readonly hasUI: boolean;
	readonly shouldConfirm?: boolean;
}): CleanupContextFixture {
	const confirmations: string[] = [];
	const notifications: Array<{ message: string; level?: NotifyLevel }> = [];
	return {
		ctx: {
			cwd: SLOT_ROOT,
			hasUI: options.hasUI,
			ui: {
				notify(message, level) {
					notifications.push({ message, ...optionalEntry("level", level) });
				},
				async confirm(title) {
					confirmations.push(title);
					return options.shouldConfirm ?? true;
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
	test("upfront approval prompts once, then cleanup frees the managed slot and deletes the branch", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const args = expectParsed("");

		const decision = await resolvePostLandingSlotCleanupDecision({
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
		});
		expect(decision).toEqual({ type: "success", value: { type: "approved" } });

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
			cleanupDecision: expectDecision(decision),
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

	test("approved decision executes without an additional confirmation", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape: managedShape(),
			cleanupDecision: { type: "approved" },
		});

		expect(outcome).toEqual({ type: "success", value: undefined });
		expect(fixture.confirmations).toEqual([]);
		expect(worktrees.freeSlotsCalls).toHaveLength(1);
		expect(graphite.deleteLocalBranchCalls).toHaveLength(1);
	});

	test("upfront decline keeps the slot and local branch after landing", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true, shouldConfirm: false });
		const args = expectParsed("");

		const decision = await resolvePostLandingSlotCleanupDecision({
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
		});
		expect(decision).toEqual({ type: "success", value: { type: "declined" } });

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
			cleanupDecision: expectDecision(decision),
		});

		expect(outcome.type).toBe("failure");
		expect(fixture.confirmations).toEqual(["Free current slot and delete local branch?"]);
		expect(fixture.notifications.at(-1)).toEqual({
			message: `land stopped: Skipped post-landing cleanup by upfront choice; PRs were landed but slot-02 and local branch ${BRANCH} were kept.`,
			level: "warning",
		});
		expect(worktrees.freeSlotsCalls).toEqual([]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("--preserve and --dry-run do not prompt or clean up", async () => {
		for (const rawArgs of ["--preserve", "--dry-run"]) {
			const { context, worktrees, graphite } = createInMemoryLandContext();
			const fixture = createCleanupContext({ hasUI: true });
			const args = expectParsed(rawArgs);

			const decision = await resolvePostLandingSlotCleanupDecision({
				ctx: fixture.ctx,
				args,
				shape: managedShape(),
			});
			expect(decision).toEqual({ type: "success", value: { type: "not-needed" } });

			const outcome = await runPostLandingSlotCleanup({
				landContext: context,
				ctx: fixture.ctx,
				args,
				shape: managedShape(),
				cleanupDecision: expectDecision(decision),
			});

			expect(outcome).toEqual({ type: "success", value: undefined });
			expect(fixture.confirmations).toEqual([]);
			expect(worktrees.freeSlotsCalls).toEqual([]);
			expect(graphite.deleteLocalBranchCalls).toEqual([]);
		}
	});

	test("--yes and --force approve cleanup without prompting", async () => {
		for (const rawArgs of ["--yes", "--force"]) {
			const fixture = createCleanupContext({ hasUI: true });
			const decision = await resolvePostLandingSlotCleanupDecision({
				ctx: fixture.ctx,
				args: expectParsed(rawArgs),
				shape: managedShape(),
			});

			expect(decision).toEqual({ type: "success", value: { type: "approved" } });
			expect(fixture.confirmations).toEqual([]);
		}
	});

	test("non-interactive cleanup confirmation refusal happens before cleanup can run", async () => {
		const fixture = createCleanupContext({ hasUI: false });

		const decision = await resolvePostLandingSlotCleanupDecision({
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape: managedShape(),
		});

		expect(decision.type).toBe("failure");
		expect(fixture.confirmations).toEqual([]);
		expect(fixture.notifications.at(-1)?.message).toContain("No PRs were landed.");
		expect(fixture.notifications.at(-1)?.level).toBe("error");
	});
});

function expectDecision(
	result:
		| { readonly type: "success"; readonly value: PostLandingSlotCleanupDecision }
		| { readonly type: "failure" },
): PostLandingSlotCleanupDecision {
	if (result.type === "failure") throw new Error("expected cleanup decision success");
	return result.value;
}
