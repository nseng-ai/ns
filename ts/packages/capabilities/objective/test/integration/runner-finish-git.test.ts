import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { RealGitGateway } from "@sdl/capability-kit/git";
import { createTempGitRepo, type TempGitRepo } from "@sdl/capability-kit/git/testing";
import { InMemoryGraphiteBranchGateway } from "@sdl/capability-kit/graphite/testing";
import { NodeCommandExecApi } from "@sdl/core/exec";
import { afterEach, expect, test } from "vitest";

import { RealObjectiveStorageGateway } from "../../src/core/real-storage.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import { runRunnerBegin, type RunnerBeginResult } from "../../src/runner/begin.ts";
import type { ObjectiveRunnerCoreContext } from "../../src/runner/context.ts";
import { runRunnerFinish, type RunnerFinishResult } from "../../src/runner/finish.ts";

const SLUG = "demo-objective";
const CHILD_BRANCH = "feature/demo-step";
const TEST_TIMEOUT_MS = 30_000;

let repo: TempGitRepo | undefined;
let scratchDir: string | undefined;

afterEach(() => {
	repo?.cleanup();
	repo = undefined;
	if (scratchDir !== undefined) rmSync(scratchDir, { recursive: true, force: true });
	scratchDir = undefined;
});

/** Temp repo with a committed Objective record, so the tree starts clean. */
function createSeededRepo(): TempGitRepo {
	const seeded = createTempGitRepo({ prefix: "sdl-objective-runner-finish-git-" });
	const recordDir = join(seeded.path, ".sdl", "objectives", SLUG);
	mkdirSync(recordDir, { recursive: true });
	writeFileSync(
		join(recordDir, "objective.md"),
		`# Objective: ${SLUG}\n\nIntegration-test objective record.\n`,
		"utf8",
	);
	seeded.runGit(["add", "."]);
	seeded.runGit(["commit", "-m", "Seed objective record"]);
	return seeded;
}

interface IntegrationCoreContext extends ObjectiveRunnerCoreContext {
	stdoutChunks: string[];
}

/** Real git/exec/fs/storage over the temp repo; nothing is dispatched. */
function createIntegrationCoreContext(seededRepo: TempGitRepo): IntegrationCoreContext {
	const stdoutChunks: string[] = [];
	const execApi = new NodeCommandExecApi();
	return {
		cwd: seededRepo.path,
		env: process.env,
		repoRoot: seededRepo.path,
		trunkBranch: "main",
		storage: new ObjectiveStorage(new RealObjectiveStorageGateway(seededRepo.path)),
		git: new RealGitGateway(execApi),
		graphite: new InMemoryGraphiteBranchGateway(),
		commands: execApi,
		writeStdout(text) {
			stdoutChunks.push(text);
		},
		writeStderr() {},
		phase() {},
		async readTextFile(path) {
			try {
				return { type: "ok", content: await readFile(path, "utf8") };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { type: "error", message };
			}
		},
		stdoutChunks,
	};
}

function readyReportJson(): string {
	return JSON.stringify({
		status: "ready-for-parent-commit",
		branch: CHILD_BRANCH,
		roadmapItems: ["Slice 1 — demo slice"],
		commitSubject: "Implement demo slice",
		commitBody: "Body line one\nBody line two",
		sections: {
			summary: "Implemented the demo slice.",
			objectiveImpact: "Advances slice 1.",
			risksBlockers: "none",
			followUps: "none",
			validation: "checks passed",
		},
	});
}

function expectBeginOk(exit: Awaited<ReturnType<typeof runRunnerBegin>>): RunnerBeginResult {
	expect(exit.type).toBe("ok");
	if (exit.type !== "ok") throw new Error("expected ok begin exit");
	return exit.data;
}

