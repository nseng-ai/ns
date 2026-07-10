import type {
	RawPiExecApi,
	RawPiExecOptions,
	RawPiExecResult,
} from "@nseng-ai/pi/shared/exec-gateway";

import type { TimerScheduler } from "@nseng-ai/foundation/timers";
import type {
	SendMessageOptions,
	SendUserMessageOptions,
} from "@nseng-ai/pi/shared/message-delivery";
import type { PrAddressRunner } from "../feedback-download.ts";

export type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

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

export interface ExtensionAPI extends RawPiExecApi {
	registerCommand(name: string, options: RegisteredCommand): void;
	on(
		event: "session_start",
		handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void,
	): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	sendUserMessage?(content: string, options?: SendUserMessageOptions): void;
	sendMessage?(message: CustomMessage, options?: SendMessageOptions): void;
	appendEntry?(customType: string, data?: unknown): void;
}

export type { ExecGateway } from "@nseng-ai/pi/shared/exec-gateway";
export type { RawPiExecOptions, RawPiExecResult };

export interface PrFeedbackWatchExtensionOptions {
	runner?: PrAddressRunner;
	minimumIntervalMs?: number;
	timers?: TimerScheduler;
}

export interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	abortController: AbortController;
	harnessSessionId: string;
	isClosed: boolean;
}
