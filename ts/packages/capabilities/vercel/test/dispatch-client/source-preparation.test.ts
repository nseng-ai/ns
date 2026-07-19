import { describe, expect, test } from "vitest";

import { prepareDispatchSource } from "../../src/dispatch-client/source-preparation.ts";
import {
	createFakeDispatchGateways,
	FAKE_HEAD_SHA,
	FAKE_REWRITTEN_HEAD_SHA,
	type FakeDispatchGatewaysOptions,
} from "./support/dispatch-prompt-fakes.ts";

const INITIAL_SOURCE = {
	repoRoot: "/repo",
	branch: "feature/widgets",
	headSha: FAKE_HEAD_SHA,
};
const TRACKED_PLAN = {
	type: "tracked" as const,
	plan: { trunkBranch: "main", affectedBranches: ["feature/widgets", "feature/base"] },
};

async function prepare(options: FakeDispatchGatewaysOptions = {}, isForceAuthorized = true) {
	const gateways = createFakeDispatchGateways(options);
	const result = await prepareDispatchSource({
		cwd: "/repo",
		initialSource: INITIAL_SOURCE,
		initialRemoteTip: options.git?.remoteTip ?? { type: "found", sha: FAKE_HEAD_SHA },
		isForceAuthorized,
		gateways,
	});
	return { result, gateways };
}

describe("prepareDispatchSource", () => {
	test("exact remote skips publication and returns one authoritative context", async () => {
		const { result, gateways } = await prepare();

		expect(result).toMatchObject({
			ok: true,
			prepared: {
				context: { source: INITIAL_SOURCE },
				receipt: { stage: "source", source: { type: "already-current" } },
			},
		});
		expect(gateways.sourcePublication.plans).toEqual([]);
		expect(gateways.git.sourcePushes).toEqual([]);
	});

	test.each([{ type: "missing" as const }, { type: "found" as const, sha: "b".repeat(40) }])(
		"stale untracked source uses an exact-SHA Git publication ($type)",
		async (remoteTip) => {
			const { result, gateways } = await prepare({ git: { remoteTip } });

			expect(result).toMatchObject({
				ok: true,
				prepared: {
					receipt: {
						stage: "source",
						source: {
							type: "git-pushed",
							mutation: { local: "none", remote: "observed" },
						},
					},
				},
			});
			expect(gateways.git.sourcePushes).toEqual([
				{ branch: "feature/widgets", expectedRevision: FAKE_HEAD_SHA },
			]);
		},
	);

	test("failed exact-SHA publication conservatively retains possible remote mutation", async () => {
		const { result } = await prepare({
			git: {
				remoteTip: { type: "missing" },
				sourcePushResult: { ok: false, error: { code: "push", message: "rejected" } },
			},
		});

		expect(result).toEqual({
			ok: false,
			outcome: {
				status: "source-push-failed",
				sourceBranch: "feature/widgets",
				message: "rejected",
				receipt: {
					stage: "source",
					source: {
						type: "git-push-attempted",
						mutation: { local: "none", remote: "possible" },
					},
				},
			},
		});
	});

	test.each([
		[false, { type: "non-interactive-force-required" }],
		[true, { type: "declined" }],
	] as const)("tracked publication authorization fails closed", async (isInteractive, expected) => {
		const { result, gateways } = await prepare(
			{
				git: { remoteTip: { type: "missing" } },
				sourcePublication: { plan: TRACKED_PLAN },
				publicationAuthorization: { isInteractive },
			},
			false,
		);

		expect(result).toMatchObject({
			ok: false,
			outcome: {
				status:
					expected.type === "declined"
						? "source-publication-declined"
						: "source-publication-force-required",
				affectedBranches: TRACKED_PLAN.plan.affectedBranches,
			},
		});
		expect(gateways.sourcePublication.publications).toEqual([]);
		expect(gateways.git.anchorPushes).toEqual([]);
	});

	test("authorized Graphite publication does not forward force", async () => {
		const { result, gateways } = await prepare({
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
		});

		expect(result).toMatchObject({ ok: true });
		expect(gateways.sourcePublication.publications).toEqual([
			{
				expectedBranch: "feature/widgets",
				expectedHeadSha: FAKE_HEAD_SHA,
				expectedPlan: TRACKED_PLAN.plan,
				restack: true,
				force: false,
			},
		]);
	});

	test("propagates a Graphite-rewritten SHA in the validated context", async () => {
		const { result } = await prepare({
			git: { remoteTip: { type: "missing" } },
			sourcePublication: {
				plan: TRACKED_PLAN,
				publish: {
					type: "published",
					source: { branch: "feature/widgets", headSha: FAKE_REWRITTEN_HEAD_SHA },
					mutation: { local: "observed", remote: "observed" },
				},
			},
		});

		expect(result).toMatchObject({
			ok: true,
			prepared: {
				context: { source: { headSha: FAKE_REWRITTEN_HEAD_SHA } },
				receipt: {
					source: {
						type: "graphite-submitted",
						affectedBranches: TRACKED_PLAN.plan.affectedBranches,
					},
				},
			},
		});
	});

	test.each([
		["source-read-failed", { isNotARepository: true }],
		["repository-drift", { repoRoot: "/other" }],
		["branch-drift", { branch: "feature/other" }],
		["head-drift", { headSha: "d".repeat(40) }],
		["dirty-read-failed", { dirtyReadError: { code: "status", message: "status failed" } }],
		["dirty-tree", { dirtyPaths: ["late-change.ts"] }],
		[
			"remote-tip-read-failed",
			{ remoteTip: { type: "error" as const, error: { code: "ls", message: "ls failed" } } },
		],
		["remote-tip-mismatch", { remoteTip: { type: "found" as const, sha: "e".repeat(40) } }],
	] as const)(
		"revalidates final source invariant: %s",
		async (reason, afterGraphitePublication) => {
			const { result } = await prepare({
				git: { remoteTip: { type: "missing" }, afterGraphitePublication },
				sourcePublication: { plan: TRACKED_PLAN },
			});

			expect(result).toMatchObject({
				ok: false,
				outcome: {
					status: "source-publication-verification-failed",
					reason,
					receipt: {
						stage: "source",
						source: {
							type: "graphite-submitted",
							mutation: { local: "none", remote: "observed" },
						},
					},
				},
			});
		},
	);

	test("revalidates final preflight identity after publication", async () => {
		const { result } = await prepare({
			git: { remoteTip: { type: "missing" } },
			sourcePublication: { plan: TRACKED_PLAN },
			config: { dispatchSettingsAfterPublication: { type: "missing" } },
		});

		expect(result).toMatchObject({
			ok: false,
			outcome: {
				status: "source-publication-verification-failed",
				reason: "preflight-failed",
				checks: expect.any(Array),
			},
		});
	});

	test("already-current revalidation failure has no publication receipt", async () => {
		const { result } = await prepare({ git: { headSha: "d".repeat(40) } });

		expect(result).toMatchObject({
			ok: false,
			outcome: { status: "source-revalidation-failed", reason: "head-drift" },
		});
		expect(result).not.toHaveProperty("outcome.receipt");
	});
});
