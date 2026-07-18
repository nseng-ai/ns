import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

import { loadRealPiCommandRuntimeModule } from "./real-runtime.ts";
import { createRealTerminalTakeover, type TerminalTakeoverFactory } from "./terminal-takeover.ts";
import type {
	PiCommandHost,
	PiCommandHostRequest,
	PiCommandHostResult,
	PiCommandRuntimeModuleLoader,
	PiCommandTargetLifecycle,
	PiExtensionApi,
} from "./types.ts";

export interface CreatePiCommandHostOptions {
	loadRuntimeModule?: PiCommandRuntimeModuleLoader;
	createTerminalTakeover?: TerminalTakeoverFactory;
}

/**
 * Creates Flow's incubating host for one Pi command.
 *
 * This feature promotes toward `@nseng-ai/pi` after `ns flow stack` and a second
 * consumer validate it. InteractiveMode owns the process in production because
 * Pi shutdown calls `process.exit(0)`; a returned run is retained for fake-driven
 * tests. A future `stay-interactive` policy belongs in the promoted host.
 */
export function createPiCommandHost(options: CreatePiCommandHostOptions = {}): PiCommandHost {
	const loadRuntimeModule = options.loadRuntimeModule ?? loadRealPiCommandRuntimeModule;
	const createTerminalTakeover = options.createTerminalTakeover ?? createRealTerminalTakeover;

	return {
		async run(request): Promise<PiCommandHostResult> {
			const validationFailure = validateRequest(request);
			if (validationFailure !== undefined) return validationFailure;

			let runtimeModule;
			try {
				runtimeModule = await loadRuntimeModule();
			} catch (error) {
				return {
					type: "unavailable",
					message: `Pi runtime is unavailable; install @earendil-works/pi-coding-agent 0.80.5 (${errorMessage(error)})`,
					exitCode: 2,
				};
			}

			const terminalTakeover =
				request.presentation === "fullscreen-takeover" ? createTerminalTakeover() : undefined;
			try {
				terminalTakeover?.enter();
			} catch (error) {
				bestEffortRestore(terminalTakeover);
				return { type: "failed", message: errorMessage(error), exitCode: 2 };
			}

			const targetLifecycle = createTargetLifecycle(terminalTakeover);
			let isTargetRegistered = false;
			let handlerFailure: unknown;
			const extensionFactories = request.extensionFactories.map(
				(factory): ExtensionFactory =>
					async (api) => {
						const decoratedApi = new Proxy(api, {
							get(target, property, receiver): unknown {
								if (property !== "registerCommand") {
									return Reflect.get(target, property, receiver);
								}
								return createRegisterCommandInterceptor(target, request.command, {
									onRegistered: () => {
										isTargetRegistered = true;
									},
									onFailure: (error) => {
										handlerFailure = error;
									},
									onSucceeded: targetLifecycle.markSucceeded,
								});
							},
						});
						await factory(decoratedApi);
					},
			);

			try {
				await runtimeModule.runInteractive({
					cwd: request.cwd,
					initialMessage: buildInitialMessage(request),
					extensionFactories,
					...(terminalTakeover === undefined ? {} : { terminalTakeover }),
					targetLifecycle,
					onExtensionsLoaded() {
						if (!isTargetRegistered) {
							throw new Error(`Pi extension did not register command "${request.command}"`);
						}
					},
				});
			} catch (error) {
				bestEffortRestore(terminalTakeover);
				return handlerFailure === undefined
					? { type: "failed", message: errorMessage(error), exitCode: 2 }
					: commandHandlerFailure(request.command, handlerFailure);
			}

			if (handlerFailure !== undefined) {
				bestEffortRestore(terminalTakeover);
				return commandHandlerFailure(request.command, handlerFailure);
			}
			if (!isTargetRegistered) {
				bestEffortRestore(terminalTakeover);
				return {
					type: "failed",
					message: `Pi extension did not register command "${request.command}"`,
					exitCode: 2,
				};
			}
			return { type: "completed", exitCode: 0 };
		},
	};
}

function validateRequest(request: PiCommandHostRequest): PiCommandHostResult | undefined {
	if (request.command.length === 0 || request.command.startsWith("/")) {
		return {
			type: "failed",
			message: "Pi command must be non-empty and must not start with a slash",
			exitCode: 2,
		};
	}
	if (request.exitPolicy !== "after-command") {
		return {
			type: "failed",
			message: 'Pi command exitPolicy must be "after-command"',
			exitCode: 2,
		};
	}
	return undefined;
}

function buildInitialMessage(request: PiCommandHostRequest): string {
	return request.args === undefined || request.args.length === 0
		? `/${request.command}`
		: `/${request.command} ${request.args}`;
}

function createRegisterCommandInterceptor(
	api: PiExtensionApi,
	command: string,
	callbacks: {
		onRegistered(): void;
		onFailure(error: unknown): void;
		onSucceeded(): void;
	},
): PiExtensionApi["registerCommand"] {
	return (name, commandOptions): void => {
		if (name !== command) {
			api.registerCommand(name, commandOptions);
			return;
		}
		callbacks.onRegistered();
		api.registerCommand(name, {
			...commandOptions,
			async handler(args, ctx): Promise<void> {
				try {
					await commandOptions.handler(args, ctx);
				} catch (error) {
					callbacks.onFailure(error);
					// Do not request Pi's exit-0 shutdown after a failed command. Real
					// InteractiveMode reports the error and remains interactive; injected
					// runtimes may propagate it so the host can return exit-2 semantics.
					throw error;
				}
				callbacks.onSucceeded();
				ctx.shutdown();
			},
		});
	};
}

function createTargetLifecycle(
	terminalTakeover: ReturnType<TerminalTakeoverFactory> | undefined,
): PiCommandTargetLifecycle {
	let hasSucceeded = false;
	return {
		markSucceeded(): void {
			hasSucceeded = true;
		},
		onSessionShutdown(): void {
			if (hasSucceeded) {
				terminalTakeover?.complete();
				return;
			}
			terminalTakeover?.restore();
		},
	};
}

function bestEffortRestore(
	terminalTakeover: ReturnType<TerminalTakeoverFactory> | undefined,
): void {
	try {
		terminalTakeover?.restore();
	} catch {
		// Preserve the original entry/runtime/handler failure.
	}
}

function commandHandlerFailure(command: string, error: unknown): PiCommandHostResult {
	return {
		type: "failed",
		message: `Pi command "${command}" failed: ${errorMessage(error)}`,
		exitCode: 2,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
