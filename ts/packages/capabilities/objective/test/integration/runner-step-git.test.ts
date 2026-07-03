// ADR0024-LEGACY-DELETE(whole file): tests for the legacy blocking runner-step machinery.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { RealGitGateway } from "@sdl/capability-kit/git";
import { createTempGitRepo, type TempGitRepo } from "@sdl/capability-kit/git/testing";
import { InMemoryGraphiteBranchGateway } from "@sdl/capability-kit/graphite/testing";
import { NodeCommandExecApi } from "@sdl/core/exec";
import { afterEach, expect, test } from "vitest";

import { RealObjectiveStorageGateway } from "../../src/core/real-storage.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import {
	runnerStepRequestSchema,
	runRunnerStep,
	type RunnerStepRequest,
	type RunnerStepResult,
} from "../../src/runner/step.ts";
import type { ChildSessionOutcome } from "../../src/runner/child-session.ts";
import type { ObjectiveRunnerContext } from "../../src/runner/context.ts";
import { FakeChildSessionGateway, type FakeChildSessionScript } from "../../src/runner/testing.ts";
import { childReportText } from "../unit/runner/context.ts";

const SLUG = "demo-objective";
const CHILD_BRANCH = "feature/demo-step";
const TEST_TIMEOUT_MS = 30_000;

let repo: TempGitRepo | undefined;

afterEach(() => {
	repo?.cleanup();
	repo = undefined;
});

/** Temp repo with a committed Objective record, so the tree starts clean. */
function createSeededRepo(): TempGitRepo {
	const seeded = createTempGitRepo({ prefix: "sdl-objective-runner-git-" });
	const recordDir = join(seeded.path, ".sdl", "objectives", SLUG);
	mkdirSync(recordDir, { recursive: true });
	writeFileSync(
		join(recordDir, "objective.md"),
		`# Objective: ${SLUG}\n\nIntegration-test objective record.\n`,
		"utf8",
	);
	writeFileSync(
		join(recordDir, "roadmap.md"),
		`# Roadmap: ${SLUG}\n\n- [ ] Slice 1 — demo slice\n`,
		"utf8",
	);
	seeded.runGit(["add", "."]);
	seeded.runGit(["commit", "-m", "Seed objective record"]);
	return seeded;
}

interface IntegrationRunnerContext extends ObjectiveRunnerContext {
	stdoutChunks: string[];
}

/** Real git/exec/storage over the temp repo; only the child session is faked. */
function createIntegrationRunnerContext(
	seededRepo: TempGitRepo,
	scripts: readonly FakeChildSessionScript[],
): IntegrationRunnerContext {
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
		outputFormat: "human",
		childSession: new FakeChildSessionGateway(scripts),
		writeStdout(text) {
			stdoutChunks.push(text);
		},
		writeStderr() {},
		phase() {},
		async readTextFile(path) {
			return { type: "error", message: `guidance files are not used in this test: ${path}` };
		},
		async filePresence() {
			return { type: "missing" };
		},
		stdoutChunks,
	};
}

function request(overrides: Partial<RunnerStepRequest> = {}): RunnerStepRequest {
	return { ...runnerStepRequestSchema.parse({ slug: SLUG }), ...overrides };
}

function completedOutcome(report: Parameters<typeof childReportText>[0]): ChildSessionOutcome {
	return {
		type: "completed",
		exitCode: 0,
		finalText: childReportText(report),
		stderrTail: "",
	};
}

function expectOk(exit: Awaited<ReturnType<typeof runRunnerStep>>): RunnerStepResult {
	expect(exit.type).toBe("ok");
	if (exit.type !== "ok") throw new Error("expected ok exit");
	return exit.data;
}

function expectNegative(exit: Awaited<ReturnType<typeof runRunnerStep>>): RunnerStepResult {
	expect(exit.type).toBe("negative");
	if (exit.type !== "negative") throw new Error("expected negative exit");
	if (exit.data === undefined) throw new Error("expected negative exit data");
	return exit.data;
}

