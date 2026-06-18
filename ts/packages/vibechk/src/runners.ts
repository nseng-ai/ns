import { NodeCommandExecApi, type CommandExecApi, type ExecResult } from "@asdl/core/exec";

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
		const available = Array.from(this.runners.keys()).sort().join(", ") || "none";
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
			exitCode: result.exitCode,
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

	private buildCommand(request: RunnerRequest): readonly string[] {
		const command = ["claude", "--print", "--permission-mode", "acceptEdits"];
		if (request.model !== null) {
			command.push("--model", request.model);
		}
		command.push(request.planText);
		return command;
	}

	private async executeCommand(
		command: readonly string[],
		workdir: string,
		transcriptSink: (text: string) => void,
		stdoutSink: (text: string) => void,
	): Promise<{ exitCode: number }> {
		const executable = command[0];
		if (executable === undefined) {
			throw new VibechkError("Runner 'claude' command is empty.");
		}

		const streamText = (text: string): void => {
			stdoutSink(text);
			transcriptSink(text);
		};

		let result: ExecResult;
		try {
			result = await this.execApi.exec(executable, command.slice(1), {
				cwd: workdir,
				onStdout: streamText,
				onStderr: streamText,
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (isMissingExecutableError(message)) {
				throw new VibechkError("Runner 'claude' is not installed or not on PATH.");
			}
			throw new VibechkError(`Runner 'claude' failed to start: ${message}`);
		}
		if (result.startupError !== undefined) {
			if (isMissingExecutableError(result.startupError)) {
				throw new VibechkError("Runner 'claude' is not installed or not on PATH.");
			}
			throw new VibechkError(`Runner 'claude' failed to start: ${result.startupError}`);
		}
		return { exitCode: result.code };
	}
}

function isMissingExecutableError(message: string): boolean {
	return message.includes("ENOENT");
}

export function buildProductionRunnerRegistry(): RunnerRegistry {
	return new RunnerRegistry([new ClaudeRunner()]);
}
