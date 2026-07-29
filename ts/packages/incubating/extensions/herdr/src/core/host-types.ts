import type { CommandExecApi } from "@nseng-ai/foundation/command";

export type HerdrNotifyLevel = "info" | "warning" | "error" | "success";
export type HerdrThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface HerdrModelInfo {
	readonly provider: string;
	readonly id: string;
}

export interface HerdrInteraction {
	readonly hasUI?: boolean;
	readonly ui: {
		notify(message: string, level?: HerdrNotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
		confirm?(title: string, message: string): Promise<boolean>;
		input?(title: string, placeholder?: string): Promise<string | undefined>;
		select?(title: string, items: string[]): Promise<string | undefined>;
		setEditorText?(value: string): void;
	};
}

export interface HerdrCommandContext extends HerdrInteraction {
	readonly cwd: string;
	readonly model?: HerdrModelInfo;
	readonly modelRegistry: {
		find(provider: string, modelId: string): HerdrModelInfo | undefined;
	};
	readonly sessionManager: {
		getBranch(): ReadonlyArray<{ readonly type: string; readonly [field: string]: unknown }>;
	};
	waitForIdle(): Promise<void>;
}

export interface HerdrCommandApi extends CommandExecApi {
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			handler(args: string, context: HerdrCommandContext): Promise<void> | void;
		},
	): void;
	on(
		event: "agent_end",
		handler: (event: unknown, context: HerdrInteraction) => Promise<void> | void,
	): void;
	getThinkingLevel(): HerdrThinkingLevel;
	sendUserMessage(content: string): void;
	sendMessage?(message: {
		customType: string;
		content: string | Array<{ type: "text"; text: string }>;
		display: boolean;
		details?: unknown;
	}): void;
}

export interface HerdrLaunchProfile {
	readonly model?: HerdrModelInfo;
	readonly thinkingLevel: HerdrThinkingLevel;
}

export type HerdrLaunchCommandBuilder = (prompt: string, profile: HerdrLaunchProfile) => string;
export type HerdrLaunchProfileResolver = (
	commands: HerdrCommandApi,
	context: HerdrCommandContext,
) => HerdrLaunchProfile;