test(
	"begin → simulated subagent → finish commits the work with provenance trailers",
	async () => {
		repo = createSeededRepo();
		scratchDir = mkdtempSync(join(tmpdir(), "sdl-runner-finish-scratch-"));
		const workRepo = repo;
		const ctx = createIntegrationCoreContext(workRepo);
		const reportPath = join(scratchDir, "step-1-report.json");

		const facts = expectBeginOk(
			await runRunnerBegin(ctx, { slug: SLUG, recover: false, reportPath }),
		);
		expect(facts.baseBranch).toBe("main");
		expect(facts.headAtDispatch).toBe(workRepo.runGit(["rev-parse", "HEAD"]).trim());
		expect(facts.prompt).toContain(reportPath);

		// Simulate the subagent: its own branch, uncommitted files, report JSON.
		workRepo.runGit(["switch", "-c", CHILD_BRANCH]);
		writeFileSync(join(workRepo.path, "feature-a.txt"), "feature a\n", "utf8");
		writeFileSync(join(workRepo.path, "feature-b.txt"), "feature b\n", "utf8");
		writeFileSync(reportPath, readyReportJson(), "utf8");

		const exit = await runRunnerFinish(ctx, {
			slug: SLUG,
			facts: JSON.stringify(facts),
		});
		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok finish exit");
		const result: RunnerFinishResult = exit.data;
		expect(result.status).toBe("committed");
		expect(result.branch).toBe(CHILD_BRANCH);
		expect(result.changedPaths.sort()).toEqual(["feature-a.txt", "feature-b.txt"]);

		const commitMessage = workRepo.runGit(["log", "-1", "--format=%B"]);
		expect(commitMessage).toBe(
			"Implement demo slice\n\n" +
				"Body line one\nBody line two\n\n" +
				`Objective-Runner-Step: ${SLUG}\n\n`,
		);
		expect(result.commitSha).toBe(workRepo.runGit(["rev-parse", "HEAD"]).trim());
		expect(workRepo.runGit(["status", "--porcelain"])).toBe("");

		// Finish is terminal: a second run deterministically fails verification
		// (HEAD moved by the runner's own commit, worktree now clean) and never
		// double-commits.
		const secondExit = await runRunnerFinish(ctx, {
			slug: SLUG,
			facts: JSON.stringify(facts),
		});
		expect(secondExit.type).toBe("negative");
		if (secondExit.type !== "negative") throw new Error("expected negative second-finish exit");
		const secondResult = secondExit.data;
		if (secondResult === undefined) throw new Error("expected second-finish data");
		expect(secondResult.status).toBe("verification-failed");
		const failedIds = secondResult.gateChecks
			.filter((check) => check.status === "failed")
			.map((check) => check.id);
		expect(failedIds).toContain("head-unchanged");
		expect(failedIds).toContain("worktree-dirty");
		expect(workRepo.runGit(["rev-list", "--count", "HEAD"]).trim()).toBe("3"); // initial + seed + runner commit
	},
	TEST_TIMEOUT_MS,
);

test(
	"a parent that commits between begin and finish fails head-unchanged loudly",
	async () => {
		repo = createSeededRepo();
		scratchDir = mkdtempSync(join(tmpdir(), "sdl-runner-finish-scratch-"));
		const workRepo = repo;
		const ctx = createIntegrationCoreContext(workRepo);
		const reportPath = join(scratchDir, "step-1-report.json");

		const facts = expectBeginOk(
			await runRunnerBegin(ctx, { slug: SLUG, recover: false, reportPath }),
		);

		// Subagent work...
		workRepo.runGit(["switch", "-c", CHILD_BRANCH]);
		writeFileSync(join(workRepo.path, "feature-a.txt"), "feature a\n", "utf8");
		writeFileSync(reportPath, readyReportJson(), "utf8");
		// ...then the parent illegally mutates history mid-step.
		writeFileSync(join(workRepo.path, "parent-side.txt"), "parent side change\n", "utf8");
		workRepo.runGit(["add", "parent-side.txt"]);
		workRepo.runGit(["commit", "-m", "parent commits mid-step"]);

		const exit = await runRunnerFinish(ctx, { slug: SLUG, facts: JSON.stringify(facts) });
		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("verification-failed");
		const headCheck = exit.data?.gateChecks.find((check) => check.id === "head-unchanged");
		expect(headCheck?.status).toBe("failed");
		expect(ctx.stdoutChunks.join("")).toContain(
			`# Runner Checkpoint: ${SLUG} (verification-failed)`,
		);
		// No runner commit was created.
		const headMessage = workRepo.runGit(["log", "-1", "--format=%B"]);
		expect(headMessage).not.toContain("Objective-Runner-Step");
	},
	TEST_TIMEOUT_MS,
);

test(
	"begin refuses a report path inside the repo and an already-written report file",
	async () => {
		repo = createSeededRepo();
		scratchDir = mkdtempSync(join(tmpdir(), "sdl-runner-finish-scratch-"));
		const workRepo = repo;
		const ctx = createIntegrationCoreContext(workRepo);

		const insideExit = await runRunnerBegin(ctx, {
			slug: SLUG,
			recover: false,
			reportPath: join(workRepo.path, "report.json"),
		});
		expect(insideExit.type).toBe("usageError");

		const reportPath = join(scratchDir, "stale-report.json");
		writeFileSync(reportPath, readyReportJson(), "utf8");
		const staleExit = await runRunnerBegin(ctx, { slug: SLUG, recover: false, reportPath });
		expect(staleExit.type).toBe("usageError");
		if (staleExit.type !== "usageError") throw new Error("expected usageError exit");
		expect(staleExit.message).toContain("already exists");
	},
	TEST_TIMEOUT_MS,
);
