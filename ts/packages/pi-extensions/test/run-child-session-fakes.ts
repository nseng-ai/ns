import { EventEmitter } from "node:events";

import type {
	ChildSessionRunnerDependencies,
	SpawnChildProcessOptions,
	SpawnedChildProcess,
} from "../src/run-child-session/child-process.ts";

export type SpawnCall = {
	command: string;
	args: string[];
	options: SpawnChildProcessOptions;
	process: FakeSpawnedChildProcess;
};

export class FakeSpawnedChildProcess implements SpawnedChildProcess {
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();
	readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];
	private readonly events = new EventEmitter();

	kill(signal?: NodeJS.Signals | number): boolean {
		this.killSignals.push(signal);
		return true;
	}

	on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
	on(
		event: "close" | "error",
		listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((error: Error) => void),
	): unknown {
		this.events.on(event, listener as (...args: any[]) => void);
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

export function createFakeChildRunner(options: { sessionFile?: string; now?: () => number } = {}): {
	dependencies: ChildSessionRunnerDependencies;
	calls: SpawnCall[];
} {
	const calls: SpawnCall[] = [];
	const sessionFile = options.sessionFile ?? "/tmp/pi-child-session.jsonl";
	const dependencies: ChildSessionRunnerDependencies = {
		...(options.now === undefined ? {} : { now: options.now }),
		createSessionFile: () => sessionFile,
		processArgv: ["/usr/bin/node"],
		processExecPath: "/usr/bin/node",
		existsSync: () => false,
		spawn(command, args, spawnOptions) {
			const process = new FakeSpawnedChildProcess();
			calls.push({ command, args: [...args], options: spawnOptions, process });
			return process;
		},
	};
	return { calls, dependencies };
}

export async function waitForSpawn(calls: readonly SpawnCall[]): Promise<SpawnCall> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const call = calls[0];
		if (call) return call;
		await Promise.resolve();
	}
	throw new Error("Expected child process to be spawned.");
}
