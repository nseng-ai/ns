import { describe, expect, test } from "vitest";

import type { RunnerSubagentDispatcherDependencies } from "../src/runner-subagent/subagent-process.ts";
import type { RuntimeResultV1 } from "../src/runner-subagent/subagent-runtime.ts";
import { createRuntimeConfig } from "../src/runner-subagent/subagent-runtime.ts";
import { RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES } from "../src/runner-subagent.ts";
import thermoCouncilExtension, {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	THERMO_COUNCIL_COMMAND_NAME,
	THERMO_COUNCIL_MESSAGE_TYPE,
	buildReviewerPrompt,
	clusterFindings,
	parseThermoCouncilSeats,
	renderThermoCouncilReport,
	type ThermoCouncilReviewerOutcome,
	type ThermoCouncilScope,
	type ThermoCouncilSeatConfig,
} from "../src/thermo-council.ts";
import { FakeSpawnedChildProcess, type SpawnCall } from "./runner-subagent-fakes.ts";

interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: FakeCommandContext): Promise<void> | void;
}

interface ExecCall {
	readonly command: string;
	readonly args: readonly string[];
}

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: Array<{ customType: string; content: string; display: boolean }> = [];
	readonly execCalls: ExecCall[] = [];
	readonly runnerCalls: SpawnCall[] = [];
	readonly [RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	private readonly execResults: Map<string, { stdout: string; stderr?: string; code?: number }>;

	constructor(
		options: {
			execResults?: Map<string, { stdout: string; stderr?: string; code?: number }>;
			runnerResult?: RuntimeResultV1;
		} = {},
	) {
		this.execResults = options.execResults ?? new Map();
		if (options.runnerResult !== undefined) {
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
		const result = this.execResults.get(key);
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
				queueMicrotask(() => process.close(0));
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
						"pnpm --dir ts vitest run packages/pi-extensions/test/thermo-council.test.ts",
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
		expect(pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.description).toContain("report");
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

	test("launches three read-only terminal-capture reviewer seats and renders a report", async () => {
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
						validationHints: ["just ts-test"],
					},
				],
				disagreements: [],
			},
		};
		const pi = new FakePi({ execResults: successfulScopeExecResults(), runnerResult });
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.runnerCalls).toHaveLength(3);
		for (const call of pi.runnerCalls) {
			expect(call.args).toContain("--tools");
			expect(call.args).toContain(
				`read,${SUBMIT_THERMO_COUNCIL_REVIEW_TOOL},${BLOCK_THERMO_COUNCIL_REVIEW_TOOL}`,
			);
			expect(call.args).toContain("--extension");
			expect(call.args.join("\n")).toContain("reviews/thermonuclear-review.md");
		}
		expect(pi.messages[0]?.customType).toBe(THERMO_COUNCIL_MESSAGE_TYPE);
		expect(pi.messages[0]?.content).toContain("## Council Seat Status");
		expect(pi.messages[0]?.content).toContain("No branches were created");
	});

	test("accepts review findings that rely on array defaults", async () => {
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
		const pi = new FakePi({ execResults: successfulScopeExecResults(), runnerResult });
		thermoCouncilExtension(pi);

		await pi.commands.get(THERMO_COUNCIL_COMMAND_NAME)?.handler("origin/master", fakeContext());

		expect(pi.messages[0]?.content).toContain("(none supplied)");
		expect(pi.messages[0]?.content).toContain("No validation hints were supplied.");
	});

	test("reviewer prompt includes scope, rubric, diff, and capture contract", () => {
		const prompt = buildReviewerPrompt(baseScope(), seat("anthropic-opus", "Anthropic Opus"));

		expect(prompt).toContain("base-sha");
		expect(prompt).toContain("head-sha");
		expect(prompt).toContain("Review strictly.");
		expect(prompt).toContain("diff --git");
		expect(prompt).toContain(SUBMIT_THERMO_COUNCIL_REVIEW_TOOL);
		expect(prompt).toContain("do not create branches");
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

function successfulScopeExecResults(): Map<
	string,
	{ stdout: string; stderr?: string; code?: number }
> {
	return new Map([
		["git status --short", { stdout: "" }],
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
		["git show HEAD:reviews/thermonuclear-review.md", { stdout: "Review strictly.\n" }],
	]);
}
