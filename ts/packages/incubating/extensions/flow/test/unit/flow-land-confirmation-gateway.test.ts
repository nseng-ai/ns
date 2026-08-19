import { describe, expect, test } from "vitest";

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	formatPrSubmitRequirementLine,
	postLandingCleanupCommands,
	submitRequiredUpdatesCommands,
} from "../../src/land/confirmation-commands.ts";
import type { LandConfirmationRequest } from "../../src/land/execution/host-seams.ts";
import {
	createFlowLandConfirmationGateway,
	createUpfrontApprovedLandConfirmationGateway,
} from "../../src/land/flow-land-confirmation-gateway.ts";
import type { LandingPlan } from "../../src/land/types.ts";
import type { NotifyLevel, PrintAwareLandStackCommandContext } from "../../src/land/stack/types.ts";
import { pullRequestFacts, stackSnapshot } from "../../src/land/testing.ts";

const SLOT_ROOT = "/state/ns/slots/repos/repo/worktrees/slot-02";

interface GatewayContextFixture {
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly confirmations: Array<{
		readonly title: string;
		readonly message: string;
		readonly options?: { readonly defaultAnswer?: "yes" | "no" };
	}>;
	readonly notifications: Array<{ readonly message: string; readonly level?: NotifyLevel }>;
	readonly selections: Array<{ readonly title: string; readonly options: readonly string[] }>;
}

function createGatewayContext(options: {
	readonly hasUI: boolean;
	readonly confirmation?: "confirmed" | "declined" | "cancelled";
	readonly hasSelect?: boolean;
}): GatewayContextFixture {
	const confirmations: GatewayContextFixture["confirmations"][number][] = [];
	const notifications: Array<{ message: string; level?: NotifyLevel }> = [];
	const selections: Array<{ title: string; options: readonly string[] }> = [];
	const ctx: PrintAwareLandStackCommandContext = {
		cwd: SLOT_ROOT,
		hasUI: options.hasUI,
		ui: {
			notify(message, level) {
				notifications.push({ message, ...optionalEntry("level", level) });
			},
			async confirm(title, message, confirmOptions) {
				confirmations.push({
					title,
					message,
					...(confirmOptions === undefined ? {} : { options: confirmOptions }),
				});
				return { type: options.confirmation ?? "confirmed" };
			},
			...(options.hasSelect === true
				? {
						async select(title: string, selectOptions: readonly string[]) {
							selections.push({ title, options: selectOptions });
							return { type: "cancelled" as const };
						},
					}
				: {}),
			setStatus() {},
		},
		async waitForIdle() {},
	};
	return { ctx, confirmations, notifications, selections };
}

function landingPlan(): LandingPlan {
	return {
		repoRoot: SLOT_ROOT,
		metadataDbPath: `${SLOT_ROOT}/.git/graphite.db`,
		stack: stackSnapshot({ current: "feature-a", landingBranches: ["feature-a"] }),
		branchPlans: [
			{
				branch: "feature-a",
				localSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				pr: pullRequestFacts({ number: 7, headRefName: "feature-a" }),
			},
		],
		preflight: { status: "ready", checkedBranches: ["feature-a"], warnings: [], failures: [] },
		prSubmitRequirements: [],
		submitRestackRequirements: [],
		managedSlotConflicts: [],
		descendantMaintenance: { type: "none", branches: [] },
	};
}

interface ConfirmationRequestEntry {
	readonly name: string;
	readonly request: LandConfirmationRequest;
	readonly title: string;
	readonly detailIncludes: readonly string[];
	readonly defaultAnswer?: "yes";
}

const cleanupPreview = {
	branch: "feature-a",
	repoRoot: SLOT_ROOT,
	slotName: "slot-02",
	localBranchDisposition: "delete" as const,
};

const mainLandingEntry: ConfirmationRequestEntry = {
	name: "main-landing with cleanup",
	request: { kind: "main-landing", plan: landingPlan(), cleanup: cleanupPreview },
	title: "Land this stack path?",
	detailIncludes: [
		"feature-a",
		"#7",
		"Post-landing cleanup:",
		"Slot: slot-02",
		`Worktree: ${SLOT_ROOT}`,
		"Local branch: feature-a",
		"$ ns slot free --wt slot-02",
		"$ gt delete feature-a -f -q",
	],
	defaultAnswer: "yes",
};

