import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { RunnerSubagentDispatcherDependencies } from "@sdl-local/pi-tools/runner-subagents/process";
import type { RuntimeResultV1 } from "@sdl-local/pi-tools/runner-subagents/runtime";
import { createRuntimeConfig } from "@sdl-local/pi-tools/runner-subagents/runtime";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	type JsonObject,
	type RunnerSubagentCompletedResult,
	type RunnerSubagentStoppedWithoutTerminalResult,
} from "@sdl-local/pi-tools/runner-subagents";
import thermoCouncilExtension, {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
	buildReviewerPrompt,
	clusterFindings,
	parseThermoCouncilMaxConcurrency,
	parseThermoCouncilSeats,
	renderThermoCouncilReport,
	type ThermoCouncilReviewerOutcome,
	type ThermoCouncilScope,
	type ThermoCouncilSeatConfig,
} from "../../src/thermo-council/extension.ts";
import { reviewerOutcomeFromRunnerResult } from "../../src/thermo-council/orchestrator.ts";
import {
	FakeSpawnedChildProcess,
	createFakeRunnerSubagentDispatcher,
	jsonLine,
	type SpawnCall,
} from "@sdl-local/pi-tools/runner-subagents/testing";

interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: FakeCommandContext): Promise<void> | void;
}

interface ExecCall {
	readonly command: string;
	readonly args: readonly string[];
}

interface FakeExecResult {
	readonly stdout: string;
	readonly stderr?: string;
	readonly code?: number;
}