test(
	"happy default-mode step commits the child's work with provenance trailers",
	async () => {
		repo = createSeededRepo();
		const workRepo = repo;
		const ctx = createIntegrationRunnerContext(workRepo, [
			{
				onDispatch() {
					// The "child" does real work: its own branch plus uncommitted files.
					workRepo.runGit(["switch", "-c", CHILD_BRANCH]);
					writeFileSync(join(workRepo.path, "feature-a.txt"), "feature a\n", "utf8");
					writeFileSync(join(workRepo.path, "feature-b.txt"), "feature b\n", "utf8");
				},
				outcome: completedOutcome({
					branch: CHILD_BRANCH,
					commitSubject: "Implement demo slice",
					commitBody: ["Body line one", "Body line two"],
				}),
			},
		]);

		const exit = expectOk(await runRunnerStep(ctx, request()));

		expect(exit.status).toBe("committed");
		expect(exit.baseBranch).toBe("main");
		expect(exit.branch).toBe(CHILD_BRANCH);

		expect(workRepo.runGit(["branch", "--show-current"])).toBe(`${CHILD_BRANCH}\n`);
		// %B is the raw message (ending in \n); git log appends one more newline.
		const commitMessage = workRepo.runGit(["log", "-1", "--format=%B"]);
		expect(commitMessage).toBe(
			"Implement demo slice\n\n" +
				"Body line one\nBody line two\n\n" +
				`Objective-Runner-Step: ${SLUG}\n\n`,
		);
		expect(commitMessage).not.toContain("Objective-Runner-Mode");
		expect(exit.commitSha).toBe(workRepo.runGit(["rev-parse", "HEAD"]).trim());
		expect(workRepo.runGit(["status", "--porcelain"])).toBe("");
	},
	TEST_TIMEOUT_MS,
);

test(
	"recover-mode step commits the repaired tree with both trailers",
	async () => {
		repo = createSeededRepo();
		const workRepo = repo;
		// A failed prior attempt: a non-trunk branch with a dirty tree.
		workRepo.runGit(["switch", "-c", CHILD_BRANCH]);
		writeFileSync(join(workRepo.path, "half-done.txt"), "half-done work\n", "utf8");

		const ctx = createIntegrationRunnerContext(workRepo, [
			{
				onDispatch() {
					// The "child" repairs in place on the same branch, no commit.
					writeFileSync(join(workRepo.path, "half-done.txt"), "repaired work\n", "utf8");
					writeFileSync(join(workRepo.path, "repair-extra.txt"), "extra repair\n", "utf8");
				},
				outcome: completedOutcome({
					branch: CHILD_BRANCH,
					commitSubject: "Repair demo slice",
				}),
			},
		]);

		const exit = expectOk(await runRunnerStep(ctx, request({ recover: true })));

		expect(exit.status).toBe("committed");
		expect(exit.mode).toBe("recover");

		const commitMessage = workRepo.runGit(["log", "-1", "--format=%B"]);
		expect(commitMessage).toContain("Repair demo slice");
		expect(commitMessage).toContain(`Objective-Runner-Step: ${SLUG}`);
		expect(commitMessage).toContain("Objective-Runner-Mode: recover");
		expect(workRepo.runGit(["status", "--porcelain"])).toBe("");
	},
	TEST_TIMEOUT_MS,
);

test(
	"a child that committed on its own fails head-unchanged and the runner refuses to commit",
	async () => {
		repo = createSeededRepo();
		const workRepo = repo;
		const ctx = createIntegrationRunnerContext(workRepo, [
			{
				onDispatch() {
					// The child illegally commits its own work, then leaves the tree dirty.
					workRepo.runGit(["switch", "-c", CHILD_BRANCH]);
					writeFileSync(join(workRepo.path, "committed.txt"), "committed by child\n", "utf8");
					workRepo.runGit(["add", "committed.txt"]);
					workRepo.runGit(["commit", "-m", "child commits illegally"]);
					writeFileSync(join(workRepo.path, "leftover.txt"), "uncommitted leftover\n", "utf8");
				},
				outcome: completedOutcome({
					branch: CHILD_BRANCH,
					commitSubject: "Implement demo slice",
				}),
			},
		]);
		const commitCountBeforeStep = 3; // initial + seed + the child's own commit

		const exit = expectNegative(await runRunnerStep(ctx, request()));

		expect(exit.status).toBe("verification-failed");
		const headCheck = exit.gateChecks.find((check) => check.id === "head-unchanged");
		expect(headCheck?.status).toBe("failed");
		expect(ctx.stdoutChunks.join("")).toContain(
			`# Runner Checkpoint: ${SLUG} (verification-failed)`,
		);

		// The runner created no commit: the child's own commit is still HEAD.
		expect(workRepo.runGit(["rev-list", "--count", "HEAD"]).trim()).toBe(
			String(commitCountBeforeStep),
		);
		const headMessage = workRepo.runGit(["log", "-1", "--format=%B"]);
		expect(headMessage).toContain("child commits illegally");
		expect(headMessage).not.toContain("Objective-Runner-Step");

		// The dirty leftover is untouched.
		expect(workRepo.runGit(["status", "--porcelain"])).toContain("leftover.txt");
	},
	TEST_TIMEOUT_MS,
);
