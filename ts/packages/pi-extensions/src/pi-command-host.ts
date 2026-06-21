import type { ModelInfo } from "./cmux/types.ts";
import type { RunnerSubagentPi } from "./runner-subagent.ts";

export interface PiCommandContext {
	cwd: string;
	signal?: AbortSignal | undefined;
	model?: ModelInfo | undefined;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
	waitForIdle(): Promise<void>;
}

export interface PiCommandRegistration {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: PiCommandContext): Promise<void> | void;
}

export interface PiCommandHost extends RunnerSubagentPi {
	registerCommand(name: string, options: PiCommandRegistration): void;
	sendUserMessage(content: string): Promise<void> | void;
}
