import type {
	ExtensionAPI,
	ExtensionCommandContext,
	RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { createPiCommandHost } from "../../src/pi-command-host/index.ts";
import {
	createTerminalTakeover,
	type TerminalTakeover,
} from "../../src/pi-command-host/terminal-takeover.ts";
import type {
	PiCommandHostRequest,
	PiCommandRuntimeModule,
	PiCommandRuntimeRequest,
} from "../../src/pi-command-host/types.ts";

interface FakeRuntimeState {
	initialMessage?: string;
	registeredCommands: Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>;
	shutdownCount: number;
}

function createFakeRuntime(options: { shouldInvokeCommand?: boolean } = {}): {
	module: PiCommandRuntimeModule;
	state: FakeRuntimeState;
} {
	const state: FakeRuntimeState = {
		registeredCommands: new Map(),
		shutdownCount: 0,
	};
	return {
		state,
		module: {
			async runInteractive(request: PiCommandRuntimeRequest): Promise<void> {
				state.initialMessage = request.initialMessage;
				const api = createFakeExtensionApi(state);
				for (const factory of request.extensionFactories) await factory(api);
				request.onExtensionsLoaded();
				if (options.shouldInvokeCommand !== false) {
					const name = request.initialMessage.slice(1).split(" ", 1)[0];
					const command = name === undefined ? undefined : state.registeredCommands.get(name);
					if (command !== undefined) {
						await command.handler(
							"",
							createFakeCommandContext(state, request.targetLifecycle.onSessionShutdown),
						);
					}
				}
			},
		},
	};
}

function createFakeExtensionApi(state: FakeRuntimeState): ExtensionAPI {
	return new Proxy(
		{
			registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void {
				state.registeredCommands.set(name, options);
			},
		},
		{
			get(target, property, receiver): unknown {
				if (property in target) return Reflect.get(target, property, receiver);
				return () => undefined;
			},
		},
	) as ExtensionAPI;
}

function createFakeCommandContext(
	state: FakeRuntimeState,
	onShutdown: () => void,
): ExtensionCommandContext {
	return new Proxy(
		{
			shutdown(): void {
				state.shutdownCount += 1;
				onShutdown();
			},
		},
		{
			get(target, property, receiver): unknown {
				if (property in target) return Reflect.get(target, property, receiver);
				return () => undefined;
			},
		},
	) as ExtensionCommandContext;
}

function request(overrides: Partial<PiCommandHostRequest> = {}): PiCommandHostRequest {
	return {
		cwd: "/repo",
		command: "stack:view",
		extensionFactories: [
			(api) => {
				api.registerCommand("stack:view", {
					description: "View stack",
					async handler(): Promise<void> {},
				});
			},
		],
		exitPolicy: "after-command",
		...overrides,
	};
}

function recordingTakeover(log: string[]): TerminalTakeover {
	let restored = false;
	let completed = false;
	return {
		enter: () => log.push("enter"),
		restore: () => {
			if (restored) return;
			restored = true;
			log.push("restore");
		},
		complete: () => {
			if (completed) return;
			if (!restored) {
				restored = true;
				log.push("restore");
			}
			completed = true;
			log.push("complete");
		},
	};
}

describe("terminal takeover", () => {
	it("centralizes alternate-screen writes and restores idempotently before completion", () => {
		const writes: string[] = [];
		let exitHandler: (() => void) | undefined;
		const takeover = createTerminalTakeover({
			write: (value) => writes.push(value),
			exitEvents: {
				onExit: (handler) => {
					exitHandler = handler;
				},
				offExit: (handler) => {
					if (exitHandler === handler) exitHandler = undefined;
				},
			},
		});

		takeover.enter();
		takeover.enter();
		takeover.complete();
		takeover.restore();
		exitHandler?.();

		expect(writes).toEqual([
			"\u001b[?1049h\u001b[H\u001b[2J",
			"\u001b[?1049l",
			"stack view closed\n",
		]);
		expect(exitHandler).toBeUndefined();
	});

	it("attempts restoration when the alternate-screen entry write partially writes then throws", () => {
		const writes: string[] = [];
		let writeCount = 0;
		const takeover = createTerminalTakeover({
			write: (value) => {
				writes.push(value);
				writeCount += 1;
				if (writeCount === 1) throw new Error("partial entry write");
			},
			exitEvents: { onExit: () => undefined, offExit: () => undefined },
		});

		expect(() => takeover.enter()).toThrow("partial entry write");
		expect(() => takeover.restore()).not.toThrow();
		expect(writes).toEqual(["\u001b[?1049h\u001b[H\u001b[2J", "\u001b[?1049l"]);
	});
});

describe("createPiCommandHost", () => {
	it.each(["", "/stack:view"])("rejects invalid command %j before loading Pi", async (command) => {
		let loadCount = 0;
		const host = createPiCommandHost({
			loadRuntimeModule: async () => {
				loadCount += 1;
				return createFakeRuntime().module;
			},
		});

		await expect(host.run(request({ command }))).resolves.toEqual({
			type: "failed",
			message: "Pi command must be non-empty and must not start with a slash",
			exitCode: 2,
		});
		expect(loadCount).toBe(0);
	});

	it("rejects unsupported exit policies before loading Pi", async () => {
		let loadCount = 0;
		const host = createPiCommandHost({
			loadRuntimeModule: async () => {
				loadCount += 1;
				return createFakeRuntime().module;
			},
		});
		const invalidRequest = request();
		Object.defineProperty(invalidRequest, "exitPolicy", { value: "stay-interactive" });

		await expect(host.run(invalidRequest)).resolves.toEqual({
			type: "failed",
			message: 'Pi command exitPolicy must be "after-command"',
			exitCode: 2,
		});
		expect(loadCount).toBe(0);
	});

	it("maps a missing lazy Pi module to unavailable", async () => {
		const host = createPiCommandHost({
			loadRuntimeModule: async () => {
				throw new Error("module not found");
			},
		});

		const result = await host.run(request());

		expect(result).toEqual({
			type: "unavailable",
			message:
				"Pi runtime is unavailable; install @earendil-works/pi-coding-agent 0.80.5 (module not found)",
			exitCode: 2,
		});
	});

	it("fails when the target command is not registered", async () => {
		const runtime = createFakeRuntime();
		const host = createPiCommandHost({ loadRuntimeModule: async () => runtime.module });

		const result = await host.run(
			request({
				extensionFactories: [
					(api) => {
						api.registerCommand("another", { async handler(): Promise<void> {} });
					},
				],
			}),
		);

		expect(result).toEqual({
			type: "failed",
			message: 'Pi extension did not register command "stack:view"',
			exitCode: 2,
		});
	});

	it("requests shutdown after the target handler resolves", async () => {
		const runtime = createFakeRuntime();
		const host = createPiCommandHost({ loadRuntimeModule: async () => runtime.module });

		const result = await host.run(request({ args: "--branch feature" }));

		expect(result).toEqual({ type: "completed", exitCode: 0 });
		expect(runtime.state.initialMessage).toBe("/stack:view --branch feature");
		expect(runtime.state.shutdownCount).toBe(1);
	});

	it("enters fullscreen before runtime and restores before completion", async () => {
		const log: string[] = [];
		const runtime = createFakeRuntime();
		const runInteractive = runtime.module.runInteractive;
		runtime.module.runInteractive = async (runtimeRequest) => {
			log.push("runtime");
			await runInteractive(runtimeRequest);
		};
		const host = createPiCommandHost({
			loadRuntimeModule: async () => runtime.module,
			createTerminalTakeover: () => recordingTakeover(log),
		});

		await expect(host.run(request({ presentation: "fullscreen-takeover" }))).resolves.toEqual({
			type: "completed",
			exitCode: 0,
		});
		expect(log).toEqual(["enter", "runtime", "restore", "complete"]);
	});

	it("restores fullscreen without completion when shutdown happens before target success", async () => {
		const log: string[] = [];
		const runtime: PiCommandRuntimeModule = {
			async runInteractive(runtimeRequest): Promise<void> {
				for (const factory of runtimeRequest.extensionFactories) {
					await factory(
						createFakeExtensionApi({
							registeredCommands: new Map(),
							shutdownCount: 0,
						}),
					);
				}
				runtimeRequest.onExtensionsLoaded();
				runtimeRequest.targetLifecycle.onSessionShutdown();
			},
		};
		const host = createPiCommandHost({
			loadRuntimeModule: async () => runtime,
			createTerminalTakeover: () => recordingTakeover(log),
		});

		await host.run(request({ presentation: "fullscreen-takeover" }));

		expect(log).toEqual(["enter", "restore"]);
	});

	it("restores fullscreen without completion when the command fails", async () => {
		const log: string[] = [];
		const runtime = createFakeRuntime();
		const host = createPiCommandHost({
			loadRuntimeModule: async () => runtime.module,
			createTerminalTakeover: () => recordingTakeover(log),
		});

		const result = await host.run(
			request({
				presentation: "fullscreen-takeover",
				extensionFactories: [
					(api) => {
						api.registerCommand("stack:view", {
							async handler(): Promise<void> {
								throw new Error("overlay broke");
							},
						});
					},
				],
			}),
		);

		expect(result.type).toBe("failed");
		expect(log).toEqual(["enter", "restore"]);
	});

	it("captures a handler throw without requesting Pi's exit-0 shutdown", async () => {
		const runtime = createFakeRuntime();
		const host = createPiCommandHost({ loadRuntimeModule: async () => runtime.module });

		const result = await host.run(
			request({
				extensionFactories: [
					(api) => {
						api.registerCommand("stack:view", {
							async handler(): Promise<void> {
								throw new Error("overlay broke");
							},
						});
					},
				],
			}),
		);

		expect(result).toEqual({
			type: "failed",
			message: 'Pi command "stack:view" failed: overlay broke',
			exitCode: 2,
		});
		expect(runtime.state.shutdownCount).toBe(0);
	});
});