type FakeExecHandler = (command: string, args: readonly string[]) => FakeExecResult | undefined;

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: Array<{ customType: string; content: string; display: boolean }> = [];
	readonly execCalls: ExecCall[] = [];
	readonly runnerCalls: SpawnCall[] = [];
	readonly [RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	private readonly execResults: Map<string, FakeExecResult>;
	private readonly execHandler: FakeExecHandler | undefined;
	private readonly finalSynthesisText: string;

	constructor(
		options: {
			execResults?: Map<string, FakeExecResult>;
			execHandler?: FakeExecHandler;
			runnerResult?: RuntimeResultV1;
			runnerDependencies?: RunnerSubagentDispatcherDependencies;
			finalSynthesisText?: string;
		} = {},
	) {
		this.execResults = options.execResults ?? new Map();
		this.execHandler = options.execHandler;
		this.finalSynthesisText = options.finalSynthesisText ?? defaultFinalSynthesisText();
		if (options.runnerDependencies !== undefined) {
			this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = options.runnerDependencies;
		} else if (options.runnerResult !== undefined) {
			this[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES] = this.runnerDependencies(options.runnerResult);
		}
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	sendMessage(message: { customType: string; content: string; display: boolean }): void {
		this.messages.push(message);
	}

	async exec(
		command: string,
		args: readonly string[],
	): Promise<{ stdout: string; stderr: string; code: number }> {
		this.execCalls.push({ command, args: [...args] });
		const key = `${command} ${args.join(" ")}`;
		const result = this.execHandler?.(command, args) ?? this.execResults.get(key);
		if (result === undefined) return { stdout: "", stderr: `missing fake exec: ${key}`, code: 1 };
		return { stdout: result.stdout, stderr: result.stderr ?? "", code: result.code ?? 0 };
	}

	private runnerDependencies(runnerResult: RuntimeResultV1): RunnerSubagentDispatcherDependencies {
		let index = 0;
		return {
			createSessionFile: () => `/tmp/thermo-seat-${(index += 1)}.jsonl`,
			createRuntimeFiles: (input) => {
				createRuntimeConfig(input);
				return {
					runtimeDir: `/tmp/thermo-runtime-${index}`,
					configPath: `/tmp/thermo-runtime-${index}/config.json`,
					resultPath: `/tmp/thermo-runtime-${index}/result.json`,
					extensionPath: `/tmp/thermo-runtime-${index}/runtime-extension.ts`,
				};
			},
			readRuntimeResult: () => ({ type: "loaded", result: runnerResult }),
			readSessionFile: () => "",
			processArgv: ["/usr/bin/node"],
			processExecPath: "/usr/bin/node",
			existsSync: () => false,
			spawn: (command, args, options) => {
				const process = new FakeSpawnedChildProcess();
				this.runnerCalls.push({ command, args: [...args], options, process });
				queueMicrotask(() => {
					process.emitStdout(finalAssistantTextEvent(this.finalSynthesisText));
					process.close(0);
				});
				return process;
			},
		};
	}
}

interface FakeCommandContext {
	readonly cwd: string;
	readonly ui: {
		readonly statuses: string[];
		setStatus(key: string, value: string | undefined): void;
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void>;
}

function fakeContext(): FakeCommandContext {
	const statuses: string[] = [];
	return {
		cwd: "/repo",
		ui: {
			statuses,
			setStatus(_key, value) {
				statuses.push(value ?? "<cleared>");
			},
			notify() {},
		},
		async waitForIdle() {},
	};
}

function baseScope(overrides: Partial<ThermoCouncilScope> = {}): ThermoCouncilScope {
	return {
		cwd: "/repo",
		baseRef: "origin/master",
		baseSha: "base-sha",
		headRef: "HEAD",
		headSha: "head-sha",
		diffStat: " src/file.ts | 2 ++",
		changedFiles: ["src/file.ts"],
		diffText: "diff --git a/src/file.ts b/src/file.ts",
		isDiffTruncated: false,
		rubricText: "Review strictly.",
		...overrides,
	};
}

function seat(id: ThermoCouncilSeatConfig["id"], label: string): ThermoCouncilSeatConfig {
	return { id, label, model: `${id}-model` };
}

type CompletedOutcome = Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>;

function completedOutcome(
	seatConfig: ThermoCouncilSeatConfig,
	title: string,
	overrides: Partial<CompletedOutcome> = {},
): CompletedOutcome {
	return {
		type: "completed",
		seat: seatConfig,
		sessionFile: `/tmp/${seatConfig.id}.jsonl`,
		review: {
			summary: `${seatConfig.label} summary`,
			findings: [
				{
					id: "1",
					title,
					files: ["src/file.ts"],
					evidence: `${seatConfig.label} evidence`,
					problem: "Duplicated branching makes orchestration harder to scan",
					proposedFix: "Extract a single orchestration model",
					behaviorRisk: "Low behavior risk if covered by unit tests",
					dependencyNotes: "None",
					confidence: "likely",
					severity: "high",
					validationHints: [
						"pnpm --dir ts vitest run packages/local/pi-tools/test/thermo-council/thermo-council.test.ts",
					],
				},
			],
			disagreements: [],
		},
		...overrides,
	};
}

describe("thermo council extension", () => {
	test("registers the top-level command", () => {
		const pi = new FakePi();
		thermoCouncilExtension(pi);

		expect([...pi.commands.keys()]).toEqual([THERMO_COUNCIL_COMMAND_NAME]);
		expect(pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.description).toContain("thermonuclear");
		expect(pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.description).toContain(
			"inferred checkout scope",
		);
		expect(pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.argumentHint).toContain("review guidance");
	});

	test("parses default, positional, and seat-specific model overrides", () => {
		const seats = parseThermoCouncilSeats({
			get(name) {
				return {
					THERMO_COUNCIL_MODELS: "anthropic/custom-opus,openai/custom-high,google/custom-gemini",
					THERMO_COUNCIL_OPENAI_MODEL: "openai/seat-specific",
				}[name];
			},
		});

		expect(seats).toEqual([
			expect.objectContaining({ id: "anthropic-opus", model: "anthropic/custom-opus" }),
			expect.objectContaining({ id: "openai-high", model: "openai/seat-specific" }),
			expect.objectContaining({ id: "gemini-high", model: "google/custom-gemini" }),
		]);
	});

	test("rejects empty positional model override entries", () => {
		expect(() =>
			parseThermoCouncilSeats({
				get: (name) =>
					name === "THERMO_COUNCIL_MODELS" ? "anthropic/custom,,google/custom" : undefined,
			}),
		).toThrow("entry 2 is empty");
	});

	test("rejects excess positional model override entries", () => {
		expect(() =>
			parseThermoCouncilSeats({
				get: (name) =>
					name === "THERMO_COUNCIL_MODELS"
						? "anthropic/custom,openai/custom,google/custom,extra/model"
						: undefined,
			}),
		).toThrow("THERMO_COUNCIL_MODELS has 4 entries but only 3 council seats are configured");
	});

	test("parses positive thermo council concurrency overrides and softly falls back", () => {
		expect(parseThermoCouncilMaxConcurrency({ get: () => undefined })).toBe(3);
		expect(
			parseThermoCouncilMaxConcurrency({
				get: (name) => (name === "THERMO_COUNCIL_MAX_CONCURRENCY" ? " 1 " : undefined),
			}),
		).toBe(1);
		for (const value of ["", " ", "0", "-1", "1.5", "three"]) {
			expect(
				parseThermoCouncilMaxConcurrency({
					get: (name) => (name === "THERMO_COUNCIL_MAX_CONCURRENCY" ? value : undefined),
				}),
			).toBe(3);
		}
	});

	test("stops dirty preflight before reviewer launch", async () => {
		const pi = new FakePi({
			execResults: new Map([["git status --short", { stdout: " M src/file.ts\n" }]]),
		});
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("", fakeContext());

		expect(pi.runnerCalls).toEqual([]);
		expect(pi.messages[0]?.content).toContain("Dirty worktree");
		expect(pi.messages[0]?.content).toContain("No branches were created");
	});

	test("formats git failures through the shared exec failure helper", async () => {
		const pi = new FakePi({
			execResults: new Map([["git status --short", { stdout: "" }]]),
		});
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.runnerCalls).toEqual([]);
		expect(pi.messages[0]?.content).toContain("git command failed (exit code 1)");
		expect(pi.messages[0]?.content).toContain("Command: git rev-parse --show-toplevel");
		expect(pi.messages[0]?.content).toContain("----- stderr tail -----");
		expect(pi.messages[0]?.content).toContain("missing fake exec");
	});

	test("omits internal allowed-git-failure text from base inference failures", async () => {
		const pi = new FakePi({
			execResults: new Map([
				["git status --short", { stdout: "" }],
				["git rev-parse --show-toplevel", { stdout: "/repo\n" }],
				["git rev-parse HEAD", { stdout: "head-sha\n" }],
			]),
		});
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("", fakeContext());

		expect(pi.runnerCalls).toEqual([]);
		expect(pi.messages[0]?.content).toContain("Could not infer a review base");
		expect(pi.messages[0]?.content).toContain("does not accept an explicit base-ref argument");
		expect(pi.messages[0]?.content).not.toContain(`allowed git ${"failure"}`);
	});

	test("uses inferred base when invoked without arguments", async () => {
		const runnerResult = completedRunnerResult();
		const pi = new FakePi({
			execResults: successfulInferredScopeExecResults(),
			runnerResult,
		});
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("", fakeContext());

		expect(pi.execCalls.map((call) => call.command)).not.toContain("pi");
		expect(pi.execCalls).toContainEqual({
			command: "git",
			args: ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
		});
		expect(pi.runnerCalls).toHaveLength(4);
		expect(pi.messages[0]?.content).toContain("## Executive Recommendation");
	});

	test("treats literal stack text as guidance while inferring scope", async () => {
		const runnerResult = completedRunnerResult();
		const pi = new FakePi({
			execResults: successfulInferredScopeExecResults(),
			runnerResult,
		});
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("stack", fakeContext());

		expect(pi.execCalls.map((call) => call.command)).not.toContain("pi");
		expect(pi.execCalls).toContainEqual({
			command: "git",
			args: ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
		});
		expect(pi.runnerCalls).toHaveLength(4);
		expect(pi.runnerCalls[0]?.args.join("\n")).toContain("## User Review Guidance (untrusted)");
		expect(pi.runnerCalls[0]?.args.join("\n")).toContain("stack");
		expect(pi.messages[0]?.content).toContain("## Executive Recommendation");
	});

	test("accepts natural-language guidance and still infers scope mechanically", async () => {
		const runnerResult = completedRunnerResult();
		const pi = new FakePi({
			execResults: successfulInferredScopeExecResults(),
			runnerResult,
		});
		thermoCouncilExtension(pi);

		await pi.commands
			.get(THERMO_COUNCIL_COMMAND_NAME)
			?.handler("review against origin/master with extra suspicion", fakeContext());

		expect(pi.execCalls).toContainEqual({
			command: "git",
			args: ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
		});
		expect(pi.runnerCalls).toHaveLength(4);
		for (const call of pi.runnerCalls) {
			expect(call.args.join("\n")).toContain("## User Review Guidance (untrusted)");
			expect(call.args.join("\n")).toContain(
				"```text\nreview against origin/master with extra suspicion\n```",
			);
		}
		const finalSynthesisPrompt = pi.runnerCalls[3]?.args.join("\n");
		expect(finalSynthesisPrompt).toContain("no-tool/no-mutation requirements");
		expect(finalSynthesisPrompt).toContain("structured reviewer outcome data");
		expect(pi.messages[0]?.content).toContain("## Executive Recommendation");
	});

	test("launches three read-only terminal-capture reviewer seats and renders a report", async () => {
		const runnerResult = completedRunnerResult();
		const pi = new FakePi({ execResults: successfulScopeExecResults(), runnerResult });
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.runnerCalls).toHaveLength(4);
		for (const call of pi.runnerCalls.slice(0, 3)) {
			expect(call.args).toContain("--tools");
			expect(call.args).toContain(
				`read,${SUBMIT_THERMO_COUNCIL_REVIEW_TOOL},${BLOCK_THERMO_COUNCIL_REVIEW_TOOL}`,
			);
			expect(call.args).toContain("--extension");
			expect(call.args.join("\n")).toContain(".ji/reviews/thermonuclear-review/review.md");
		}
		const finalSynthesisCall = pi.runnerCalls[3];
		expect(finalSynthesisCall?.args).toContain("--no-tools");
		expect(finalSynthesisCall?.args).not.toContain("--tools");
		expect(pi.messages[0]?.customType).toBe(THERMO_COUNCIL_MESSAGE_TYPE);
		expect(pi.messages[0]?.content).toContain("## Executive Recommendation");
		expect(pi.messages[0]?.content).toContain("## Final Synthesis Evidence");
		expect(pi.messages[0]?.content).toContain("No branches were created");
	});

	test("surfaces live reviewer progress instead of staying on launch status", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ runtimeResult: completedRunnerResult() });
		const pi = new FakePi({
			execResults: successfulScopeExecResults(),
			runnerDependencies: runner.dependencies,
		});
		thermoCouncilExtension(pi);
		const ctx = fakeContext();

		const running = pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", ctx);
		await waitForSpawnCount(runner.calls, 3);
		runner.calls[0]?.process.emitStdout(jsonLine({ type: "agent_start" }));
		runner.calls[0]?.process.emitStdout(jsonLine({ type: "turn_start" }));
		runner.calls[0]?.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Inspecting changed files." }],
				},
			}),
		);

		expect(
			ctx.ui.statuses.some(
				(status) =>
					status.includes("council 0/3 done") &&
					status.includes("Anthropic Opus running: Inspecting changed files."),
			),
		).toBe(true);

		for (const call of runner.calls.slice(0, 3)) call.process.close(0);
		await waitForSpawnCount(runner.calls, 4);
		runner.calls[3]?.process.emitStdout(finalAssistantTextEvent(defaultFinalSynthesisText()));
		runner.calls[3]?.process.close(0);
		await running;
	});

	test("honors a lower thermo council concurrency override", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ runtimeResult: completedRunnerResult() });
		const pi = new FakePi({
			execResults: successfulScopeExecResults(),
			runnerDependencies: runner.dependencies,
		});
		thermoCouncilExtension(pi);

		await withProcessEnv("THERMO_COUNCIL_MAX_CONCURRENCY", "1", async () => {
			const running = pi.commands
				.get(THERMO_COUNCIL_COMMAND_NAME)
				?.handler("origin/master", fakeContext());
			await waitForSpawnCount(runner.calls, 1);
			await Promise.resolve();
			expect(runner.calls).toHaveLength(1);
			runner.calls[0]?.process.close(0);
			await waitForSpawnCount(runner.calls, 2);
			expect(runner.calls).toHaveLength(2);
			runner.calls[1]?.process.close(0);
			await waitForSpawnCount(runner.calls, 3);
			expect(runner.calls).toHaveLength(3);
			runner.calls[2]?.process.close(0);
			await waitForSpawnCount(runner.calls, 4);
			runner.calls[3]?.process.emitStdout(finalAssistantTextEvent(defaultFinalSynthesisText()));
			runner.calls[3]?.process.close(0);
			await running;
		});
	});

	test("invalid thermo council concurrency override falls back to default three", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ runtimeResult: completedRunnerResult() });
		const pi = new FakePi({
			execResults: successfulScopeExecResults(),
			runnerDependencies: runner.dependencies,
		});
		thermoCouncilExtension(pi);

		await withProcessEnv("THERMO_COUNCIL_MAX_CONCURRENCY", "not-a-number", async () => {
			const running = pi.commands
				.get(THERMO_COUNCIL_COMMAND_NAME)
				?.handler("origin/master", fakeContext());
			await waitForSpawnCount(runner.calls, 3);
			await Promise.resolve();
			expect(runner.calls).toHaveLength(3);
			for (const call of runner.calls.slice(0, 3)) call.process.close(0);
			await waitForSpawnCount(runner.calls, 4);
			runner.calls[3]?.process.emitStdout(finalAssistantTextEvent(defaultFinalSynthesisText()));
			runner.calls[3]?.process.close(0);
			await running;
		});
	});

	test("preserves reviewer outcome order when seats finish out of order", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ runtimeResult: completedRunnerResult() });
		const pi = new FakePi({
			execResults: successfulScopeExecResults(),
			runnerDependencies: runner.dependencies,
		});
		thermoCouncilExtension(pi);

		const running = pi.commands
			.get(THERMO_COUNCIL_COMMAND_NAME)
			?.handler("origin/master", fakeContext());
		await waitForSpawnCount(runner.calls, 3);
		runner.calls[2]?.process.close(0);
		runner.calls[0]?.process.close(0);
		runner.calls[1]?.process.close(0);
		await waitForSpawnCount(runner.calls, 4);
		const finalSynthesisPrompt = runner.calls[3]?.args.join("\n") ?? "";
		expectInOrder(finalSynthesisPrompt, ["Anthropic Opus", "OpenAI High", "Gemini High"]);
		runner.calls[3]?.process.emitStdout(finalAssistantTextEvent(defaultFinalSynthesisText()));
		runner.calls[3]?.process.close(0);
		await running;
	});

	test("normalizes scalar validation hints in completed reviewer payloads", async () => {
		const runnerResult: RuntimeResultV1 = {
			version: 1,
			kind: "terminal-capture",
			toolName: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
			status: "completed",
			input: {
				summary: "Review complete.",
				findings: [
					{
						id: "1",
						title: "Duplicated orchestration branching",
						files: ["src/file.ts"],
						evidence: "The diff adds parallel branches for the same lifecycle.",
						problem: "Duplicated branching makes orchestration harder to scan.",
						proposedFix: "Use one typed lifecycle model.",
						behaviorRisk: "Low risk if tests cover both modes.",
						dependencyNotes: "None",
						confidence: "likely",
						severity: "high",
						validationHints: "just ts-test",
					},
				],
				disagreements: [],
			},
		};
		const pi = new FakePi({ execResults: successfulScopeExecResults(), runnerResult });
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.runnerCalls).toHaveLength(4);
		expect(pi.messages[0]?.content).toContain("## Executive Recommendation");
		expect(pi.messages[0]?.content).not.toContain("No council seat completed");
	});

	test("recovers reviewer payloads from malformed session JSONL without repair context", async () => {
		const sessionDir = await mkdtemp(join(tmpdir(), "thermo-council-session-"));
		const sessionFile = join(sessionDir, "session.jsonl");
		await writeFile(
			sessionFile,
			[
				"{malformed line}\n",
				jsonLine({
					type: "toolCall",
					name: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
					arguments: {
						summary: "Recovered from session file.",
						findings: [
							{
								id: "session-1",
								title: "Session recovered finding",
								files: ["src/file.ts"],
								evidence: "The valid tool call survived a malformed preceding line.",
								problem: "Reviewer ended with final text before terminal capture surfaced.",
								proposedFix: "Recover the newest valid tool-call payload from the session file.",
								behaviorRisk: "Low risk when JSONL recovery stays parser-backed and lenient.",
								dependencyNotes: "None",
								confidence: "likely",
								severity: "medium",
								validationHints: ["just ts-test"],
							},
						],
						disagreements: [],
					},
				}),
			].join(""),
			"utf8",
		);

		const outcome = await reviewerOutcomeFromRunnerResult(seat("openai-high", "OpenAI High"), {
			status: "final-text",
			elapsedMs: 1,
			progress: {
				state: "stopped",
				toolCount: 0,
				turnCount: 1,
				elapsedMs: 1,
			},
			sessionFile,
			finalText: "unstructured final text",
		});

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.review.summary).toBe("Recovered from session file.");
		expect(outcome.review.findings[0]?.title).toBe("Session recovered finding");
		expect(outcome.review.findings[0]?.validationHints).toEqual(["just ts-test"]);
	});

	test("formats malformed completed reviewer payloads without throwing", async () => {
		const runnerResult: RuntimeResultV1 = {
			version: 1,
			kind: "terminal-capture",
			toolName: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
			status: "completed",
			input: "not a review object",
		};
		const pi = new FakePi({ execResults: successfulScopeExecResults(), runnerResult });
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.messages[0]?.content).toContain("No council seat completed");
		expect(pi.messages[0]?.content).toContain("<root>");
	});

	test("recovers malformed reviewer payloads from model-repaired final text", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi = new FakePi({ runnerDependencies: runner.dependencies });
		const running = reviewerOutcomeFromRunnerResult(
			seat("anthropic-opus", "Anthropic Opus"),
			malformedCompletedReviewerResult(),
			{ pi, ctx: fakeContext() },
		);
		await waitForSpawnCount(runner.calls, 1);
		runner.calls[0]?.process.emitStdout(
			finalAssistantTextEvent(`Here is the repaired payload:\n${repairedReviewJson()}`),
		);
		runner.calls[0]?.process.close(0);

		const outcome = await running;

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.review.findings[0]?.title).toBe("Recovered payload finding");
		expect(outcome.review.findings[0]?.validationHints).toEqual(["just ts-test"]);
	});

	test("retries invalid model repairs once through bounded text repair", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi = new FakePi({ runnerDependencies: runner.dependencies });
		const running = reviewerOutcomeFromRunnerResult(
			seat("openai-high", "OpenAI High"),
			malformedCompletedReviewerResult(),
			{ pi, ctx: fakeContext() },
		);
		await waitForSpawnCount(runner.calls, 1);
		runner.calls[0]?.process.emitStdout(finalAssistantTextEvent("not json"));
		runner.calls[0]?.process.close(0);
		await waitForSpawnCount(runner.calls, 2);
		runner.calls[1]?.process.emitStdout(finalAssistantTextEvent(repairedReviewJson()));
		runner.calls[1]?.process.close(0);

		const outcome = await running;

		expect(runner.calls).toHaveLength(2);
		expect(runner.calls[1]?.args.join("\n")).toContain("Your previous repair draft was invalid");
		expect(runner.calls[1]?.args.join("\n")).toContain("response contains no JSON object");
		expect(outcome.type).toBe("completed");
	});

	test("fails malformed reviewer payloads after bounded repair attempts", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi = new FakePi({ runnerDependencies: runner.dependencies });
		const running = reviewerOutcomeFromRunnerResult(
			seat("gemini-high", "Gemini High"),
			malformedCompletedReviewerResult(),
			{ pi, ctx: fakeContext() },
		);
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

		const outcome = await reviewerOutcomeFromRunnerResult(
			seat("gemini-high", "Gemini High"),
			result,
		);

		expect(outcome.type).toBe("failed");
		if (outcome.type !== "failed") return;
		expect(outcome.diagnostic).toBe(
			"Forked Pi process stopped without terminal capture (status: stopped-without-terminal; stopReason: stop; turns: 1; tools: 1; model: google/gemini-2.5-pro; thinking: high).",
		);
	});

	test("formats malformed blocked reviewer payloads without throwing", async () => {
		const runnerResult: RuntimeResultV1 = {
			version: 1,
			kind: "terminal-capture",
			toolName: BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
			status: "blocked",
			input: "not a blocked payload",
		};
		const pi = new FakePi({ execResults: successfulScopeExecResults(), runnerResult });
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.messages[0]?.content).toContain("Blocked with malformed payload");
		expect(pi.messages[0]?.content).toContain("<root>");
	});

	test("hard-fails when final synthesis returns empty text after reviewer completion", async () => {
		const runnerResult: RuntimeResultV1 = {
			version: 1,
			kind: "terminal-capture",
			toolName: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
			status: "completed",
			input: {
				findings: [
					{
						id: "1",
						title: "Schema defaults are accepted",
						evidence: "The reviewer omitted optional array fields.",
						problem: "Callers should not have to repeat empty arrays.",
						proposedFix: "Let the Zod defaults fill them in.",
						behaviorRisk: "No runtime behavior risk.",
						dependencyNotes: "None",
						confidence: "likely",
						severity: "medium",
					},
				],
			},
		};
		const pi = new FakePi({
			execResults: successfulScopeExecResults(),
			runnerResult,
			finalSynthesisText: "",
		});
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.runnerCalls).toHaveLength(4);
		expect(pi.messages[0]?.content).toContain("mandatory final synthesis pass");
		expect(pi.messages[0]?.content).toContain("## Final Synthesis Failure");
		expect(pi.messages[0]?.content).toContain("- Status: stopped-without-useful-text");
		expect(pi.messages[0]?.content).toContain("No branches were created");
		expect(pi.messages[0]?.content).not.toContain("## Ranked Findings");
	});

	test("reviewer prompt includes scope, rubric, diff, and capture contract", () => {
		const prompt = buildReviewerPrompt(baseScope(), seat("anthropic-opus", "Anthropic Opus"));

		expect(prompt).toContain("base-sha");
		expect(prompt).toContain("head-sha");
		expect(prompt).toContain("Review strictly.");
		expect(prompt).toContain("diff --git");
		expect(prompt).toContain(SUBMIT_THERMO_COUNCIL_REVIEW_TOOL);
		expect(prompt).toContain("do not create branches");
		expect(prompt).not.toContain("User Review Guidance");
	});

	test("reviewer prompt labels optional caller guidance as untrusted", () => {
		const prompt = buildReviewerPrompt(baseScope(), seat("anthropic-opus", "Anthropic Opus"), {
			reviewGuidance: "focus on prompt injection",
		});

		expect(prompt).toContain("## User Review Guidance (untrusted)");
		expect(prompt).toContain("```text\nfocus on prompt injection\n```");
		expect(prompt).toContain("do not create branches");
		expect(prompt).toContain("tool restrictions");
		expect(prompt).toContain(SUBMIT_THERMO_COUNCIL_REVIEW_TOOL);
	});

	test("synthesis clusters strong text-only findings without file paths", () => {
		const opus = seat("anthropic-opus", "Opus");
		const openai = seat("openai-high", "GPT");
		const clusters = clusterFindings([
			completedOutcome(opus, "Runner lifecycle waits for terminal result persistence", {
				review: {
					findings: [
						{
							id: "1",
							title: "Runner lifecycle waits for terminal result persistence",
							files: [],
							evidence: "No file path was supplied.",
							problem:
								"Runner lifecycle terminal result persistence can race child termination before runtime capture writes.",
							proposedFix:
								"Make runner lifecycle wait for terminal result persistence before child termination.",
							behaviorRisk: "Low behavior risk.",
							dependencyNotes: "None",
							confidence: "likely",
							severity: "high",
							validationHints: [],
						},
					],
				},
			}),
			completedOutcome(openai, "Terminal result persistence in runner lifecycle", {
				review: {
					findings: [
						{
							id: "1",
							title: "Terminal result persistence in runner lifecycle",
							files: [],
							evidence: "No file path was supplied.",
							problem:
								"Runner lifecycle terminal result persistence races when child termination happens before runtime capture writes.",
							proposedFix:
								"Wait for terminal result persistence before runner lifecycle child termination.",
							behaviorRisk: "Low behavior risk.",
							dependencyNotes: "None",
							confidence: "likely",
							severity: "high",
							validationHints: [],
						},
					],
				},
			}),
		]);

		expect(clusters).toHaveLength(1);
		expect(clusters[0]?.support.map((supportSeat) => supportSeat.id).sort()).toEqual([
			"anthropic-opus",
			"openai-high",
		]);
	});

	test("synthesis keeps weak generic empty-file findings separate", () => {
		const opus = seat("anthropic-opus", "Opus");
		const openai = seat("openai-high", "GPT");
		const clusters = clusterFindings([
			completedOutcome(opus, "Review report clarity", {
				review: {
					findings: [
						{
							id: "1",
							title: "Review report clarity",
							files: [],
							evidence: "Generic evidence.",
							problem: "Review output has unclear wording for humans.",
							proposedFix: "Clarify prose in the output.",
							behaviorRisk: "Low behavior risk.",
							dependencyNotes: "None",
							confidence: "uncertain",
							severity: "low",
							validationHints: [],
						},
					],
				},
			}),
			completedOutcome(openai, "Review report formatting", {
				review: {
					findings: [
						{
							id: "1",
							title: "Review report formatting",
							files: [],
							evidence: "Generic evidence.",
							problem: "Status table alignment could be easier to scan.",
							proposedFix: "Adjust table formatting.",
							behaviorRisk: "Low behavior risk.",
							dependencyNotes: "None",
							confidence: "uncertain",
							severity: "low",
							validationHints: [],
						},
					],
				},
			}),
		]);

		expect(clusters).toHaveLength(2);
		expect(clusters.every((cluster) => cluster.support.length === 1)).toBe(true);
	});

	test("synthesis clusters overlapping findings and keeps single-model dissent visible", () => {
		const opus = seat("anthropic-opus", "Opus");
		const openai = seat("openai-high", "GPT");
		const gemini = seat("gemini-high", "Gemini");
		const clusters = clusterFindings([
			completedOutcome(opus, "Duplicated orchestration branching"),
			completedOutcome(openai, "Duplicated orchestration branches"),
			completedOutcome(gemini, "Renderer omits failed seat diagnostics", {
				review: {
					findings: [
						{
							id: "1",
							title: "Renderer omits failed seat diagnostics",
							files: ["src/report.ts"],
							evidence: "Failed seat details are not rendered.",
							problem: "Operators cannot tell which reviewer failed.",
							proposedFix: "Render failed seat diagnostics.",
							behaviorRisk: "No runtime behavior risk.",
							dependencyNotes: "None",
							confidence: "likely",
							severity: "medium",
							validationHints: ["just ts-test"],
						},
					],
				},
			}),
		]);

		expect(clusters.map((cluster) => cluster.support.length)).toEqual([2, 1]);
		const report = renderThermoCouncilReport(baseScope(), [
			completedOutcome(opus, "Duplicated orchestration branching"),
			completedOutcome(openai, "Duplicated orchestration branches"),
			{
				type: "failed",
				seat: gemini,
				sessionFile: "/tmp/gemini.jsonl",
				diagnostic: "model unavailable",
			},
		]);
		expect(report).toContain("## Ranked Findings");
		expect(report).toContain("## Single-Model / Dissenting Findings");
		expect(report).toContain("model unavailable");
	});
});

