import { EventEmitter } from "node:events";

import type {
	RunnerSubagentDispatcherDependencies,
	SpawnChildProcessOptions,
	SpawnedChildProcess,
} from "../src/runner-subagent/subagent-process.ts";
import {
	createRuntimeConfig,
	type RunnerSubagentRuntimeFiles,
	type RuntimeResultV1,
} from "../src/runner-subagent/subagent-runtime.ts";

export type SpawnCall = {
	command: string;
	args: string[];
	options: SpawnChildProcessOptions;
	process: FakeSpawnedChildProcess;
};

type CloseListener = (code: number | null, signal: NodeJS.Signals | null) => void;
type ErrorListener = (error: Error) => void;

type FakeSpawnedChildProcessEvents = {
	close: Parameters<CloseListener>;
	error: Parameters<ErrorListener>;
};

export class FakeSpawnedChildProcess implements SpawnedChildProcess {
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();
	readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];
	private readonly events = new EventEmitter<FakeSpawnedChildProcessEvents>();

	kill(signal?: NodeJS.Signals | number): boolean {
		this.killSignals.push(signal);
		return true;
	}

	on(event: "close", listener: CloseListener): unknown;
	on(event: "error", listener: ErrorListener): unknown;
	on(event: "close" | "error", listener: CloseListener | ErrorListener): unknown {
		if (event === "close") {
			this.events.on("close", listener as CloseListener);
			return this;
		}
		this.events.on("error", listener as ErrorListener);
		return this;
	}

	emitStdout(chunk: string | Uint8Array): void {
		this.stdout.emit("data", chunk);
	}

	emitStderr(chunk: string | Uint8Array): void {
		this.stderr.emit("data", chunk);
	}

	close(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
		this.events.emit("close", code, signal);
	}

	fail(error: Error): void {
		this.events.emit("error", error);
	}
}

export function createFakeRunnerSubagentDispatcher(
	options: {
		sessionFile?: string;
		now?: () => number;
		runtimeFiles?: RunnerSubagentRuntimeFiles;
		runtimeResult?: RuntimeResultV1;
	} = {},
): {
	dependencies: RunnerSubagentDispatcherDependencies;
	calls: SpawnCall[];
	runtimeFiles: RunnerSubagentRuntimeFiles;
} {
	const calls: SpawnCall[] = [];
	const sessionFile = options.sessionFile ?? "/tmp/pi-runner-subagent.jsonl";
	const runtimeFiles = options.runtimeFiles ?? {
		runtimeDir: "/tmp/pi-runner-subagent-runtime",
		configPath: "/tmp/pi-runner-subagent-runtime/config.json",
		resultPath: "/tmp/pi-runner-subagent-runtime/result.json",
		extensionPath: "/tmp/pi-runner-subagent-runtime/runtime-extension.ts",
		cleanup: () => undefined,
	};
	const dependencies: RunnerSubagentDispatcherDependencies = {
		...(options.now === undefined ? {} : { now: options.now }),
		createSessionFile: () => sessionFile,
		createRuntimeFiles: (input) => {
			createRuntimeConfig(input);
			return runtimeFiles;
		},
		readRuntimeResult: () => options.runtimeResult,
		processArgv: ["/usr/bin/node"],
		processExecPath: "/usr/bin/node",
		existsSync: () => false,
		spawn(command, args, spawnOptions) {
			const process = new FakeSpawnedChildProcess();
			calls.push({ command, args: [...args], options: spawnOptions, process });
			return process;
		},
	};
	return { calls, dependencies, runtimeFiles };
}

export async function waitForSpawn(calls: readonly SpawnCall[]): Promise<SpawnCall> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const call = calls[0];
		if (call) return call;
		await Promise.resolve();
	}
	throw new Error("Expected child process to be spawned.");
}
