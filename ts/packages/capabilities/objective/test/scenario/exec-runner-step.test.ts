// ADR0024-LEGACY-DELETE(whole file): tests for the legacy blocking runner-step machinery.
import { describe, expect, test } from "vitest";

import { envelopeJsonText, toMachineEnvelope, type ClinkrExit } from "@sdl/clinkr";
import { InMemoryGraphiteBranchGateway } from "@sdl/capability-kit/graphite/testing";
import { optionalEntries } from "@sdl/core/primitives";

import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import type { ChildSessionOutcome } from "../../src/runner/child-session.ts";
import type { RunnerTextFileReadResult } from "../../src/runner/context.ts";
import { FakeChildSessionGateway, type FakeChildSessionScript } from "../../src/runner/testing.ts";
import { createObjectiveExecRunnerStepSdlCommand } from "../../src/sdl/commands/exec-runner-step.ts";
import type { ChildSessionGatewayInit } from "../../src/sdl/runner-context.ts";
import {
	childReportText,
	SequencedGitGateway,
	type SequencedGitGatewayState,
} from "../unit/runner/context.ts";
import { FakeObjectiveSdlApi, runObjectiveCommand } from "../support/sdl-command-harness.ts";

const SLUG = "demo-objective";

function openObjectiveStorage(): ObjectiveStorage {
	return new ObjectiveStorage(new FakeObjectiveStorageGateway({ records: [{ slug: SLUG }] }));
}

function completed(finalText: string): ChildSessionOutcome {
	return { type: "completed", exitCode: 0, finalText, stderrTail: "" };
}

/** Clean tree at preconditions, dirty at the gate; child moves off `main`. */
function happyGitState(overrides: SequencedGitGatewayState = {}): SequencedGitGatewayState {
	return {
		optionalRepoRoot: "/repo",
		trunkBranch: "main",
		currentBranchSequence: ["main", "feature/demo-step"],
		statusPathsSequence: [{ changedPaths: [] }, { changedPaths: ["src/a.ts"] }],
		commitSha: "abc1234",
		...overrides,
	};
}

const happyChildScript: FakeChildSessionScript = {
	events: [{ type: "activity", line: "child is working" }],
	outcome: completed(childReportText()),
};

interface ScenarioOptions {
	git?: SequencedGitGatewayState;
	childScripts?: readonly FakeChildSessionScript[];
	readTextFile?: (path: string) => Promise<RunnerTextFileReadResult>;
	outputFormat?: "human" | "json" | "markdown";
}

interface Scenario {
	api: FakeObjectiveSdlApi;
	command: ReturnType<typeof createObjectiveExecRunnerStepSdlCommand>;
	childSession: FakeChildSessionGateway;
}

