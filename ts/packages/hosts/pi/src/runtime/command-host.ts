import type { ModelInfo } from "../runtime/types.ts";

export interface PiCommandContext {
	cwd: string;
	// optional-undefined-objective: preserve (abort-signal) — Host-provided AbortSignal cancellation seam on the command context contract; abort is an explicit preserve category.
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

export interface PiCommandHost {
	registerCommand(name: string, options: PiCommandRegistration): void;
	sendUserMessage(content: string): Promise<void> | void;
}
