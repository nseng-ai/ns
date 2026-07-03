import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	runRunnerStep,
	runnerStepRequestSchema,
	type RunnerStepRequest,
} from "../../../src/runner/step.ts";
import type { ChildSessionOutcome } from "../../../src/runner/child-session.ts";
import { childReportText, contextWithRunnerFakes, type RunnerFakesOptions } from "./context.ts";

const OPEN_OBJECTIVE = { records: [{ slug: "demo-objective" }] };

function request(overrides: Partial<RunnerStepRequest> = {}): RunnerStepRequest {
	return { ...runnerStepRequestSchema.parse({ slug: "demo-objective" }), ...overrides };
}

interface CompletedOutcomeOverrides {
	exitCode?: number;
	stderrTail?: string;
	stopReason?: string;
	sessionFile?: string;
}

function completed(
	finalText: string,
	overrides: CompletedOutcomeOverrides = {},
): ChildSessionOutcome {
	return { type: "completed", exitCode: 0, finalText, stderrTail: "", ...overrides };
}

/** Clean tree at preconditions, dirty at gate; child moves off `main`. */
function defaultHappyOptions(overrides: RunnerFakesOptions = {}): RunnerFakesOptions {
	return {
		storage: OPEN_OBJECTIVE,
		git: {
			currentBranchSequence: ["main", "feature/demo-step"],
			statusPathsSequence: [{ changedPaths: [] }, { changedPaths: ["src/a.ts", "src/b.ts"] }],
			commitSha: "abc1234",
			...overrides.git,
		},
		childScripts: overrides.childScripts ?? [
			{
				events: [{ type: "activity", line: "child is working" }],
				outcome: completed(childReportText({ commitBody: ["Body line"] })),
			},
		],
		...(overrides.trunkBranch === undefined ? {} : { trunkBranch: overrides.trunkBranch }),
	};
}

