import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type {
	ExtensionAPI,
	ExtensionHandler,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import {
	createFunctionSubagentRuntime,
	getOrCreateSubagentFleetRegistry,
	type SubagentFleetRegistry,
} from "@internal/ns-pi-subagents/api";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	type JsonObject,
	type RunnerSubagentCompletedResult,
	type RunnerSubagentStoppedWithoutTerminalResult,
} from "@internal/ns-pi-subagents/runner-subagents";
import {
	createFakeRunnerSubagentDispatcher,
	jsonLine,
	type RunnerSubagentDispatcherDependencies,
	type SpawnCall,
} from "@internal/ns-pi-subagents/runner-subagents/testing";
import type { RawPiExecOptions, RawPiExecResult } from "@nseng-ai/pi/shared/command-exec";
import {
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	reviewerOutcomeFromRunnerResult,
	type ThermoCouncilSeatConfig,
} from "../../src/thermo-council/index.ts";
import type {
	RegisteredCommand,
	ThermoCouncilCommandContext,
	ThermoCouncilExtensionAPI,
} from "../../src/thermo-council/host-api.ts";

type SessionStartHandler = ExtensionHandler<SessionStartEvent>;
type SessionShutdownHandler = ExtensionHandler<SessionShutdownEvent>;

class FakePi implements ThermoCouncilExtensionAPI {
	readonly sessionStartHandlers: SessionStartHandler[] = [];
	readonly sessionShutdownHandlers: SessionShutdownHandler[] = [];
	readonly events: ExtensionAPI["events"] = fakeEventBus();
	readonly [RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;

	constructor(runnerDependencies?: RunnerSubagentDispatcherDependencies) {
		if (runnerDependencies !== undefined) {
			this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = runnerDependencies;
		}
	}

	async exec(
		_command: string,
		_args: string[],
		_options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		return { stdout: "", stderr: "", code: 0, killed: false };
	}

	registerCommand(_name: string, _command: RegisteredCommand): void {}

	readonly on = ((event: string, handler: SessionStartHandler | SessionShutdownHandler): void => {
		if (event === "session_start") this.sessionStartHandlers.push(handler as SessionStartHandler);
		if (event === "session_shutdown") {
			this.sessionShutdownHandlers.push(handler as SessionShutdownHandler);
		}
	}) as ExtensionAPI["on"];
}

function fakeEventBus(): ExtensionAPI["events"] {
	return {
		emit() {},
		on() {
			return () => {};
		},
	};
}

function fakeContext(): ThermoCouncilCommandContext {
	return {
		cwd: "/repo",
		ui: {
			setStatus() {},
		},
		async waitForIdle() {},
	};
}

function seat(id: ThermoCouncilSeatConfig["id"], label: string): ThermoCouncilSeatConfig {
	return { id, label, modelSelection: { provider: id, modelId: "model" } };
}

function fleetRegistry(pi: FakePi): SubagentFleetRegistry {
	return getOrCreateSubagentFleetRegistry({
		owner: pi.events,
		onSessionStart: (handler) => pi.on("session_start", handler),
		onSessionShutdown: (handler) => pi.on("session_shutdown", handler),
	});
}

describe("thermo council review recovery", () => {
	test("recovers reviewer payloads from malformed session JSONL without dispatching repair", async () => {
		const sessionDir = await mkdtemp(join(tmpdir(), "thermo-council-session-"));
		const sessionFile = join(sessionDir, "session.jsonl");
		await writeFile(
			sessionFile,
			[
				"{malformed line}\n",
				jsonLine({
					type: "toolCall",
					name: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
					arguments: validReviewPayload(
						"Recovered from session file.",
						"Session recovered finding",
					),
				}),
			].join(""),
			"utf8",
		);
		const pi = new FakePi();
		const registry = fleetRegistry(pi);

		const outcome = await reviewerOutcomeFromRunnerResult(
			seat("openai-high", "Sol"),
			{
				status: "final-text",
				elapsedMs: 1,
				progress: { state: "stopped", toolCount: 0, turnCount: 1, elapsedMs: 1 },
				sessionFile,
				finalText: "unstructured final text",
			},
			{ pi, ctx: fakeContext(), fleetRegistry: registry },
		);

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.review.summary).toBe("Recovered from session file.");
		expect(outcome.review.findings[0]?.title).toBe("Session recovered finding");
		expect(outcome.review.findings[0]?.validationHints).toEqual(["just ts-test"]);
		expect(repairFleetTasks(registry)).toEqual([]);
	});

	test("tracks a successful model repair as one seat-specific fleet task", async () => {
		const { runner, pi, ctx, registry } = repairTestHarness();
		const canonicalSeat = seat("anthropic-fable", "Canonical Fable");
		const running = reviewerOutcomeFromRunnerResult(
			canonicalSeat,
			malformedCompletedReviewerResult(),
			{ pi, ctx, fleetRegistry: registry },
		);
		await waitForSpawnCount(runner.calls, 1);
		runner.calls[0]?.process.emitStdout(jsonLine({ type: "agent_start" }));
		runner.calls[0]?.process.emitStdout(jsonLine({ type: "turn_start" }));
		runner.calls[0]?.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Repairing malformed payload." }],
				},
			}),
		);
		expect(repairFleetTasks(registry)).toMatchObject([
			{
				title: `Thermo council payload repair: ${canonicalSeat.label} (attempt 1)`,
				state: "running",
				latestActivity: "Repairing malformed payload.",
			},
		]);
		runner.calls[0]?.process.emitStdout(
			finalAssistantTextEvent(`Here is the repaired payload:\n${repairedReviewJson()}`),
		);
		runner.calls[0]?.process.close(0);

		const outcome = await running;

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.seat).toBe(canonicalSeat);
		expect(outcome.review.findings[0]?.title).toBe("Recovered payload finding");
		expect(outcome.review.findings[0]?.validationHints).toEqual(["just ts-test"]);
		expect(repairFleetTasks(registry)).toMatchObject([
			{
				title: `Thermo council payload repair: ${canonicalSeat.label} (attempt 1)`,
				state: "done",
				finalStatus: "final-text",
				sessionFile: "/tmp/thermo-repair-1.jsonl",
			},
		]);
	});

	test("tracks each bounded repair attempt with an independent fleet lifecycle", async () => {
		const { runner, pi, ctx, registry } = repairTestHarness();
		const sol = seat("openai-high", "Sol");
		const running = reviewerOutcomeFromRunnerResult(sol, malformedCompletedReviewerResult(), {
			pi,
			ctx,
			fleetRegistry: registry,
		});
		await waitForSpawnCount(runner.calls, 1);
		runner.calls[0]?.process.emitStdout(finalAssistantTextEvent("not json"));
		runner.calls[0]?.process.close(0);
		await waitForSpawnCount(runner.calls, 2);

		expect(repairFleetTasks(registry)).toMatchObject([
			{
				title: "Thermo council payload repair: Sol (attempt 1)",
				state: "done",
				finalStatus: "final-text",
				sessionFile: "/tmp/thermo-repair-1.jsonl",
			},
			{
				title: "Thermo council payload repair: Sol (attempt 2)",
				state: "running",
			},
		]);
		runner.calls[1]?.process.emitStdout(finalAssistantTextEvent(repairedReviewJson()));
		runner.calls[1]?.process.close(0);

		const outcome = await running;

		expect(runner.calls).toHaveLength(2);
		expect(runner.calls[1]?.args.join("\n")).toContain("Your previous repair draft was invalid");
		expect(runner.calls[1]?.args.join("\n")).toContain("response contains no JSON object");
		expect(outcome.type).toBe("completed");
		expect(repairFleetTasks(registry)).toMatchObject([
			{ state: "done", finalStatus: "final-text", sessionFile: "/tmp/thermo-repair-1.jsonl" },
			{ state: "done", finalStatus: "final-text", sessionFile: "/tmp/thermo-repair-2.jsonl" },
		]);
	});

	test("disposes fleet tracking when repair dispatch throws", async () => {
		const pi = new FakePi();
		const registry = fleetRegistry(pi);
		const runtime = createFunctionSubagentRuntime(async () => {
			throw new Error("repair dispatch exploded");
		});
		const fable = seat("anthropic-fable", "Fable");

		await expect(
			reviewerOutcomeFromRunnerResult(fable, malformedCompletedReviewerResult(), {
				pi,
				ctx: fakeContext(),
				fleetRegistry: registry,
				runtime,
			}),
		).rejects.toThrow("repair dispatch exploded");
		expect(repairFleetTasks(registry)).toMatchObject([
			{
				title: "Thermo council payload repair: Fable (attempt 1)",
				state: "done",
				finalStatus: "error",
			},
		]);
	});

	test("keeps runner success statuses when both bounded repair drafts are schema-invalid", async () => {
		const { runner, pi, ctx, registry } = repairTestHarness();
		const gemini = seat("gemini-high", "Gemini");
		const running = reviewerOutcomeFromRunnerResult(gemini, malformedCompletedReviewerResult(), {
			pi,
			ctx,
			fleetRegistry: registry,
		});
		await waitForSpawnCount(runner.calls, 1);
		runner.calls[0]?.process.emitStdout(finalAssistantTextEvent("not json"));
		runner.calls[0]?.process.close(0);
		await waitForSpawnCount(runner.calls, 2);
		runner.calls[1]?.process.emitStdout(finalAssistantTextEvent("still not json"));
		runner.calls[1]?.process.close(0);

		const outcome = await running;

		expect(runner.calls).toHaveLength(2);
		expect(outcome.type).toBe("failed");
		if (outcome.type !== "failed") return;
		expect(outcome.diagnostic).toContain("findings");
		expect(repairFleetTasks(registry)).toMatchObject([
			{
				title: "Thermo council payload repair: Gemini (attempt 1)",
				state: "done",
				finalStatus: "final-text",
				sessionFile: "/tmp/thermo-repair-1.jsonl",
			},
			{
				title: "Thermo council payload repair: Gemini (attempt 2)",
				state: "done",
				finalStatus: "final-text",
				sessionFile: "/tmp/thermo-repair-2.jsonl",
			},
		]);
	});

	test("includes runner context when a reviewer stops without terminal capture", async () => {
		const result = {
			status: "stopped-without-terminal",
			elapsedMs: 4_000,
			progress: {
				state: "stopped",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 4_000,
				launch: {
					model: { provider: "google", id: "gemini-2.5-pro" },
					thinkingLevel: "off",
					observedThinkingLevel: "high",
					hasModelArg: true,
					hasThinkingArg: false,
				},
			},
			diagnostic: "Forked Pi process stopped without terminal capture.",
			stopReason: "stop",
		} satisfies RunnerSubagentStoppedWithoutTerminalResult;

		const outcome = await reviewerOutcomeFromRunnerResult(seat("gemini-high", "Gemini"), result);

		expect(outcome.type).toBe("failed");
		if (outcome.type !== "failed") return;
		expect(outcome.diagnostic).toBe(
			"Forked Pi process stopped without terminal capture (status: stopped-without-terminal; stopReason: stop; turns: 1; tools: 1; model: google/gemini-2.5-pro; thinking: high).",
		);
	});
});

