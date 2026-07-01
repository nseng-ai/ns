import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/context.ts";
import { FakeObjectiveStorageGateway } from "../../src/fake-storage.ts";
import {
	FakeAutopilotGateway,
	type FakeAutopilotGatewayState,
} from "../../src/operations/autopilot/fake-gateway.ts";
import { runAutopilotLandSlice } from "../../src/operations/autopilot/land-slice.ts";
import { ObjectiveStorage } from "../../src/storage.ts";

describe("objective autopilot land-slice operation", () => {
	test("verifies, stages, and commits via gt modify when the branch moved with tracking evidence", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{ changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"] },
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toEqual({
			type: "ok",
			data: {
				ok: true,
				committed: true,
				submitted: false,
				prUrl: null,
				branch: "feature/flow-cleanup-slice",
				changedFiles: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				violations: [],
				recoveryNotes: [],
			},
		});
		expect(ctx.autopilot.calls.graphiteModify).toEqual([{ cwd: "/repo", message: "Land slice" }]);
		expect(ctx.autopilot.calls.commit).toEqual([]);
		expect(ctx.autopilot.calls.graphiteBranchTracked).toEqual([
			{ cwd: "/repo", branch: "feature/flow-cleanup-slice" },
		]);
	});

	test("reports graphite-untracked when the current branch is not tracked by Graphite", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				branchTrackedFailure: { code: "branch_untracked", message: "untracked branch" },
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, committed: false, violations: ["graphite-untracked"] },
		});
		expect(ctx.autopilot.calls.graphiteModify).toEqual([]);
	});

	test("falls back to git commit when gt modify fails", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				graphiteModifyFailure: { code: "gt_modify_failed", message: "gt modify failed" },
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({ type: "ok", data: { ok: true, committed: true } });
		expect(ctx.autopilot.calls.commit).toEqual([{ cwd: "/repo", message: "Land slice" }]);
	});

	test("reports commit-failed when both gt modify and git commit fail", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				graphiteModifyFailure: { code: "gt_modify_failed", message: "gt modify failed" },
				commitFailure: { code: "git_commit_failed", message: "git commit failed" },
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, committed: false, violations: ["commit-failed"] },
		});
	});

	test("dry-run verifies without staging or committing", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{ changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"] },
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: true,
		});

		expect(exit).toEqual({
			type: "ok",
			data: {
				ok: true,
				committed: false,
				submitted: false,
				prUrl: null,
				branch: "feature/flow-cleanup-slice",
				changedFiles: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				violations: [],
				recoveryNotes: [],
			},
		});
		expect(ctx.autopilot.calls.stageFiles).toEqual([]);
		expect(ctx.autopilot.calls.graphiteModify).toEqual([]);
	});

	test("reports clean-worktree when nothing changed", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{ changedPaths: [] },
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["clean-worktree"] },
		});
	});

	test("reports on-trunk when the current branch is main or master", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "main" },
			{ changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"] },
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["on-trunk"] },
		});
	});

	test("reports branch-not-moved when the current branch equals the start branch", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup" },
			{ changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"] },
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["branch-not-moved"] },
		});
	});

	test("reports diff-check-failed from live evidence, not the child report", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				diffCheckFailure: { code: "diff_check_failed", message: "whitespace error" },
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["diff-check-failed"] },
		});
	});

	test("reports missing-tracking-evidence when only non-Objective files changed", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{ changedPaths: ["ts/packages/objective/src/index.ts"] },
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["missing-tracking-evidence"] },
		});
	});

	test("allows non-Objective changes alongside Objective tracking evidence", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [
					"ts/packages/objective/src/index.ts",
					".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md",
				],
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({ type: "ok", data: { ok: true, violations: [] } });
	});

	test("submits and extracts the PR URL when --submit is set", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				submitOutput: "Submitted!\nhttps://github.com/example/repo/pull/42\n",
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: true,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				ok: true,
				committed: true,
				submitted: true,
				prUrl: "https://github.com/example/repo/pull/42",
			},
		});
	});

	test("reports submit-failed but keeps committed true when submit fails after commit", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md"],
				submitFailure: { code: "submit_failed", message: "sdl flow submit failed" },
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: true,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, committed: true, submitted: false, violations: ["submit-failed"] },
		});
	});

	test("runs the formatter recovery loop for changed .ts files and refreshes changed files", async () => {
		const ctx = contextWithFakes(
			{ currentBranch: "feature/flow-cleanup-slice" },
			{
				changedPaths: [
					".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md",
					"ts/packages/objective/src/index.ts",
				],
				changedPathsAfterFormatFix: [
					".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md",
					"ts/packages/objective/src/index.ts",
					"ts/packages/objective/src/index.ts.orig",
				],
				formatCheckFailure: { code: "format_check_failed", message: "not formatted" },
			},
		);

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				ok: true,
				recoveryNotes: ["ran just ts-format-fix after just ts-format-check failed"],
				changedFiles: [
					".sdl/objectives/flow-cleanup/updates/2026-06-30-slice.md",
					"ts/packages/objective/src/index.ts",
					"ts/packages/objective/src/index.ts.orig",
				],
			},
		});
		expect(ctx.autopilot.calls.formatFix).toHaveLength(1);
		expect(ctx.autopilot.calls.formatCheck).toHaveLength(2);
	});

	test("returns usageError when --start-branch is missing", async () => {
		const ctx = contextWithFakes({ currentBranch: "feature/flow-cleanup-slice" }, {});

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			message: "Land slice",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({ type: "usageError" });
	});

	test("returns usageError when --message is missing", async () => {
		const ctx = contextWithFakes({ currentBranch: "feature/flow-cleanup-slice" }, {});

		const exit = await runAutopilotLandSlice(ctx, {
			slug: "flow-cleanup",
			startBranch: "feature/flow-cleanup",
			submit: false,
			dryRun: false,
		});

		expect(exit).toMatchObject({ type: "usageError" });
	});
});

interface FakeObjectiveCliContext extends ObjectiveCliContext {
	git: InMemoryGitGateway;
	autopilot: FakeAutopilotGateway;
}

function contextWithFakes(
	gitState: ConstructorParameters<typeof InMemoryGitGateway>[0],
	autopilotState: FakeAutopilotGatewayState,
): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "main",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway({})),
		git: new InMemoryGitGateway(gitState),
		autopilot: new FakeAutopilotGateway(autopilotState),
	};
}
