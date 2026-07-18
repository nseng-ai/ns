import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";

import type { TerminalTakeover } from "./terminal-takeover.ts";

export interface PiCommandHostRequest {
	cwd: string;
	/** Pi command name without the leading slash. */
	command: string;
	args?: string;
	extensionFactories: readonly ExtensionFactory[];
	exitPolicy: "after-command";
	presentation?: "fullscreen-takeover";
}

export type PiCommandHostResult =
	| { type: "completed"; exitCode: 0 }
	| { type: "unavailable" | "failed"; message: string; exitCode: 2 };

export interface PiCommandHost {
	run(request: PiCommandHostRequest): Promise<PiCommandHostResult>;
}

export interface PiCommandTargetLifecycle {
	markSucceeded(): void;
	onSessionShutdown(): void;
}

export interface PiCommandRuntimeRequest {
	cwd: string;
	initialMessage: string;
	extensionFactories: readonly ExtensionFactory[];
	onExtensionsLoaded(): void;
	targetLifecycle: PiCommandTargetLifecycle;
	terminalTakeover?: TerminalTakeover;
}

export interface PiCommandRuntimeModule {
	runInteractive(request: PiCommandRuntimeRequest): Promise<void>;
}

export type PiCommandRuntimeModuleLoader = () => Promise<PiCommandRuntimeModule>;

export type PiExtensionApi = ExtensionAPI;
