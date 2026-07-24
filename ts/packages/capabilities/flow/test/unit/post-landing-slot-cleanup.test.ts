import { describe, expect, test } from "vitest";

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type {
	LandConfirmationGateway,
	LandConfirmationRequest,
	LandExecutionStatusProgress,
} from "../../src/land/execution/host-seams.ts";
import {
	resolveManagedSlotPostLandingCleanupDecision,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
	type PostLandingSlotCleanupDecision,
} from "../../src/land/execution/post-landing-cleanup.ts";
import {
	createFlowLandConfirmationGateway,
	createUpfrontApprovedLandConfirmationGateway,
} from "../../src/land/flow-land-confirmation-gateway.ts";
import { parseArgs } from "../../src/land/land-stack.ts";
import { approvedLandConfirmationKinds } from "../../src/land/landing-confirmation-policy.ts";
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

/** Flow-shaped cleanup resolution through the flag-approval gateway decorator. */
async function resolveCleanupDecisionForArgs(options: {
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly args: ParsedArgs;
	readonly shape: LandingShape;
}): Promise<
	| { readonly type: "success"; readonly value: PostLandingSlotCleanupDecision }
	| { readonly type: "failure"; readonly failure: { readonly message: string } }
> {
	const cleanupPreview = planPostLandingSlotCleanup({ args: options.args, shape: options.shape });
	return await resolveManagedSlotPostLandingCleanupDecision({
		confirmation: createUpfrontApprovedLandConfirmationGateway(
			createFlowLandConfirmationGateway(options.ctx),
			approvedLandConfirmationKinds({
				flags: options.args,
				...optionalEntry("cleanupPreview", cleanupPreview),
			}),
		),
		cleanup: postLandingCleanupRequestFromArgs(options.args),
		shape: options.shape,
	});
}

describe("parsed-args to cleanup policy mapping", () => {
	test.each([
		{ rawArgs: "", policy: "free-slot", mode: "execute" },
		{ rawArgs: "--preserve", policy: "preserve", mode: "execute" },
		{ rawArgs: "--force", policy: "force-cleanup", mode: "execute" },
		// Contradictory flags resolve deterministically: --preserve dominates --force.
		{ rawArgs: "--preserve --force", policy: "preserve", mode: "execute" },
		// --yes is approval state, not a cleanup policy.
		{ rawArgs: "--yes", policy: "free-slot", mode: "execute" },
		{ rawArgs: "--dry-run", policy: "free-slot", mode: "dry-run" },
		{ rawArgs: "--dry-run --force", policy: "force-cleanup", mode: "dry-run" },
	])("maps '$rawArgs' to $policy/$mode", ({ rawArgs, policy, mode }) => {
		expect(postLandingCleanupRequestFromArgs(expectParsed(rawArgs))).toEqual({ mode, policy });
	});
});

