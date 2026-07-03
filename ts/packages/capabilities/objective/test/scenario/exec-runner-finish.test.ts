import { describe, expect, test } from "vitest";

import { envelopeJsonText, toMachineEnvelope, type ClinkrExit } from "@ji/clinkr";
import { InMemoryGraphiteBranchGateway } from "@ji/capability-kit/graphite/testing";
import { optionalEntries } from "@ji/core/primitives";
import type { ExecResult } from "@ji/kernel/sdk";

import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import type { RunnerTextFileReadResult } from "../../src/runner/context.ts";
import { objectiveExecRunnerFinishSdlCommand } from "../../src/ji/commands/exec-runner-finish.ts";
import { SequencedGitGateway, type SequencedGitGatewayState } from "../unit/runner/context.ts";
import { FakeObjectiveSdlApi, runObjectiveCommand } from "../support/ji-command-harness.ts";

const SLUG = "demo-objective";
const REPORT_PATH = "/scratch/step-1-report.json";

function factsData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		slug: SLUG,
		mode: "default",
		baseBranch: "main",
		headAtDispatch: "head1234",
		changedPaths: [],
		objectivePath: `.ns/objectives/${SLUG}`,
		reportPath: REPORT_PATH,
		prompt: "irrelevant to finish",
		...overrides,
	};
}

function factsEnvelopeText(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ status: "ok", exitCode: 0, data: factsData(overrides) });
}

function reportObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		status: "ready-for-parent-commit",
		branch: "feature/demo-step",
		roadmapItems: ["Slice 1 — demo slice"],
		commitSubject: "Implement demo slice",
		sections: {
			summary: "Did the slice.",
			objectiveImpact: "Advances slice 1.",
			risksBlockers: "none",
			followUps: "none",
			validation: "just ts-check passed",
		},
		...overrides,
	};
}

/** Gate-happy git state: on the implementation branch, dirty, HEAD unmoved. */
function gateHappyGitState(overrides: SequencedGitGatewayState = {}): SequencedGitGatewayState {
	return {
		optionalRepoRoot: "/repo",
		trunkBranch: "main",
		currentBranch: "feature/demo-step",
		statusPaths: { changedPaths: ["src/a.ts"] },
		headCommit: "head1234",
		commitSha: "abc1234",
		...overrides,
	};
}

interface ScenarioOptions {
	git?: SequencedGitGatewayState;
	files?: Record<string, string>;
	execResults?: readonly Partial<ExecResult>[];
	outputFormat?: "human" | "json" | "markdown";
}

interface ScenarioApi extends FakeObjectiveSdlApi {
	runnerGit: SequencedGitGateway;
}

function makeApi(options: ScenarioOptions = {}): ScenarioApi {
	const files = options.files ?? { [REPORT_PATH]: JSON.stringify(reportObject()) };
	const runnerGit = new SequencedGitGateway(options.git ?? gateHappyGitState());
	const readTextFile = async (path: string): Promise<RunnerTextFileReadResult> => {
		const content = files[path];
		if (content === undefined) return { type: "error", message: `ENOENT: no such file ${path}` };
		return { type: "ok", content };
	};
	const api = new FakeObjectiveSdlApi({
		git: runnerGit,
		graphite: new InMemoryGraphiteBranchGateway({}),
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway({ records: [{ slug: SLUG }] })),
		readTextFile,
		...(options.execResults === undefined ? {} : { execResults: options.execResults }),
		...optionalEntries({ outputFormat: options.outputFormat }),
	});
	return Object.assign(api, { runnerGit });
}

