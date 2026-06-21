export interface PiCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
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