const singleBranchMainLandingEntry: ConfirmationRequestEntry = {
	name: "single-branch-main-landing with cleanup",
	request: {
		kind: "single-branch-main-landing",
		pullRequest: pullRequestFacts({ number: 9, headRefName: "feature-single-branch" }),
		trunk: "main",
		cleanup: { ...cleanupPreview, branch: "feature-single-branch" },
	},
	title: "Land this PR?",
	detailIncludes: [
		"#9",
		"feature-single-branch",
		"main",
		"Post-landing cleanup:",
		"Slot: slot-02",
		`Worktree: ${SLOT_ROOT}`,
		"Local branch: feature-single-branch",
		"$ ns slot free --wt slot-02",
		"$ gt delete feature-single-branch -f -q",
	],
	defaultAnswer: "yes",
};

const freeManagedSlotsEntry: ConfirmationRequestEntry = {
	name: "free-managed-slots",
	request: {
		kind: "free-managed-slots",
		slots: [{ type: "managed-slot", branch: "feature-a", path: SLOT_ROOT, slotName: "slot-02" }],
	},
	title: "Free landing slots?",
	detailIncludes: ["feature-a", "slot-02"],
};

const requestTable: ReadonlyArray<ConfirmationRequestEntry> = [
	mainLandingEntry,
	singleBranchMainLandingEntry,
	freeManagedSlotsEntry,
	{
		name: "submit-required-updates",
		request: {
			kind: "submit-required-updates",
			landingTargetBranch: "feature-a",
			requirements: [
				{
					branch: "feature-a",
					prNumber: 7,
					localSha: "local",
					prHeadSha: "remote",
					baseRefName: "main",
					reasons: ["head remote != local"],
				},
			],
			restackRequirements: [],
		},
		title: "Run gt submit/update?",
		detailIncludes: ["feature-a", "#7"],
	},
];

describe("flow land confirmation gateway", () => {
	test.each(requestTable)("$name approves through the interactive prompt", async (entry) => {
		const fixture = createGatewayContext({ hasUI: true });
		const gateway = createFlowLandConfirmationGateway(fixture.ctx);

		await expect(gateway.confirm(entry.request)).resolves.toEqual({
			type: "approved",
			approvalSource: "prompted",
		});
		expect(fixture.confirmations).toHaveLength(1);
		expect(fixture.confirmations[0]).toMatchObject({
			title: entry.title,
			...(entry.defaultAnswer === undefined
				? {}
				: { options: { defaultAnswer: entry.defaultAnswer } }),
		});
		for (const detail of entry.detailIncludes) {
			expect(fixture.confirmations[0]?.message).toContain(detail);
		}
	});

	test.each(requestTable)("$name maps an interactive decline to declined", async (entry) => {
		const fixture = createGatewayContext({ hasUI: true, confirmation: "declined" });
		const gateway = createFlowLandConfirmationGateway(fixture.ctx);

		await expect(gateway.confirm(entry.request)).resolves.toEqual({ type: "declined" });
	});

	test.each([
		{
			confirmation: "confirmed",
			expected: { type: "approved", approvalSource: "prompted", cleanupPolicy: "free" },
		},
		{
			confirmation: "declined",
			expected: { type: "approved", approvalSource: "prompted", cleanupPolicy: "preserve" },
		},
		{
			confirmation: "cancelled",
			expected: { type: "declined" },
		},
	] as const)("cleanup confirmation maps $confirmation", async ({ confirmation, expected }) => {
		const fixture = createGatewayContext({ hasUI: true, confirmation });
		const gateway = createFlowLandConfirmationGateway(fixture.ctx);

		await expect(
			gateway.confirm({
				kind: "main-landing",
				plan: landingPlan(),
				cleanupChoice: cleanupPreview,
			}),
		).resolves.toEqual(expected);
		expect(fixture.confirmations).toHaveLength(1);
		expect(fixture.confirmations[0]).toMatchObject({
			title: "Land, free slot-02, and delete local branch feature-a?",
			options: { defaultAnswer: "no" },
		});
		expect(fixture.confirmations[0]?.message).toContain(
			"Land Graphite stack path: main -> feature-a",
		);
		expect(fixture.confirmations[0]?.message).toContain("If Yes, after a successful landing:");
		expect(fixture.confirmations[0]?.message).toContain(
			"Post-landing cleanup will detach the current managed slot to trunk, then delete the landed local Graphite branch.",
		);
		expect(fixture.confirmations[0]?.message).toContain(
			"If No (default), land and keep slot-02 and local branch feature-a.",
		);
		expect(fixture.confirmations[0]?.message).toContain("Press Ctrl-C to cancel before merge.");
		expect(fixture.notifications).toEqual([]);
		expect(fixture.selections).toEqual([]);
	});

	test("cleanup confirmation does not call an available selector", async () => {
		const fixture = createGatewayContext({ hasUI: true, hasSelect: true });
		const gateway = createFlowLandConfirmationGateway(fixture.ctx);

		await expect(
			gateway.confirm({
				kind: "main-landing",
				plan: landingPlan(),
				cleanupChoice: cleanupPreview,
			}),
		).resolves.toMatchObject({ type: "approved", cleanupPolicy: "free" });
		expect(fixture.confirmations).toHaveLength(1);
		expect(fixture.selections).toEqual([]);
	});

	test("cleanup confirmation keeps trunk wording accurate for the single-branch path", async () => {
		const fixture = createGatewayContext({ hasUI: true });
		const gateway = createFlowLandConfirmationGateway(fixture.ctx);

		await expect(
			gateway.confirm({
				kind: "single-branch-main-landing",
				pullRequest: pullRequestFacts({ number: 9, headRefName: "main" }),
				trunk: "main",
				cleanupChoice: {
					...cleanupPreview,
					branch: "main",
					localBranchDisposition: "keep-trunk",
				},
			}),
		).resolves.toMatchObject({ type: "approved", cleanupPolicy: "free" });
		expect(fixture.confirmations[0]).toMatchObject({
			title: "Land, free slot-02, and keep local trunk branch main?",
			options: { defaultAnswer: "no" },
		});
		expect(fixture.confirmations[0]?.message).toContain("PR: #9 PR 9");
		expect(fixture.confirmations[0]?.message).toContain("The local trunk branch is kept.");
		expect(fixture.confirmations[0]?.message).not.toContain("delete local branch main");
	});

	test.each(requestTable)("$name maps interactive cancellation to declined", async (entry) => {
		const fixture = createGatewayContext({ hasUI: true, confirmation: "cancelled" });
		const gateway = createFlowLandConfirmationGateway(fixture.ctx);

		await expect(gateway.confirm(entry.request)).resolves.toEqual({ type: "declined" });
	});

	test.each(requestTable)(
		"$name refuses non-interactively with a fully worded failure",
		async (entry) => {
			const fixture = createGatewayContext({ hasUI: false });
			const gateway = createFlowLandConfirmationGateway(fixture.ctx);

			const decision = await gateway.confirm(entry.request);
			expect(decision).toMatchObject({
				type: "refused-with-fully-worded-failure",
				failure: { outcome: "refusal", refusalReason: "non-interactive" },
			});
			expect(fixture.confirmations).toEqual([]);
		},
	);

	test("upfront approvals intercept only selected request kinds and snapshot the set", async () => {
		const fixture = createGatewayContext({ hasUI: true });
		const approvedKinds = new Set<LandConfirmationRequest["kind"]>(["main-landing"]);
		const gateway = createUpfrontApprovedLandConfirmationGateway(
			createFlowLandConfirmationGateway(fixture.ctx),
			approvedKinds,
		);
		approvedKinds.add("free-managed-slots");

		await expect(gateway.confirm(mainLandingEntry.request)).resolves.toEqual({
			type: "approved",
			approvalSource: "approved-upfront",
		});
		await expect(gateway.confirm(freeManagedSlotsEntry.request)).resolves.toEqual({
			type: "approved",
			approvalSource: "prompted",
		});
		expect(fixture.confirmations).toHaveLength(1);
	});
});

