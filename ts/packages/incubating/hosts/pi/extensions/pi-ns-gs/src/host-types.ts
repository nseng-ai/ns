import type { RawPiExecOptions, RawPiExecResult } from "@nseng-ai/pi-runtime/shared/command-exec";
import type {
	SessionReplacementContext,
	SessionReplacementOptions,
	SessionReplacementResult,
} from "@nseng-ai/pi-runtime/sessions/replacement";

export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
	newSession?(
		options?: SessionReplacementOptions<
			CommandContext &
				SessionReplacementContext & { sendUserMessage(content: string): Promise<void> | void },
			{ getBranch?(): unknown[]; getSessionFile?(): string | undefined }
		>,
	): Promise<SessionReplacementResult>;
	sessionManager?: { getBranch?(): unknown[]; getSessionFile?(): string | undefined };
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: RawPiExecOptions): Promise<RawPiExecResult>;
	sendMessage?(message: {
		customType: string;
		content: string;
		display: boolean;
		details?: unknown;
	}): void;
}