function assertJsonEnvelopeStdout<T>(api: FakeObjectiveSdlApi, exit: ClinkrExit<T>): unknown {
	const stdout = `${api.stdoutChunks.join("")}${envelopeJsonText(toMachineEnvelope(exit))}`;
	expect(stdout).not.toMatch(/^# Runner Checkpoint:/u);
	return JSON.parse(stdout) as unknown;
}

function makeScenario(options: ScenarioOptions = {}): Scenario {
	const childSession = new FakeChildSessionGateway(options.childScripts ?? []);
	const api = new FakeObjectiveSdlApi({
		git: new SequencedGitGateway(options.git ?? happyGitState()),
		graphite: new InMemoryGraphiteBranchGateway({}),
		storage: openObjectiveStorage(),
		childSession,
		...optionalEntries({
			readTextFile: options.readTextFile,
			outputFormat: options.outputFormat,
		}),
	});
	const command = createObjectiveExecRunnerStepSdlCommand({
		createChildSessionGateway: () => {
			throw new Error("childSession override provided; the composition seam must not be used.");
		},
	});
	return { api, command, childSession };
}

describe("sdl objective exec runner-step scenarios", () => {
	test("missing slug is a usage error with nothing dispatched", async () => {
		const { api, command, childSession } = makeScenario();

		const exit = await runObjectiveCommand(command, {}, { api });

		expect(exit.type).toBe("usageError");
		expect(childSession.dispatchCalls).toEqual([]);
		expect(api.stdoutChunks).toEqual([]);
	});

	test("invalid slug is a usage error with nothing dispatched", async () => {
		const { api, command, childSession } = makeScenario();

		const exit = await runObjectiveCommand(command, { slug: "bad/slug" }, { api });

		expect(exit.type).toBe("usageError");
		expect(childSession.dispatchCalls).toEqual([]);
	});

	test("unreadable @file guidance is a usage error before anything is dispatched", async () => {
		const readPaths: string[] = [];
		const { api, command, childSession } = makeScenario({
			readTextFile: async (path) => {
				readPaths.push(path);
				return { type: "error", message: `ENOENT: no such file ${path}` };
			},
		});

		const exit = await runObjectiveCommand(
			command,
			{ slug: SLUG, guidance: "@missing/notes.md" },
			{ api },
		);

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") throw new Error("expected usageError exit");
		expect(exit.message).toContain("/repo/missing/notes.md");
		expect(readPaths).toEqual(["/repo/missing/notes.md"]);
		expect(childSession.dispatchCalls).toEqual([]);
		expect(api.stdoutChunks).toEqual([]);
	});

	test("inline guidance reaches the child prompt verbatim", async () => {
		const { api, command, childSession } = makeScenario({ childScripts: [happyChildScript] });

		const exit = await runObjectiveCommand(
			command,
			{ slug: SLUG, guidance: "Only touch the parser." },
			{ api },
		);

		expect(exit.type).toBe("ok");
		expect(childSession.dispatchCalls[0]?.prompt).toContain("Only touch the parser.");
	});

	test("@file guidance resolves against cwd and its contents reach the child prompt", async () => {
		const { api, command, childSession } = makeScenario({
			childScripts: [happyChildScript],
			readTextFile: async (path) =>
				path === "/repo/notes/guidance.md"
					? { type: "ok", content: "Guidance loaded from a file." }
					: { type: "error", message: `unexpected read: ${path}` },
		});

		const exit = await runObjectiveCommand(
			command,
			{ slug: SLUG, guidance: "@notes/guidance.md" },
			{ api },
		);

		expect(exit.type).toBe("ok");
		const prompt = childSession.dispatchCalls[0]?.prompt ?? "";
		expect(prompt).toContain("Guidance loaded from a file.");
		expect(prompt).not.toContain("@notes/guidance.md");
	});

	test("--recover refuses the clean tree a default step requires", async () => {
		const { api, command, childSession } = makeScenario({
			git: {
				optionalRepoRoot: "/repo",
				trunkBranch: "main",
				currentBranch: "feature/demo-step",
				statusPaths: { changedPaths: [] },
			},
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG, recover: true }, { api });

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("Worktree is clean");
		expect(childSession.dispatchCalls).toEqual([]);
	});

	test("default mode refuses the dirty tree that --recover proceeds on", async () => {
		const dirtyGit: SequencedGitGatewayState = {
			optionalRepoRoot: "/repo",
			trunkBranch: "main",
			currentBranch: "feature/demo-step",
			statusPaths: { changedPaths: ["src/a.ts"] },
			commitSha: "rec1234",
		};
		const refused = makeScenario({ git: dirtyGit });
		const recovered = makeScenario({
			git: dirtyGit,
			childScripts: [
				{ outcome: completed(childReportText({ commitSubject: "Repair demo slice" })) },
			],
		});

		const refusedExit = await runObjectiveCommand(
			refused.command,
			{ slug: SLUG },
			{
				api: refused.api,
			},
		);
		const recoveredExit = await runObjectiveCommand(
			recovered.command,
			{ slug: SLUG, recover: true },
			{ api: recovered.api },
		);

		expect(refusedExit.type).toBe("negative");
		if (refusedExit.type !== "negative") throw new Error("expected negative exit");
		expect(refusedExit.message).toContain("Worktree is dirty");
		expect(refused.childSession.dispatchCalls).toEqual([]);

		expect(recoveredExit.type).toBe("ok");
		if (recoveredExit.type !== "ok") throw new Error("expected ok exit");
		expect(recoveredExit.data.status).toBe("committed");
		expect(recoveredExit.data.mode).toBe("recover");
		expect(recoveredExit.data.commitSha).toBe("rec1234");
	});

	test("committed path leaves stdout to the renderers and streams progress to stderr", async () => {
		const { api, command } = makeScenario({ childScripts: [happyChildScript] });

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("committed");
		expect(exit.data.checkpointMarkdown).toContain(
			"# Runner Checkpoint: demo-objective (committed)",
		);

		// The handler never writes stdout on exit-0 states; renderers own it.
		expect(api.stdoutChunks).toEqual([]);
		expect(command.renderHuman?.(exit.data, api.renderCapabilities)).toBe(
			exit.data.checkpointMarkdown,
		);
		expect(command.renderMarkdown?.(exit.data, api.renderCapabilities)).toBe(
			exit.data.checkpointMarkdown,
		);

		expect(api.stderrChunks).toContain("child is working\n");
		expect(api.phases).toEqual([
			"checking-preconditions",
			"dispatching-child",
			"awaiting-child",
			"verifying",
			"committing",
		]);
		expect(api.execCalls.map((call) => [call.command, ...call.args])).toEqual([
			["git", "diff", "--cached", "--quiet", "--exit-code"],
			["git", "diff", "--cached", "--check"],
		]);
	});

	test("blocked path writes exactly the checkpoint markdown to stdout", async () => {
		const { api, command } = makeScenario({
			childScripts: [
				{
					outcome: completed(
						childReportText({ status: "blocked", stopReason: "missing credentials" }),
					),
				},
			],
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("blocked");
		expect(api.stdoutChunks.join("")).toBe(exit.data?.checkpointMarkdown);
		expect(api.stdoutChunks.join("")).toContain("# Runner Checkpoint: demo-objective (blocked)");
	});

	test("verification-failed path writes exactly the checkpoint markdown to stdout", async () => {
		const { api, command } = makeScenario({
			// Child never moved off the base branch.
			git: happyGitState({ currentBranchSequence: ["main", "main"] }),
			childScripts: [{ outcome: completed(childReportText({ branch: "main" })) }],
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("verification-failed");
		expect(api.stdoutChunks.join("")).toBe(exit.data?.checkpointMarkdown);
		expect(api.stdoutChunks.join("")).toContain(
			"# Runner Checkpoint: demo-objective (verification-failed)",
		);
	});

	test("blocked JSON mode emits one machine envelope with checkpoint data", async () => {
		const { api, command } = makeScenario({
			outputFormat: "json",
			childScripts: [
				{
					outcome: completed(
						childReportText({ status: "blocked", stopReason: "missing credentials" }),
					),
				},
			],
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });
		const envelope = assertJsonEnvelopeStdout(api, exit);

		expect(exit.type).toBe("negative");
		expect(envelope).toMatchObject({
			status: "negative",
			exitCode: 1,
			data: {
				status: "blocked",
				checkpointMarkdown: expect.stringContaining(
					"# Runner Checkpoint: demo-objective (blocked)",
				),
			},
		});
	});

	test("verification-failed JSON mode emits one machine envelope with checkpoint data", async () => {
		const { api, command } = makeScenario({
			outputFormat: "json",
			git: happyGitState({ currentBranchSequence: ["main", "main"] }),
			childScripts: [{ outcome: completed(childReportText({ branch: "main" })) }],
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });
		const envelope = assertJsonEnvelopeStdout(api, exit);

		expect(exit.type).toBe("negative");
		expect(envelope).toMatchObject({
			status: "negative",
			exitCode: 1,
			data: {
				status: "verification-failed",
				checkpointMarkdown: expect.stringContaining(
					"# Runner Checkpoint: demo-objective (verification-failed)",
				),
			},
		});
	});

	test("malfunction JSON mode emits one machine envelope with checkpoint data", async () => {
		const { api, command } = makeScenario({
			outputFormat: "json",
			childScripts: [{ outcome: completed("I did things but forgot the report.") }],
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });
		const envelope = assertJsonEnvelopeStdout(api, exit);

		expect(exit.type).toBe("failure");
		expect(envelope).toMatchObject({
			status: "failure",
			exitCode: 2,
			data: {
				status: "malfunction",
				checkpointMarkdown: expect.stringContaining(
					"# Runner Checkpoint: demo-objective (malfunction)",
				),
			},
		});
	});

	test("--timeout propagates to the child dispatch in milliseconds", async () => {
		const { api, command, childSession } = makeScenario({ childScripts: [happyChildScript] });

		const exit = await runObjectiveCommand(command, { slug: SLUG, timeout: 120 }, { api });

		expect(exit.type).toBe("ok");
		expect(childSession.dispatchCalls[0]?.timeoutMs).toBe(120_000);
	});

	test("without a childSession override the composition builds the gateway from the host env", async () => {
		const childSession = new FakeChildSessionGateway([happyChildScript]);
		const inits: ChildSessionGatewayInit[] = [];
		const command = createObjectiveExecRunnerStepSdlCommand({
			createChildSessionGateway: (init) => {
				inits.push(init);
				return childSession;
			},
		});
		const api = new FakeObjectiveSdlApi({
			git: new SequencedGitGateway(happyGitState()),
			graphite: new InMemoryGraphiteBranchGateway({}),
			storage: openObjectiveStorage(),
			env: { JI_RUNNER_PI_BIN: "/fake/pi" },
		});

		const exit = await runObjectiveCommand(command, { slug: SLUG }, { api });

		expect(exit.type).toBe("ok");
		expect(inits).toHaveLength(1);
		expect(inits[0]?.env.JI_RUNNER_PI_BIN).toBe("/fake/pi");
		expect(childSession.dispatchCalls).toHaveLength(1);
	});
});