function validReviewPayload(summary: string, title: string): object {
	return {
		summary,
		findings: [
			{
				id: "session-1",
				title,
				files: ["src/file.ts"],
				evidence: "The valid tool call survived a malformed preceding line.",
				problem: "Reviewer ended before terminal capture surfaced.",
				proposedFix: "Recover the newest valid tool-call payload from the session file.",
				behaviorRisk: "Low risk when recovery stays parser-backed and lenient.",
				dependencyNotes: "None",
				confidence: "likely",
				severity: "medium",
				validationHints: ["just ts-test"],
			},
		],
		disagreements: [],
	};
}

function malformedCompletedReviewerResult(): RunnerSubagentCompletedResult<JsonObject> {
	return {
		status: "completed",
		elapsedMs: 1,
		progress: { state: "stopped", toolCount: 1, turnCount: 1, elapsedMs: 1 },
		sessionFile: "/tmp/malformed-reviewer.jsonl",
		terminal: {
			toolName: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
			status: "completed",
			input: { findings: [{ title: "missing required fields" }] },
		},
	};
}

function repairTestHarness(): {
	runner: ReturnType<typeof createFakeRunnerSubagentDispatcher>;
	pi: FakePi;
	ctx: ThermoCouncilCommandContext;
	registry: SubagentFleetRegistry;
} {
	const runner = createFakeRunnerSubagentDispatcher();
	let sessionNumber = 0;
	const dependencies = {
		...runner.dependencies,
		createSessionFile: () => `/tmp/thermo-repair-${(sessionNumber += 1)}.jsonl`,
	};
	const pi = new FakePi(dependencies);
	return { runner, pi, ctx: fakeContext(), registry: fleetRegistry(pi) };
}

function repairFleetTasks(registry: SubagentFleetRegistry) {
	return registry
		.snapshot()
		.flatMap((run) => run.tasks)
		.filter((task) => task.title.startsWith("Thermo council payload repair:"));
}

function repairedReviewJson(): string {
	return JSON.stringify({
		summary: "Recovered review.",
		findings: [
			{
				id: "recovered-1",
				title: "Recovered payload finding",
				files: ["src/file.ts"],
				evidence: "The malformed payload contained this finding title.",
				problem: "The reviewer payload needed schema repair.",
				proposedFix: "Normalize the malformed payload through repair validation.",
				behaviorRisk: "Low risk when schema validation accepts the repaired payload.",
				dependencyNotes: "None",
				confidence: "likely",
				severity: "medium",
				validationHints: "just ts-test",
			},
		],
		disagreements: [],
	});
}

function finalAssistantTextEvent(text: string): string {
	return jsonLine({
		type: "agent_end",
		messages: [
			{
				role: "assistant",
				stopReason: "stop",
				content: [{ type: "text", text }],
			},
		],
	});
}

async function waitForSpawnCount(calls: readonly SpawnCall[], count: number): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (calls.length >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error(`Expected ${count} child processes to be spawned.`);
}
