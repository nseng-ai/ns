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
}

function createGatewayContext(options: {
	readonly hasUI: boolean;
	readonly shouldConfirm?: boolean;
}): GatewayContextFixture {
	const confirmations: GatewayContextFixture["confirmations"][number][] = [];
	const notifications: Array<{ message: string; level?: NotifyLevel }> = [];
	return {
		ctx: {
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

const mainLandingEntry: ConfirmationRequestEntry = {
	name: "main-landing",
	request: { kind: "main-landing", plan: landingPlan() },
	title: "Land this stack path?",
	detailIncludes: ["feature-a", "#7"],
};

const isolatedMainLandingEntry: ConfirmationRequestEntry = {
	name: "isolated-main-landing",
	request: {
		kind: "isolated-main-landing",
		pullRequest: pullRequestFacts({ number: 9, headRefName: "feature-isolated" }),
		trunk: "main",
	},
	title: "Land this isolated PR?",
	detailIncludes: ["#9", "feature-isolated", "main"],
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
	isolatedMainLandingEntry,
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
	{
		name: "post-landing-cleanup",
		request: {
			kind: "post-landing-cleanup",
			branch: "feature-a",
			repoRoot: SLOT_ROOT,
			slotName: "slot-02",
			localBranchDisposition: "delete",
		},
		title: "Free current slot and delete local branch?",
		detailIncludes: ["feature-a", "slot-02"],
		defaultAnswer: "yes",
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
		const fixture = createGatewayContext({ hasUI: true, shouldConfirm: false });
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
