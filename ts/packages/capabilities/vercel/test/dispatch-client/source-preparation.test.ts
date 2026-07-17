import { describe, expect, test } from "vitest";

import { prepareDispatchSource } from "../../src/dispatch-client/source-preparation.ts";
import {
	createFakeDispatchGateways,
	FAKE_HEAD_SHA,
	FAKE_REWRITTEN_HEAD_SHA,
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

async function prepare(options: Parameters<typeof createFakeDispatchGateways>[0] = {}) {
	const gateways = createFakeDispatchGateways(options);
	const result = await prepareDispatchSource({
		cwd: "/repo",
		initialSource: INITIAL_SOURCE,
		initialRemoteTip: options.git?.remoteTip ?? { type: "found", sha: FAKE_HEAD_SHA },
		force: true,
		gateways,
	});
	return { result, gateways };
}

describe("prepareDispatchSource", () => {
	test("returns one authoritative already-current context", async () => {
		const { result, gateways } = await prepare();

		expect(result).toMatchObject({
			ok: true,
			prepared: {
				context: { source: INITIAL_SOURCE },
				receipt: { stage: "source", source: { type: "already-current" } },
			},
		});
		expect(gateways.sourcePublication.plans).toEqual([]);
	});

	test("owns exact-SHA Git publication and upgrades verified remote evidence", async () => {
		const { result, gateways } = await prepare({ git: { remoteTip: { type: "missing" } } });

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
						affectedBranches: ["feature/widgets", "feature/base"],
					},
				},
			},
		});
	});

	test("structurally retains completed publication evidence on revalidation failure", async () => {
		const { result } = await prepare({
			git: {
				remoteTip: { type: "missing" },
				afterGraphitePublication: { dirtyPaths: ["late-change.ts"] },
			},
			sourcePublication: { plan: TRACKED_PLAN },
		});

		expect(result).toEqual({
			ok: false,
			outcome: {
				status: "source-publication-verification-failed",
				reason: "dirty-tree",
				message: "Source publication completed, but the worktree is no longer clean.",
				receipt: {
					stage: "source",
					source: {
						type: "graphite-submitted",
						mutation: { local: "none", remote: "observed" },
						affectedBranches: ["feature/widgets", "feature/base"],
					},
				},
				dirtyPaths: ["late-change.ts"],
			},
		});
	});
});
