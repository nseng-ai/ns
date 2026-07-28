import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import { renderTrackingGate, runTrackingGate } from "../../src/core/operations/tracking-gate.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

describe("objective tracking-gate operation", () => {
	test("collects trunk-resolved branch diff and dirty evidence for one Objective", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{
				existingRefs: ["refs/heads/master"],
				currentBranch: "feature/flow-cleanup",
				dirtyPaths: ["."],
				changedPaths: {
					"master...HEAD|.": [
						".ns/objectives/flow-cleanup/roadmap.md",
						"ts/packages/incubating/extensions/objectives/src/core/operations/tracking-gate.ts",
					],
				},
			},
		);

		const exit = await runTrackingGate(ctx, { slug: "flow-cleanup" });

		expect(exit).toEqual({
			type: "ok",
			data: {
				slug: "flow-cleanup",
				objectivePath: ".ns/objectives/flow-cleanup",
				rootPath: ".ns/objectives",
				objective: { exists: true, closed: false },
				git: {
					repoRoot: "/repo",
					currentBranch: { type: "branch", branch: "feature/flow-cleanup" },
					trunkBranch: "master",
					revisionRange: "master...HEAD",
				},
				uncommitted: {
					repository: { status: "ok", hasChanges: true },
					objective: { status: "ok", hasChanges: false },
				},
				branchDiff: {
					status: "ok",
					changedPaths: [
						".ns/objectives/flow-cleanup/roadmap.md",
						"ts/packages/incubating/extensions/objectives/src/core/operations/tracking-gate.ts",
					],
					changedPathCount: 2,
					objectiveChangedPaths: [".ns/objectives/flow-cleanup/roadmap.md"],
					objectiveChangedPathCount: 1,
					materialNonObjectivePaths: [
						"ts/packages/incubating/extensions/objectives/src/core/operations/tracking-gate.ts",
					],
					materialNonObjectivePathCount: 1,
				},
				summary: {
					objectiveFilesChanged: true,
					materialNonObjectivePathsChanged: true,
					uncommittedChangesPresent: true,
					uncommittedObjectiveChangesPresent: false,
				},
			},
		});
		expect(ctx.git.exactRefPresenceCalls).toEqual([{ cwd: "/repo", ref: "refs/heads/master" }]);
		expect(ctx.git.changedPathsUnderCalls).toEqual([
			{ cwd: "/repo", revisionRange: "master...HEAD", relativePath: "." },
		]);
	});

	test("renders compact markdown evidence", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{
				existingRefs: ["refs/heads/master"],
				currentBranch: "feature/flow-cleanup",
				changedPaths: { "master...HEAD|.": [".ns/objectives/flow-cleanup/roadmap.md"] },
			},
		);
		const exit = await runTrackingGate(ctx, { slug: "flow-cleanup" });
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(renderTrackingGate(exit.data)).toContain("Diff base: `master` via `master...HEAD`");
		expect(renderTrackingGate(exit.data)).toContain("Objective files changed in branch diff: 1");
	});

	test("fails actionably before diffing when the local trunk ref is missing", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{ currentBranch: "feature/flow-cleanup" },
		);

		const exit = await runTrackingGate(ctx, { slug: "flow-cleanup" });

		expect(exit).toMatchObject({
			type: "failure",
			message: expect.stringContaining(
				"Repository trunk local ref `refs/heads/master` is missing.",
			),
		});
		expect(ctx.git.changedPathsUnderCalls).toEqual([]);
	});

	test("preserves the canonical Git failure when local trunk readiness cannot be checked", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{
				currentBranch: "feature/flow-cleanup",
				exactRefPresenceFailures: {
					"refs/heads/master": { code: "git-failed", message: "rev-parse failed" },
				},
			},
		);

		const exit = await runTrackingGate(ctx, { slug: "flow-cleanup" });

		expect(exit).toMatchObject({
			type: "failure",
			errorType: "git-failed",
			message:
				"Git failed while attempting to check required ref `refs/heads/master`. rev-parse failed",
		});
		expect(ctx.git.changedPathsUnderCalls).toEqual([]);
	});

	test("returns negative data when the Objective is missing without requiring trunk readiness", async () => {
		const ctx = contextWithFakeStorage({ records: [] });

		const exit = await runTrackingGate(ctx, { slug: "missing-objective" });

		expect(exit).toMatchObject({
			type: "negative",
			message: "No Objective record found for slug 'missing-objective'.",
			data: { slug: "missing-objective", objective: { exists: false } },
		});
	});
});

interface FakeObjectiveCliContext extends ObjectiveCliContext {
	git: InMemoryGitGateway;
}

function contextWithFakeStorage(
	fake: FakeObjectiveStorageGatewayOptions,
	gitState: ConstructorParameters<typeof InMemoryGitGateway>[0] = {},
	trunkBranch = "master",
): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		repositoryTrunk: {
			branch: trunkBranch,
			remote: "origin",
			localRef: `refs/heads/${trunkBranch}`,
			remoteTrackingRef: `refs/remotes/origin/${trunkBranch}`,
			source: "configured",
		},
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(gitState),
	};
}
