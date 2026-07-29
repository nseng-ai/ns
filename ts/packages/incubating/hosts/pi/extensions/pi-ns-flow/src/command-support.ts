import type { AutocompleteItem } from "@nseng-ai/pi-runtime/runtime/extension-types";

export interface FlowCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		select?(title: string, options: string[]): Promise<string | undefined> | string | undefined;
	};
	waitForIdle?(): Promise<void>;
}

export interface FlowRegisteredCommand<TContext extends FlowCommandContext = FlowCommandContext> {
	description?: string;
	argumentHint?: string;
	getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
	handler(args: string, ctx: TContext): Promise<void> | void;
}
