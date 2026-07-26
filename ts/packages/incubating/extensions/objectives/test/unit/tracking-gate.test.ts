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
				currentBranch: "feature/flow-cleanup",
				trunkBranch: "master",
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
		expect(ctx.git.changedPathsUnderCalls).toEqual([
			{ cwd: "/repo", revisionRange: "master...HEAD", relativePath: "." },
		]);
	});

	test("renders compact markdown evidence", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{
				currentBranch: "feature/flow-cleanup",
				trunkBranch: "master",
				changedPaths: { "master...HEAD|.": [".ns/objectives/flow-cleanup/roadmap.md"] },
			},
		);
		const exit = await runTrackingGate(ctx, { slug: "flow-cleanup" });
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(renderTrackingGate(exit.data)).toContain("Diff base: `master` via `master...HEAD`");
		expect(renderTrackingGate(exit.data)).toContain("Objective files changed in branch diff: 1");
	});

	test("returns negative data when the Objective is missing", async () => {
		const ctx = contextWithFakeStorage({ records: [] }, { trunkBranch: "master" });

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
): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: typeof gitState.trunkBranch === "string" ? gitState.trunkBranch : "main",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(gitState),
	};
}