describe("runRunnerStep", () => {
	test("happy default-mode step commits and returns the committed checkpoint", async () => {
		const ctx = contextWithRunnerFakes(defaultHappyOptions());

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("committed");
		expect(exit.data.slug).toBe("demo-objective");
		expect(exit.data.mode).toBe("default");
		expect(exit.data.baseBranch).toBe("main");
		expect(exit.data.branch).toBe("feature/demo-step");
		expect(exit.data.commitSha).toBe("abc1234");
		expect(exit.data.changedPaths).toEqual(["src/a.ts", "src/b.ts"]);
		expect(exit.data.gateChecks.some((check) => check.status === "failed")).toBe(false);
		expect(exit.data.checkpointMarkdown).toContain(
			"# Runner Checkpoint: demo-objective (committed)",
		);
		expect(exit.data.checkpointMarkdown).toContain("## Child-reported narrative");

		// Exit-0 states never write stdout from the handler; renderers own it.
		expect(ctx.stdoutChunks).toEqual([]);
		expect(ctx.stderrChunks).toContain("child is working\n");
		expect(ctx.phases).toEqual([
			"checking-preconditions",
			"dispatching-child",
			"awaiting-child",
			"verifying",
			"committing",
		]);
		expect(ctx.git.stagePathsCalls).toEqual([{ cwd: "/repo", paths: ["src/a.ts", "src/b.ts"] }]);
		expect(ctx.git.commitCalls).toHaveLength(1);
		expect(ctx.git.commitCalls[0]?.message).toBe(
			"Implement demo slice\n\nBody line\n\nObjective-Runner-Step: demo-objective",
		);

		const dispatch = ctx.childSession.dispatchCalls[0];
		expect(dispatch?.cwd).toBe("/repo");
		expect(dispatch?.timeoutMs).toBe(3_600_000);
		expect(dispatch?.prompt).toContain("Objective: demo-objective");
		expect(dispatch?.prompt).toContain("Objective record: .sdl/objectives/demo-objective");
	});

	test("happy recover-mode step repairs in place and adds the recover trailer", async () => {
		const ctx = contextWithRunnerFakes({
			storage: OPEN_OBJECTIVE,
			git: {
				currentBranch: "feature/demo-step",
				statusPaths: { changedPaths: ["src/a.ts"] },
				commitSha: "rec1234",
			},
			childScripts: [
				{ outcome: completed(childReportText({ commitSubject: "Repair demo slice" })) },
			],
		});

		const exit = await runRunnerStep(ctx, request({ recover: true }));

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("committed");
		expect(exit.data.mode).toBe("recover");
		expect(exit.data.commitSha).toBe("rec1234");
		expect(ctx.git.commitCalls[0]?.message).toBe(
			[
				"Repair demo slice",
				"",
				"Objective-Runner-Step: demo-objective",
				"Objective-Runner-Mode: recover",
			].join("\n"),
		);
		const prompt = ctx.childSession.dispatchCalls[0]?.prompt ?? "";
		expect(prompt).toContain("Recovery mode: a previous runner step failed");
		expect(prompt).toContain("- src/a.ts");
	});

	test("guidance and model reach the child dispatch", async () => {
		const ctx = contextWithRunnerFakes(defaultHappyOptions());

		await runRunnerStep(
			ctx,
			request({ guidance: "Only touch the parser.", model: "anthropic/claude", timeout: 120 }),
		);

		const dispatch = ctx.childSession.dispatchCalls[0];
		expect(dispatch?.prompt).toContain("Only touch the parser.");
		expect(dispatch?.model).toBe("anthropic/claude");
		expect(dispatch?.timeoutMs).toBe(120_000);
	});

	test("child stop report exits ok with a stop checkpoint and no commit", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [
					{
						outcome: completed(
							childReportText({ status: "stop", stopReason: "roadmap exhausted" }),
						),
					},
				],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("stop");
		expect(exit.data.stopReason).toBe("roadmap exhausted");
		expect(exit.data.commitSha).toBeNull();
		expect(exit.data.checkpointMarkdown).toContain("# Runner Checkpoint: demo-objective (stop)");
		expect(ctx.stdoutChunks).toEqual([]);
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("child blocked report exits negative and writes the checkpoint to stdout", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [
					{
						outcome: completed(
							childReportText({ status: "blocked", stopReason: "missing credentials" }),
						),
					},
				],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toBe("Child reported blocked: missing credentials.");
		expect(ctx.stdoutChunks.join("")).toContain("# Runner Checkpoint: demo-objective (blocked)");
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("gate failure exits negative with a verification-failed checkpoint on stdout", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				// Child never moved off the base branch.
				git: {
					currentBranchSequence: ["main", "main"],
					statusPathsSequence: [{ changedPaths: [] }, { changedPaths: ["src/a.ts"] }],
				},
				childScripts: [{ outcome: completed(childReportText({ branch: "main" })) }],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("Verification failed");
		expect(exit.message).toContain("branch-not-trunk");
		expect(exit.message).toContain("moved-off-base");
		expect(exit.data?.status).toBe("verification-failed");
		expect(exit.data?.gateChecks.some((check) => check.status === "failed")).toBe(true);
		expect(ctx.stdoutChunks.join("")).toContain(
			"# Runner Checkpoint: demo-objective (verification-failed)",
		);
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("a child that committed on its own fails head-unchanged and never commits", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				git: {
					currentBranchSequence: ["main", "feature/demo-step"],
					headCommitSequence: [
						"1111111111111111111111111111111111111111",
						"2222222222222222222222222222222222222222",
					],
					statusPathsSequence: [{ changedPaths: [] }, { changedPaths: ["src/a.ts"] }],
				},
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("verification-failed");
		const headCheck = exit.data?.gateChecks.find((check) => check.id === "head-unchanged");
		expect(headCheck?.status).toBe("failed");
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("malformed report is a malfunction with a diagnostic checkpoint", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [{ outcome: completed("I did things but forgot the report.") }],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("report-integrity");
		expect(ctx.stdoutChunks.join("")).toContain(
			"# Runner Checkpoint: demo-objective (malfunction)",
		);
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("invalid report carries the per-problem diagnostics", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [{ outcome: completed(childReportText({ omitSections: ["Validation"] })) }],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("failure");
		expect(ctx.stdoutChunks.join("")).toContain("Missing required section `## Validation`.");
	});

	test("nonzero child exit is a malfunction", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [
					{
						outcome: completed(childReportText(), {
							exitCode: 3,
							stderrTail: "child stderr tail",
						}),
					},
				],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("child-exit-nonzero");
		expect(ctx.stdoutChunks.join("")).toContain("child stderr tail");
	});

	test("signaled child exit is a malfunction with signal diagnostics", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [
					{
						outcome: {
							type: "signaled",
							signal: "SIGTERM",
							stderrTail: "child stderr tail",
						},
					},
				],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("child-signaled");
		expect(exit.message).toBe("Child session exited after signal SIGTERM.");
		expect(ctx.stdoutChunks.join("")).toContain("child stderr tail");
	});

	test("timed-out child is a malfunction", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [{ outcome: { type: "timed-out", stderrTail: "" } }],
			}),
		);

		const exit = await runRunnerStep(ctx, request({ timeout: 5 }));

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("child-timed-out");
		expect(exit.message).toBe("Child session timed out after 5s.");
		expect(ctx.childSession.dispatchCalls[0]?.timeoutMs).toBe(5_000);
	});

	test("startup-failed child is a malfunction", async () => {
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [{ outcome: { type: "startup-failed", message: "pi not found" } }],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("child-startup-failed");
		expect(exit.message).toContain("pi not found");
	});

	test("default mode refuses a dirty tree before dispatching", async () => {
		const ctx = contextWithRunnerFakes({
			storage: OPEN_OBJECTIVE,
			git: {
				currentBranch: "main",
				statusPaths: { changedPaths: ["src/a.ts"] },
			},
		});

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("Worktree is dirty");
		expect(exit.message).toContain("--recover");
		expect(ctx.childSession.dispatchCalls).toEqual([]);
		expect(ctx.stdoutChunks).toEqual([]);
	});

	test("recover mode refuses a clean tree before dispatching", async () => {
		const ctx = contextWithRunnerFakes({
			storage: OPEN_OBJECTIVE,
			git: {
				currentBranch: "feature/demo-step",
				statusPaths: { changedPaths: [] },
			},
		});

		const exit = await runRunnerStep(ctx, request({ recover: true }));

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("Worktree is clean");
		expect(ctx.childSession.dispatchCalls).toEqual([]);
	});

	test("recover mode refuses to run on trunk", async () => {
		const ctx = contextWithRunnerFakes({
			storage: OPEN_OBJECTIVE,
			git: {
				currentBranch: "main",
				statusPaths: { changedPaths: ["src/a.ts"] },
			},
		});

		const exit = await runRunnerStep(ctx, request({ recover: true }));

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("trunk");
	});

	test("missing, invalid, and unknown slugs are usage errors", async () => {
		const ctx = contextWithRunnerFakes({ storage: OPEN_OBJECTIVE });

		const missing = await runRunnerStep(ctx, {
			...runnerStepRequestSchema.parse({}),
		});
		const invalid = await runRunnerStep(ctx, request({ slug: "bad/slug" }));
		const unknown = await runRunnerStep(ctx, request({ slug: "no-such-objective" }));

		expect(missing.type).toBe("usageError");
		expect(invalid.type).toBe("usageError");
		expect(unknown.type).toBe("usageError");
		expect(ctx.childSession.dispatchCalls).toEqual([]);
	});

	test("a closed objective is refused", async () => {
		const ctx = contextWithRunnerFakes({
			storage: { records: [{ slug: "demo-objective", isClosed: true }] },
			git: { currentBranch: "main" },
		});

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("closed");
	});

	test("usage facts from the child session file land in the committed checkpoint", async () => {
		const sessionDir = await mkdtemp(join(tmpdir(), "objective-runner-step-usage-"));
		const sessionFile = join(sessionDir, "session.jsonl");
		await writeFile(
			sessionFile,
			`${JSON.stringify({
				message: {
					role: "assistant",
					provider: "anthropic",
					api: "messages",
					model: "claude-sonnet",
					usage: {
						input: 100,
						output: 25,
						cacheRead: 10,
						cacheWrite: 5,
						totalTokens: 140,
						cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 },
					},
				},
			})}\n`,
			"utf8",
		);
		const ctx = contextWithRunnerFakes(
			defaultHappyOptions({
				childScripts: [{ outcome: completed(childReportText(), { sessionFile }) }],
			}),
		);

		const exit = await runRunnerStep(ctx, request());

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.usage).not.toBeNull();
		expect(exit.data.usage?.aggregate.tokens.totalTokens).toBe(140);
		expect(exit.data.usage?.sessions[0]?.sessionFile).toBe(sessionFile);
		expect(exit.data.checkpointMarkdown).toContain(
			"  - tokens: 100 input / 25 output / 10 cache read / 5 cache write / 140 total",
		);
		expect(exit.data.checkpointMarkdown).toContain(
			"  - model(s): anthropic/messages/claude-sonnet",
		);
	});

	test("no session file means no usage facts", async () => {
		const ctx = contextWithRunnerFakes(defaultHappyOptions());

		const exit = await runRunnerStep(ctx, request());

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.usage).toBeNull();
		expect(exit.data.checkpointMarkdown).not.toContain("- usage:");
	});
});