function defaultFinalSynthesisText(): string {
	return [
		"# Thermo Council Report",
		"",
		"## Executive Recommendation",
		"- Fix the duplicated orchestration branching before landing.",
		"",
		"## Prioritized Recommendations",
		"### 1. Consolidate orchestration branching",
		"- Decision: fix now.",
		"- Why: multiple seats reported the same maintainability issue.",
		"- Evidence: Anthropic Opus:opus-1, OpenAI High:openai-1, Gemini High:gemini-1.",
		"- Fix shape: use one typed lifecycle model.",
		"- Validation: just ts-test.",
		"",
		"## Dissent / Lower-Priority Notes",
		"None.",
		"",
		"## Council Audit Trail",
		"- Synthesized from structured council findings.",
	].join("\n");
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

function malformedCompletedReviewerResult(): RunnerSubagentCompletedResult<JsonObject> {
	return {
		status: "completed",
		elapsedMs: 1,
		progress: {
			state: "stopped",
			toolCount: 1,
			turnCount: 1,
			elapsedMs: 1,
		},
		sessionFile: "/tmp/malformed-reviewer.jsonl",
		terminal: {
			toolName: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
			status: "completed",
			input: { findings: [{ title: "missing required fields" }] },
		},
	};
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

function completedRunnerResult(): RuntimeResultV1 {
	return {
		version: 1,
		kind: "terminal-capture",
		toolName: SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
		status: "completed",
		input: {
			summary: "Review complete.",
			findings: [
				{
					id: "1",
					title: "Duplicated orchestration branching",
					files: ["src/file.ts"],
					evidence: "The diff adds parallel branches for the same lifecycle.",
					problem: "Duplicated branching makes orchestration harder to scan.",
					proposedFix: "Use one typed lifecycle model.",
					behaviorRisk: "Low risk if tests cover both modes.",
					dependencyNotes: "None",
					confidence: "likely",
					severity: "high",
					validationHints: ["just ts-test"],
				},
			],
			disagreements: [],
		},
	};
}

async function waitForSpawnCount(calls: readonly SpawnCall[], count: number): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (calls.length >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error(`Expected ${count} child processes to be spawned.`);
}

async function withProcessEnv<T>(name: string, value: string, run: () => Promise<T>): Promise<T> {
	const previous = process.env[name];
	process.env[name] = value;
	try {
		return await run();
	} finally {
		if (previous === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = previous;
		}
	}
}

function expectInOrder(text: string, fragments: readonly string[]): void {
	let previousIndex = -1;
	for (const fragment of fragments) {
		const index = text.indexOf(fragment, previousIndex + 1);
		expect(index).toBeGreaterThan(previousIndex);
		previousIndex = index;
	}
}

function successfulInferredScopeExecResults(): Map<
	string,
	{ stdout: string; stderr?: string; code?: number }
> {
	return successfulScopeExecResults();
}

function successfulScopeExecResults(): Map<
	string,
	{ stdout: string; stderr?: string; code?: number }
> {
	return new Map([
		["git status --short", { stdout: "" }],
		["git symbolic-ref --quiet --short refs/remotes/origin/HEAD", { stdout: "origin/master\n" }],
		["git rev-parse --show-toplevel", { stdout: "/repo\n" }],
		["git rev-parse HEAD", { stdout: "head-sha\n" }],
		["git rev-parse --verify origin/master^{commit}", { stdout: "base-ref-sha\n" }],
		["git merge-base base-ref-sha HEAD", { stdout: "base-sha\n" }],
		["git diff --stat base-sha...HEAD", { stdout: " src/file.ts | 2 ++\n" }],
		["git diff --name-only base-sha...HEAD", { stdout: "src/file.ts\n" }],
		[
			"git diff --no-ext-diff base-sha...HEAD",
			{ stdout: "diff --git a/src/file.ts b/src/file.ts\n" },
		],
		["git show HEAD:.ji/reviews/thermonuclear-review/review.md", { stdout: "Review strictly.\n" }],
	]);
}
