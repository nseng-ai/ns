import type { ExecOptions, ExecResult } from "../exec-gateway.ts";

import type { SendMessageOptions, SendUserMessageOptions } from "../message-delivery.ts";
import type { PrAddressRunner } from "../pr-feedback-download.ts";

export type { ExecOptions, ExecResult } from "../exec-gateway.ts";

interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

export interface ExtensionContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
		setEditorText?(text: string): void;
	};
	waitForIdle?(): Promise<void>;
	isIdle?(): boolean;
	sessionManager?: {
		getBranch?(): readonly SessionEntry[];
		getEntries?(): readonly SessionEntry[];
	};
}

export interface SessionEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

export interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}

export interface ExtensionAPI {
	registerCommand(name: string, options: RegisteredCommand): void;
	on(
		event: "session_start",
		handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void,
	): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage?(content: string, options?: SendUserMessageOptions): void;
	sendMessage?(message: CustomMessage, options?: SendMessageOptions): void;
	appendEntry?(customType: string, data?: unknown): void;
}

export type { ExecGateway } from "../exec-gateway.ts";

export interface PrFeedbackWatchExtensionOptions {
	runner?: PrAddressRunner;
	minimumIntervalMs?: number;
}

export interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	abortController: AbortController;
	harnessSessionId: string;
	isClosed: boolean;
}