function assertJsonEnvelopeStdout<T>(api: FakeObjectiveSdlApi, exit: ClinkrExit<T>): unknown {
	const stdout = `${api.stdoutChunks.join("")}${envelopeJsonText(toMachineEnvelope(exit))}`;
	expect(stdout).not.toMatch(/^# Runner Checkpoint:/u);
	return JSON.parse(stdout) as unknown;
}

describe("sdl objective exec runner-finish scenarios", () => {
	test("happy committed path: envelope facts, report from facts' reportPath", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toMatchObject({
			slug: SLUG,
			mode: "default",
			status: "committed",
			baseBranch: "main",
			branch: "feature/demo-step",
			commitSha: "abc1234",
			changedPaths: ["src/a.ts"],
			stopReason: null,
		});
		expect(exit.data.gateChecks.every((check) => check.status !== "failed")).toBe(true);
		expect(exit.data.checkpointMarkdown).toContain(`# Runner Checkpoint: ${SLUG} (committed)`);
		expect(exit.data.checkpointMarkdown).toContain("## Verified facts (runner-attested)");
		expect(exit.data.checkpointMarkdown).toContain(
			"## Child-reported narrative (unverified claims)",
		);
		expect(exit.data.checkpointMarkdown).not.toContain("- usage:");
		expect(api.phases).toEqual(["validating-inputs", "verifying", "committing"]);
		expect(api.execCalls.map((call) => call.args)).toEqual([
			["diff", "--cached", "--quiet", "--exit-code"],
			["diff", "--cached", "--check"],
		]);
		expect(api.runnerGit.stagePathsCalls).toEqual([{ cwd: "/repo", paths: ["src/a.ts"] }]);
		// ok exits leave stdout to the renderers.
		expect(api.stdoutChunks).toEqual([]);
	});

	test("bare facts object works identically to the saved envelope", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: JSON.stringify(factsData()) },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type === "ok") expect(exit.data.status).toBe("committed");
	});

	test("inline --report overrides the facts' report path", async () => {
		const api = makeApi({ files: {} });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{
				slug: SLUG,
				facts: factsEnvelopeText(),
				report: JSON.stringify(reportObject()),
			},
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type === "ok") expect(exit.data.status).toBe("committed");
	});

	test("stop report: ok exit with live changed paths in the checkpoint", async () => {
		const api = makeApi({
			files: {
				[REPORT_PATH]: JSON.stringify(
					reportObject({ status: "stop", stopReason: "scope boundary", commitSubject: undefined }),
				),
			},
		});

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("stop");
		expect(exit.data.stopReason).toBe("scope boundary");
		expect(exit.data.changedPaths).toEqual(["src/a.ts"]);
		expect(exit.data.checkpointMarkdown).toContain("changed paths (1):");
		expect(exit.data.commitSha).toBeNull();
		expect(api.phases).toEqual(["validating-inputs"]);
	});

	test("blocked report: negative with checkpoint on stdout in human mode, suppressed in json", async () => {
		const blockedFiles = {
			[REPORT_PATH]: JSON.stringify(
				reportObject({ status: "blocked", stopReason: "missing dependency" }),
			),
		};
		const humanApi = makeApi({ files: blockedFiles });
		const humanExit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api: humanApi },
		);
		expect(humanExit.type).toBe("negative");
		if (humanExit.type !== "negative") throw new Error("expected negative exit");
		expect(humanExit.message).toContain("missing dependency");
		expect(humanApi.stdoutChunks.join("")).toContain(`# Runner Checkpoint: ${SLUG} (blocked)`);

		const jsonApi = makeApi({ files: blockedFiles, outputFormat: "json" });
		const jsonExit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api: jsonApi },
		);
		assertJsonEnvelopeStdout(jsonApi, jsonExit);
	});

	test("gate failure: still on base branch → negative verification-failed checkpoint", async () => {
		const api = makeApi({ git: gateHappyGitState({ currentBranch: "main" }) });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("Verification failed");
		expect(exit.message).toContain("moved-off-base");
		const stdout = api.stdoutChunks.join("");
		expect(stdout).toContain(`# Runner Checkpoint: ${SLUG} (verification-failed)`);
	});

	test("HEAD moved between begin and finish fails the head-unchanged gate check", async () => {
		const api = makeApi({ git: gateHappyGitState({ headCommit: "other999" }) });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("head-unchanged");
		expect(api.runnerGit.stagePathsCalls).toEqual([]);
	});

	test("pre-existing staged changes fail index-clean and are not committed", async () => {
		const api = makeApi({ execResults: [{ code: 1 }] });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("verification-failed");
		const indexClean = exit.data?.gateChecks.find((check) => check.id === "index-clean");
		expect(indexClean?.status).toBe("failed");
		expect(api.runnerGit.stagePathsCalls).toEqual([]);
		expect(api.runnerGit.commitCalls).toEqual([]);
	});

	test("cached diff failure is a verification failure and is not committed", async () => {
		const api = makeApi({ execResults: [{}, { code: 2, stderr: "trailing whitespace" }] });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("verification-failed");
		const diffCheck = exit.data?.gateChecks.find((check) => check.id === "diff-check");
		expect(diffCheck?.status).toBe("failed");
		expect(diffCheck?.detail).toContain("trailing whitespace");
		expect(api.execCalls.map((call) => call.args)).toEqual([
			["diff", "--cached", "--quiet", "--exit-code"],
			["diff", "--cached", "--check"],
			["reset", "--"],
		]);
		expect(api.runnerGit.stagePathsCalls).toEqual([{ cwd: "/repo", paths: ["src/a.ts"] }]);
		expect(api.runnerGit.commitCalls).toEqual([]);
	});

	test("missing report file is a report-missing malfunction with checkpoint diagnostics", async () => {
		const api = makeApi({ files: {} });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("report-missing");
		const stdout = api.stdoutChunks.join("");
		expect(stdout).toContain(`# Runner Checkpoint: ${SLUG} (malfunction)`);
		expect(stdout).toContain(REPORT_PATH);
	});

	test("invalid report JSON lists every problem as a diagnostic", async () => {
		const api = makeApi({
			files: { [REPORT_PATH]: JSON.stringify({ status: "done", sections: {} }) },
		});

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("report-integrity");
		const stdout = api.stdoutChunks.join("");
		expect(stdout).toContain("`status`");
		expect(stdout).toContain("`branch`");
		expect(stdout).toContain("`sections.summary`");
	});

	test("commit failure is a malfunction after a passing gate", async () => {
		const api = makeApi({
			git: gateHappyGitState({
				commitFailure: { code: "git_commit_failed", message: "index locked" },
			}),
		});

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.message).toContain("Runner commit failed");
		expect(api.phases).toEqual(["validating-inputs", "verifying", "committing"]);
	});

	test("control-plane problems are usage errors: missing slug/facts, bad JSON, slug mismatch, non-ok envelope, report inside repo", async () => {
		const cases: Array<{ request: Record<string, unknown>; expectIn?: string }> = [
			{ request: { facts: factsEnvelopeText() } },
			{ request: { slug: SLUG } },
			{ request: { slug: SLUG, facts: "not json" }, expectIn: "not valid JSON" },
			{
				request: { slug: SLUG, facts: JSON.stringify({ status: "negative", exitCode: 1 }) },
				expectIn: "runner-begin",
			},
			{
				request: { slug: SLUG, facts: factsEnvelopeText({ slug: "other-objective" }) },
				expectIn: "other-objective",
			},
			{
				request: {
					slug: SLUG,
					facts: factsEnvelopeText({ reportPath: "/repo/report.json" }),
				},
				expectIn: "inside the repository worktree",
			},
		];
		for (const { request, expectIn } of cases) {
			const api = makeApi();
			const exit = await runObjectiveCommand(objectiveExecRunnerFinishSdlCommand, request, {
				api,
			});
			expect(exit.type).toBe("usageError");
			if (exit.type === "usageError" && expectIn !== undefined) {
				expect(exit.message).toContain(expectIn);
			}
			expect(api.stdoutChunks).toEqual([]);
		}
	});

	test("unreadable @facts file is a usage error", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: "@/scratch/missing-facts.json" },
			{ api },
		);

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") throw new Error("expected usageError exit");
		expect(exit.message).toContain("/scratch/missing-facts.json");
	});

	test("json mode emits exactly one machine envelope on the happy path", async () => {
		const api = makeApi({ outputFormat: "json" });

		const exit = await runObjectiveCommand(
			objectiveExecRunnerFinishSdlCommand,
			{ slug: SLUG, facts: factsEnvelopeText() },
			{ api },
		);

		const envelope = assertJsonEnvelopeStdout(api, exit) as { status: string };
		expect(envelope.status).toBe("ok");
	});
});