describe("post-landing slot cleanup defaults", () => {
	test("upfront approval prompts once, then cleanup frees the managed slot and deletes the branch", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const args = expectParsed("");

		const decision = await resolveCleanupDecisionForArgs({
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

		expect(outcome).toEqual({ type: "completed" });
		expect(fixture.confirmations).toEqual([
			{
				title: "Free current slot and delete local branch?",
				options: { defaultAnswer: "yes" },
			},
		]);
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

		expect(outcome).toEqual({ type: "completed" });
		expect(fixture.confirmations).toEqual([]);
		expect(worktrees.freeSlotsCalls).toHaveLength(1);
		expect(graphite.deleteLocalBranchCalls).toHaveLength(1);
	});

	test("plans managed-slot cleanup only when the cleanup policy allows it", () => {
		expect(planPostLandingSlotCleanup({ args: expectParsed(""), shape: managedShape() })).toEqual({
			branch: BRANCH,
			repoRoot: SLOT_ROOT,
			slotName: "slot-02",
			localBranchDisposition: "delete",
		});
		expect(
			planPostLandingSlotCleanup({
				args: expectParsed(""),
				shape: managedShape({ current: "main", landingBranches: [] }),
			}),
		).toEqual({
			branch: "main",
			repoRoot: SLOT_ROOT,
			slotName: "slot-02",
			localBranchDisposition: "keep-trunk",
		});
		expect(
			planPostLandingSlotCleanup({ args: expectParsed("--preserve"), shape: managedShape() }),
		).toBeUndefined();
	});

	test("upfront decline keeps the slot and local branch after landing", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true, shouldConfirm: false });
		const args = expectParsed("");

		const decision = await resolveCleanupDecisionForArgs({
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
		expect(fixture.confirmations).toEqual([
			{
				title: "Free current slot and delete local branch?",
				options: { defaultAnswer: "yes" },
			},
		]);
		expect(fixture.notifications.at(-1)).toEqual({
			message: `land stopped: Skipped post-landing cleanup by upfront choice; PRs were landed but slot-02 and local branch ${BRANCH} were kept.`,
			level: "warning",
		});
		expect(worktrees.freeSlotsCalls).toEqual([]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("cleanup on trunk frees the slot but keeps the local trunk branch", async () => {
		const { context, worktrees, graphite } = createInMemoryLandContext();
		const fixture = createCleanupContext({ hasUI: true });
		const shape = managedShape({ current: "main", landingBranches: [] });

		const decision = await resolveCleanupDecisionForArgs({
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape,
		});
		expect(decision).toEqual({ type: "success", value: { type: "approved" } });

		const outcome = await runPostLandingSlotCleanup({
			landContext: context,
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape,
			cleanupDecision: expectDecision(decision),
		});

		expect(outcome).toEqual({ type: "completed" });
		expect(worktrees.freeSlotsCalls).toEqual([
			{
				repoRoot: SLOT_ROOT,
				slots: [{ type: "managed-slot", branch: "main", path: SLOT_ROOT, slotName: "slot-02" }],
			},
		]);
		expect(graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fixture.notifications.at(-1)).toEqual({
			message: "Post-landing cleanup complete: freed slot-02; local trunk branch main was kept.",
			level: "success",
		});
	});

	test("--preserve and --dry-run do not prompt or clean up", async () => {
		for (const rawArgs of ["--preserve", "--dry-run"]) {
			const { context, worktrees, graphite } = createInMemoryLandContext();
			const fixture = createCleanupContext({ hasUI: true });
			const args = expectParsed(rawArgs);

			const decision = await resolveCleanupDecisionForArgs({
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

			expect(outcome).toEqual({ type: "completed" });
			expect(fixture.confirmations).toEqual([]);
			expect(worktrees.freeSlotsCalls).toEqual([]);
			expect(graphite.deleteLocalBranchCalls).toEqual([]);
		}
	});

	test("--yes and --force approve cleanup without prompting", async () => {
		for (const rawArgs of ["--yes", "--force"]) {
			const fixture = createCleanupContext({ hasUI: true });
			const decision = await resolveCleanupDecisionForArgs({
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

		const decision = await resolveCleanupDecisionForArgs({
			ctx: fixture.ctx,
			args: expectParsed(""),
			shape: managedShape(),
		});

		expect(decision.type).toBe("failure");
		expect(fixture.confirmations).toEqual([]);
		if (decision.type !== "failure") return;
		expect(decision.failure.message).toContain("No PRs were landed.");
	});
});

describe("core post-landing cleanup", () => {
	const cleanup: PostLandingCleanupRequest = {
		mode: "execute",
		policy: "free-slot",
	};

	test("sends the exact semantic confirmation payload", async () => {
		const requests: LandConfirmationRequest[] = [];
		const confirmation: LandConfirmationGateway = {
			confirm: async (request) => {
				requests.push(request);
				return { type: "approved", approvalSource: "prompted" };
			},
		};

		await expect(
			resolveManagedSlotPostLandingCleanupDecision({
				confirmation,
				cleanup,
				shape: managedShape(),
			}),
		).resolves.toEqual({ type: "success", value: { type: "approved" } });
		expect(requests).toEqual([
			{
				kind: "post-landing-cleanup",
				branch: BRANCH,
				repoRoot: SLOT_ROOT,
				slotName: "slot-02",
				localBranchDisposition: "delete",
			},
		]);
	});

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
			cleanupDecision: { type: "approved" },
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

	test.each([
		{
			name: "retained",
			deletion: { type: "retained" as const, branch: BRANCH, path: SLOT_ROOT },
			displayCommand: `gt delete ${BRANCH} -f -q`,
		},
		{
			name: "failed",
			deletion: {
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
			},
			displayCommand: `gt delete ${BRANCH} -f -q`,
		},
	])("reports $name branch deletion with the typed branch and clears status", async (testCase) => {
		const { context, worktrees } = createInMemoryLandContext({
			graphite: { deleteLocalBranchResults: { [BRANCH]: testCase.deletion } },
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
			cleanupDecision: { type: "approved" },
		});

		expect(result).toMatchObject({
			type: "failure",
			failure: {
				message: `PRs were landed and slot-02 was freed, but deleting local branch ${BRANCH} failed.`,
				displayCommand: testCase.displayCommand,
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
				cleanupDecision: { type: "approved" },
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

function expectDecision(
	result:
		| { readonly type: "success"; readonly value: PostLandingSlotCleanupDecision }
		| { readonly type: "failure" },
): PostLandingSlotCleanupDecision {
	if (result.type === "failure") throw new Error("expected cleanup decision success");
	return result.value;
}
