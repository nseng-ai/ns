import { NodeCommandExecApi } from "@nseng-ai/core/exec";
import type { CommandExecApi, ExecResult } from "@nseng-ai/core/exec";

import { runVibechkCommand } from "./exec-util.ts";
import type { Metrics } from "./models.ts";
import { VibechkError } from "./store.ts";

export interface RunnerRequest {
	planText: string;
	workdir: string;
	model: string | null;
	runId: string;
	artifactsDir: string;
}

export interface RunnerResult {
	exitCode: number;
	transcript: string;
	metrics: Metrics;
	artifacts: Record<string, unknown>;
	runnerVersion: string | null;
}

export interface Runner {
	name: string;
	run(
		request: RunnerRequest,
		transcriptSink: (text: string) => void,
		stdoutSink: (text: string) => void,
	): Promise<RunnerResult>;
}

export class RunnerRegistry {
	private readonly runners: Map<string, Runner>;

	constructor(runners: readonly Runner[]) {
		this.runners = new Map(runners.map((runner) => [runner.name, runner]));
	}

	get(name: string): Runner {
		const runner = this.runners.get(name);
		if (runner !== undefined) {
			return runner;
		}
		const availableNames = Array.from(this.runners.keys()).sort().join(", ");
		const available = availableNames === "" ? "none" : availableNames;
		throw new VibechkError(`Unsupported runner '${name}'. Available runners: ${available}.`);
	}

	names(): readonly string[] {
		return Array.from(this.runners.keys()).sort();
	}
}

export class ClaudeRunner implements Runner {
	readonly name = "claude";
	private readonly execApi: CommandExecApi;

	constructor(execApi: CommandExecApi = new NodeCommandExecApi()) {
		this.execApi = execApi;
	}

	async run(
		request: RunnerRequest,
		transcriptSink: (text: string) => void,
		stdoutSink: (text: string) => void,
	): Promise<RunnerResult> {
		const command = this.buildCommand(request);
		const started = performance.now();

		const result = await this.executeCommand(command, request.workdir, transcriptSink, stdoutSink);
		const wallTimeSeconds = Math.round((performance.now() - started) / 10) / 100;

		return {
			exitCode: result.code,
			transcript: "",
			metrics: {
				wallTimeSeconds,
				inputTokens: null,
				outputTokens: null,
				totalTokens: null,
				costUsd: null,
			},
			artifacts: {},
			runnerVersion: null,
		};
	}

	private buildCommand(request: RunnerRequest): readonly [string, ...string[]] {
		const command = ["claude", "--print", "--permission-mode", "acceptEdits"];
		if (request.model !== null) {
			command.push("--model", request.model);
		}
		command.push(request.planText);
		return [command[0] ?? "claude", ...command.slice(1)];
	}

	private async executeCommand(
		command: readonly [string, ...string[]],
		workdir: string,
		transcriptSink: (text: string) => void,
		stdoutSink: (text: string) => void,
	): Promise<ExecResult> {
		const streamText = (text: string): void => {
			stdoutSink(text);
			transcriptSink(text);
		};

		return await runVibechkCommand({
			execApi: this.execApi,
			command: command[0],
			args: command.slice(1),
			execOptions: {
				cwd: workdir,
				onStdout: streamText,
				onStderr: streamText,
			},
			missingExecutableMessage: "Runner 'claude' is not installed or not on PATH.",
			startupFailurePrefix: "Runner 'claude' failed to start",
		});
	}
}

export function buildProductionRunnerRegistry(): RunnerRegistry {
	return new RunnerRegistry([new ClaudeRunner()]);
}