describe("structural confirmation command builders", () => {
	test("post-landing cleanup commands are derived structurally, never parsed from prose", () => {
		expect(
			postLandingCleanupCommands({
				branch: "feature-a",
				slotName: "slot-02",
				localBranchDisposition: "delete",
			}),
		).toEqual(["ns slot free --wt slot-02", "gt delete feature-a -f -q"]);
		expect(
			postLandingCleanupCommands({
				branch: "main",
				slotName: "slot-02",
				localBranchDisposition: "keep-trunk",
			}),
		).toEqual(["ns slot free --wt slot-02"]);
	});

	test("submit-required-updates commands include the restack step only with a restack target", () => {
		expect(submitRequiredUpdatesCommands({ landingTargetBranch: "feature-b" })).toEqual([
			"gt submit --branch feature-b --no-stack --update-only --no-edit --no-ai --no-interactive",
		]);
		expect(
			submitRequiredUpdatesCommands({
				landingTargetBranch: "feature-b",
				restackTarget: "feature-b",
			}),
		).toEqual([
			"gt restack --branch feature-b --upstack --no-interactive",
			"gt submit --branch feature-b --no-stack --update-only --no-edit --no-ai --no-interactive",
		]);
	});

	test("PR requirement lines share one formatter", () => {
		expect(
			formatPrSubmitRequirementLine({
				branch: "feature-a",
				prNumber: 7,
				reasons: ["head remote != local", "base develop != main"],
			}),
		).toBe("- #7 feature-a: head remote != local; base develop != main");
	});
});
