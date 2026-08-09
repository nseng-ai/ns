import { describe, expect, test } from "vitest";

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { LandExecutionStatusProgress } from "../../src/land/execution/host-seams.ts";
import {
	planManagedSlotPostLandingCleanup,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
} from "../../src/land/execution/post-landing-cleanup.ts";
import { parseArgs } from "../../src/land/land-stack.ts";
import {
	createCleanupProgress,
	planPostLandingSlotCleanup,
	postLandingCleanupRequestFromArgs,
	runPostLandingSlotCleanup,
} from "../../src/land/post-landing-slot-cleanup.ts";
import type { LandingShape } from "../../src/land/types.ts";
import type {
	NotifyLevel,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "../../src/land/stack/types.ts";
import { createInMemoryLandContext } from "../../src/land/testing.ts";

const SLOT_ROOT = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-02";
const BRANCH = "feature/current";

interface CleanupConfirmation {
	readonly title: string;
	readonly options?: { readonly defaultAnswer?: "yes" | "no" };
}

interface CleanupContextFixture {
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly confirmations: CleanupConfirmation[];
	readonly notifications: Array<{ readonly message: string; readonly level?: NotifyLevel }>;
}

function createCleanupContext(options: {
	readonly hasUI: boolean;
	readonly shouldConfirm?: boolean;
}): CleanupContextFixture {
	const confirmations: CleanupConfirmation[] = [];
	const notifications: Array<{ message: string; level?: NotifyLevel }> = [];
	return {
		ctx: {
			cwd: SLOT_ROOT,
			hasUI: options.hasUI,
			ui: {
				notify(message, level) {
					notifications.push({ message, ...optionalEntry("level", level) });
				},
				async confirm(title, _message, confirmOptions) {
					confirmations.push({
						title,
						...(confirmOptions === undefined ? {} : { options: confirmOptions }),
					});
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

function managedShape(
	overrides: { readonly current?: string; readonly landingBranches?: string[] } = {},
): LandingShape {
	const current = overrides.current ?? BRANCH;
	return {
		repoRoot: SLOT_ROOT,
		current,
		trunk: "main",
		metadataDbPath: "/repo/.git/.graphite/metadata.db",
		stack: {
			trunk: "main",
			current,
			actualCurrentBranch: current,
			landingTargetBranch: current,
			landingBranches: overrides.landingBranches ?? [current],
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

describe("parsed-args to cleanup policy mapping", () => {
	test.each([
		{ rawArgs: "", policy: "preserve", mode: "execute" },
		{ rawArgs: "--free", policy: "free", mode: "execute" },
		// --yes is approval state, not a cleanup policy.
		{ rawArgs: "--yes", policy: "preserve", mode: "execute" },
		{ rawArgs: "--dry-run", policy: "preserve", mode: "dry-run" },
		{ rawArgs: "--dry-run --free", policy: "free", mode: "dry-run" },
	])("maps '$rawArgs' to $policy/$mode", ({ rawArgs, policy, mode }) => {
		expect(postLandingCleanupRequestFromArgs(expectParsed(rawArgs))).toEqual({ mode, policy });
	});
});

describe("post-landing slot cleanup defaults", () => {
	test("--free authorizes cleanup without any confirmation prompt", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const args = expectParsed("--free");

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
		});

		expect(outcome.type).toBe("completed");
		expect(fixture.confirmations).toEqual([]);
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

	test("plans managed-slot cleanup only under the explicit free policy", () => {
		const freeRequest = postLandingCleanupRequestFromArgs(expectParsed("--free"));
		expect(
			planManagedSlotPostLandingCleanup({ cleanup: freeRequest, shape: managedShape() }),
		).toEqual({
			branch: BRANCH,
			repoRoot: SLOT_ROOT,
			slotName: "slot-02",
			localBranchDisposition: "delete",
		});
		expect(
			planManagedSlotPostLandingCleanup({
				cleanup: freeRequest,
				shape: managedShape({ current: "main", landingBranches: [] }),
			}),
		).toEqual({
			branch: "main",
			repoRoot: SLOT_ROOT,
			slotName: "slot-02",
			localBranchDisposition: "keep-trunk",
		});
		expect(
			planManagedSlotPostLandingCleanup({
				cleanup: postLandingCleanupRequestFromArgs(expectParsed("")),
				shape: managedShape(),
			}),
		).toBeUndefined();
		expect(
			planPostLandingSlotCleanup({ args: expectParsed("--free"), shape: managedShape() }),
		).toEqual({
			branch: BRANCH,
			repoRoot: SLOT_ROOT,
			slotName: "slot-02",
			localBranchDisposition: "delete",
		});
	});

	test("a selected free override replaces the default preserve policy", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape: managedShape(),
			chosenCleanupPolicy: "free",
		});

		expect(outcome.type).toBe("completed");
		expect(worktrees.freeSlotsCalls).toHaveLength(1);
		expect(graphite.deleteLocalBranchCalls).toEqual([
			{ repoRoot: SLOT_ROOT, branch: BRANCH, checkedOutConflictHandling: "fail" },
		]);
	});

	test("cleanup on trunk with --free frees the slot but keeps the local trunk branch", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const shape = managedShape({ current: "main", landingBranches: [] });
		const args = expectParsed("--free");

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args,
			shape,
		});

		expect(outcome.type).toBe("completed");
		expect(worktrees.freeSlotsCalls).toEqual([
			{
				repoRoot: SLOT_ROOT,
				slots: [{ type: "managed-slot", branch: "main", path: SLOT_ROOT, slotName: "slot-02" }],
			},
		]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("default preserve keeps the slot, skips mutation, and emits a discoverability hint", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const args = expectParsed("");

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
		});

		expect(outcome.type).toBe("completed");
		expect(fixture.confirmations).toEqual([]);
		expect(worktrees.freeSlotsCalls).toEqual([]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("--dry-run does not prompt, clean up, or hint", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const args = expectParsed("--dry-run");

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args,
			shape: managedShape(),
		});

		expect(outcome.type).toBe("completed");
		expect(fixture.confirmations).toEqual([]);
		expect(fixture.notifications).toEqual([]);
		expect(worktrees.freeSlotsCalls).toEqual([]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
	});
});

describe("core post-landing cleanup", () => {
	const cleanup: PostLandingCleanupRequest = {
		mode: "execute",
		policy: "free",
	};

	test("reports slot-free failures and clears status", async () => {
		const { context } = createInMemoryLandContext({
			worktrees: {
				freeSlotsFailure: {
					type: "boundary",
					phase: "post-landing-cleanup",
					source: "slot",
					code: "slot_free_failed",
					message: "slot free failed",
					displayCommand: "ns slot free --wt slot-02",
				},
			},
		});
		const statuses: Array<string | undefined> = [];
		const result = await runManagedSlotPostLandingCleanup({
			landContext: context,
			progress: recordingProgress(statuses),
			cleanup,
			shape: managedShape(),
		});

		expect(result).toMatchObject({
			type: "failure",
			failure: {
				message: "PRs were landed, but freeing slot-02 failed.",
				displayCommand: "ns slot free --wt slot-02",
			},
		});
		expect(statuses).toEqual(["freeing slot-02...", undefined]);
	});

	test("reports failed branch deletion with the typed branch and clears status", async () => {
		const deletion = {
			type: "failed" as const,
			commandDisplay: `gt delete ${BRANCH} -f -q`,
			result: {
				type: "exited" as const,
				stdout: "",
				stderr: "delete rejected",
				code: 1,
				signal: null,
			},
			isLikelyInProgressGitOperation: false,
		};
		const { context, worktrees } = createInMemoryLandContext({
			graphite: { deleteLocalBranchResults: { [BRANCH]: deletion } },
			worktrees: {
				worktrees: [{ path: SLOT_ROOT, branch: BRANCH }],
				residualCheckoutPaths: [SLOT_ROOT],
			},
		});
		const statuses: Array<string | undefined> = [];
		const result = await runManagedSlotPostLandingCleanup({
			landContext: context,
			progress: recordingProgress(statuses),
			cleanup,
			shape: managedShape(),
		});

		expect(result).toMatchObject({
			type: "failure",
			failure: {
				message: `PRs were landed and slot-02 was freed, but deleting local branch ${BRANCH} failed.`,
				displayCommand: deletion.commandDisplay,
			},
		});
		expect(statuses).toEqual(["freeing slot-02...", `deleting ${BRANCH}...`, undefined]);
		await expect(worktrees.worktrees({ repoRoot: SLOT_ROOT })).resolves.toEqual({
			type: "success",
			value: [{ path: SLOT_ROOT, branch: BRANCH }],
		});
	});

	test("cleanup progress adapter exposes only the status capability", () => {
		const fixture = createCleanupContext({ hasUI: true });
		expect(Object.keys(createCleanupProgress(fixture.ctx))).toEqual(["setStatus"]);
	});

	test("clears status after successful cleanup", async () => {
		const { context } = createInMemoryLandContext();
		const statuses: Array<string | undefined> = [];
		await expect(
			runManagedSlotPostLandingCleanup({
				landContext: context,
				progress: recordingProgress(statuses),
				cleanup,
				shape: managedShape(),
			}),
		).resolves.toMatchObject({ type: "completed" });
		expect(statuses.at(-1)).toBeUndefined();
	});
});

function recordingProgress(statuses: Array<string | undefined>): LandExecutionStatusProgress {
	return {
		setStatus(message) {
			statuses.push(message);
		},
	};
}
