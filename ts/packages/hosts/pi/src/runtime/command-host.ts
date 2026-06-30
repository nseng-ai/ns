import type { ModelInfo } from "../runtime/types.ts";
import type { ExplicitUndefined } from "@sdl/core/primitives";

export interface PiCommandContext {
	cwd: string;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
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
