import { describe, expect, test } from "vitest";

import { runDispatchPreflight } from "../../src/dispatch-client/preflight.ts";
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
	const initialPreflight = await runDispatchPreflight({ repoRoot: "/repo" }, gateways);
	if (initialPreflight.ok === false) throw new Error("Expected initial preflight to pass.");
	const result = await prepareDispatchSource({
		cwd: "/repo",
		initialSource: INITIAL_SOURCE,
		initialPreflight,
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
				type: "already-current",
				context: { source: INITIAL_SOURCE },
			},
		});
		expect(gateways.sourcePublication.plans).toEqual([]);
	});

	test("owns exact-SHA Git publication and upgrades verified remote evidence", async () => {
		const { result, gateways } = await prepare({ git: { remoteTip: { type: "missing" } } });

		expect(result).toMatchObject({
			ok: true,
			prepared: {
				type: "git-pushed",
				completedPublication: {
					sourcePublication: "git-pushed",
					mutation: { local: "none", remote: "observed" },
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
				type: "graphite-submitted",
				context: { source: { headSha: FAKE_REWRITTEN_HEAD_SHA } },
				completedPublication: { affectedBranches: ["feature/widgets", "feature/base"] },
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
				sourcePublication: "graphite-submitted",
				mutation: { local: "none", remote: "observed" },
				affectedBranches: ["feature/widgets", "feature/base"],
				dirtyPaths: ["late-change.ts"],
			},
		});
	});
});
