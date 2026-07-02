import { describe, expect, test } from "vitest";

import { verifyRunnerStep, type GateCheckId } from "../../../src/runner/gate.ts";
import type { RunnerReport } from "../../../src/runner/report.ts";
import { contextWithRunnerFakes, type RunnerFakesOptions } from "./context.ts";

const DEFAULT_HEAD = "0123456789abcdef0123456789abcdef01234567";

function report(overrides: Partial<RunnerReport> = {}): RunnerReport {
	return {
		status: "ready-for-parent-commit",
		branch: "feature/demo-step",
		roadmapItems: ["Slice 1"],
		commitSubject: "Implement demo slice",
		sections: {
			summary: "s",
			objectiveImpact: "o",
			risksBlockers: "r",
			followUps: "f",
			validation: "v",
		},
		...overrides,
	};
}

function gateContext(overrides: RunnerFakesOptions = {}) {
	return contextWithRunnerFakes({
		git: {
			currentBranch: "feature/demo-step",
			statusPaths: { changedPaths: ["src/a.ts"], stagedPaths: [] },
			...overrides.git,
		},
		...(overrides.graphite === undefined ? {} : { graphite: overrides.graphite }),
		...(overrides.execResult === undefined ? {} : { execResult: overrides.execResult }),
	});
}

function checkById(checks: readonly { id: GateCheckId; status: string; detail?: string }[]) {
	return new Map(checks.map((check) => [check.id, check]));
}

describe("verifyRunnerStep", () => {
	test("default mode passes every applicable check and returns live facts", async () => {
		const ctx = gateContext();

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(true);
		expect(outcome.branch).toBe("feature/demo-step");
		expect(outcome.changedPaths).toEqual(["src/a.ts"]);
		expect(outcome.checks.map((check) => [check.id, check.status])).toEqual([
			["branch-not-trunk", "passed"],
			["moved-off-base", "passed"],
			["same-branch-as-attempt", "skipped"],
			["branch-matches-report", "passed"],
			["graphite-tracked", "passed"],
			["worktree-dirty", "passed"],
			["diff-check", "passed"],
			["head-unchanged", "passed"],
		]);
		expect(ctx.execCalls).toEqual([{ command: "git", args: ["diff", "--check"] }]);
		expect(ctx.graphite.checkBranchTrackedCalls).toEqual([
			{ cwd: "/repo", branch: "feature/demo-step" },
		]);
	});

	test("recover mode swaps the mode-dependent branch check", async () => {
		const ctx = gateContext();

		const outcome = await verifyRunnerStep(ctx, {
			mode: "recover",
			report: report(),
			baseBranch: "feature/demo-step",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(true);
		const byId = checkById(outcome.checks);
		expect(byId.get("moved-off-base")?.status).toBe("skipped");
		expect(byId.get("same-branch-as-attempt")?.status).toBe("passed");
	});

	test("fails branch-not-trunk on trunk", async () => {
		const ctx = gateContext({ git: { currentBranch: "main" } });

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report({ branch: "main" }),
			baseBranch: "feature/other",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		expect(checkById(outcome.checks).get("branch-not-trunk")?.status).toBe("failed");
	});

	test("fails moved-off-base when the child stayed on the base branch", async () => {
		const ctx = gateContext();

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "feature/demo-step",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		const byId = checkById(outcome.checks);
		expect(byId.get("moved-off-base")?.status).toBe("failed");
		expect(byId.get("same-branch-as-attempt")?.status).toBe("skipped");
	});

	test("fails same-branch-as-attempt when a recover step switched branches", async () => {
		const ctx = gateContext();

		const outcome = await verifyRunnerStep(ctx, {
			mode: "recover",
			report: report(),
			baseBranch: "feature/original-attempt",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		const byId = checkById(outcome.checks);
		expect(byId.get("same-branch-as-attempt")?.status).toBe("failed");
		expect(byId.get("moved-off-base")?.status).toBe("skipped");
	});

	test("fails branch-matches-report when the report claims another branch", async () => {
		const ctx = gateContext();

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report({ branch: "feature/claimed" }),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		expect(checkById(outcome.checks).get("branch-matches-report")?.detail).toContain(
			'"feature/claimed"',
		);
	});

	test("fails graphite-tracked for an untracked branch", async () => {
		const ctx = gateContext({ graphite: { untrackedBranches: ["feature/demo-step"] } });

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		const check = checkById(outcome.checks).get("graphite-tracked");
		expect(check?.status).toBe("failed");
		expect(check?.detail).toContain("untracked branch");
	});

	test("fails graphite-tracked when the gateway itself errors", async () => {
		const ctx = gateContext({
			graphite: { checkFailure: { code: "graphite_startup_failed", message: "gt not found" } },
		});

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(checkById(outcome.checks).get("graphite-tracked")).toEqual({
			id: "graphite-tracked",
			status: "failed",
			detail: "gt not found",
		});
	});

	test("fails worktree-dirty on a clean tree", async () => {
		const ctx = gateContext({ git: { statusPaths: { changedPaths: [], stagedPaths: [] } } });

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		expect(checkById(outcome.checks).get("worktree-dirty")?.detail).toContain(
			"changed nothing is a failed slice",
		);
		expect(outcome.changedPaths).toEqual([]);
	});

	test("fails diff-check when git diff --check exits nonzero", async () => {
		const ctx = gateContext({ execResult: { code: 2, stderr: "trailing whitespace" } });

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		const check = checkById(outcome.checks).get("diff-check");
		expect(check?.status).toBe("failed");
		expect(check?.detail).toContain("trailing whitespace");
	});

	test("fails head-unchanged when HEAD moved since dispatch", async () => {
		const ctx = gateContext();

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: "1111111111111111111111111111111111111111",
		});

		expect(outcome.passed).toBe(false);
		const check = checkById(outcome.checks).get("head-unchanged");
		expect(check?.status).toBe("failed");
		expect(check?.detail).toContain("the commit is the runner's act");
	});

	test("detached HEAD fails every branch-dependent check", async () => {
		const ctx = gateContext({ git: { currentBranch: { type: "detached" } } });

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report(),
			baseBranch: "main",
			headAtDispatch: DEFAULT_HEAD,
		});

		expect(outcome.passed).toBe(false);
		expect(outcome.branch).toBeNull();
		const byId = checkById(outcome.checks);
		for (const id of [
			"branch-not-trunk",
			"moved-off-base",
			"branch-matches-report",
			"graphite-tracked",
		] as const) {
			expect(byId.get(id)?.status).toBe("failed");
			expect(byId.get(id)?.detail).toContain("detached");
		}
	});

	test("collects all failures without short-circuiting", async () => {
		const ctx = gateContext({
			git: { currentBranch: "main", statusPaths: { changedPaths: [], stagedPaths: [] } },
			execResult: { code: 2, stderr: "conflict marker" },
		});

		const outcome = await verifyRunnerStep(ctx, {
			mode: "default",
			report: report({ branch: "feature/claimed" }),
			baseBranch: "main",
			headAtDispatch: "1111111111111111111111111111111111111111",
		});

		expect(outcome.passed).toBe(false);
		const failedIds = outcome.checks
			.filter((check) => check.status === "failed")
			.map((check) => check.id);
		expect(failedIds).toEqual([
			"branch-not-trunk",
			"moved-off-base",
			"branch-matches-report",
			"worktree-dirty",
			"diff-check",
			"head-unchanged",
		]);
	});
});
