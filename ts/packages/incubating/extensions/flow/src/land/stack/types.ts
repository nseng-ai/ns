import type { ExecResult } from "@nseng-ai/foundation/command";
import type { NsConfirmOptions, NsSelectPrompt } from "@nseng-ai/sdk";
import type { NotifyLevel } from "../types.ts";

export type { NotifyLevel } from "../types.ts";

export interface LandProgressReporter {
	readonly note: (message: string) => void;
	readonly setStatus: (message: string | undefined) => void;
}

/**
 * Visual intent of a land result block (house-style §3/§4/§7.3). Distinct from `NotifyLevel`, which
 * owns stdout/stderr routing and exit-code flipping: a declined guardrail renders `refusal` (warn)
 * even when it is notified at `error` level to flip the exit code.
 */
export type LandResultKind = "success" | "refusal" | "failure";

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface PrintOutput {
	write(chunk: string): unknown;
}

export interface LandStackCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string, options?: NsConfirmOptions): Promise<boolean>;
		select?: NsSelectPrompt;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
	waitForIdle(): Promise<void>;
}

export interface PrintAwareLandStackCommandContext extends LandStackCommandContext {
	mode?: ExtensionMode;
	printOutput?: PrintOutput;
}

export interface LandExecutionApi {
	message?(text: string, options?: { details?: unknown }): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export interface ParsedArgs {
	shouldSkipConfirmation: boolean;
	isDryRun: boolean;
	shouldFreeSlot: boolean;
	shouldContinueUpstack: boolean;
	shouldShowHelp: boolean;
	shouldStreamVerboseOutput: boolean;
}

export interface CommandStreamPrLink {
	number: number;
	url: string;
}

export interface CommandInvocation {
	readonly command: string;
	readonly args: readonly string[];
	readonly display: string;
}

export interface CommandStreamMessageDetails {
	prLinks: CommandStreamPrLink[];
}

export interface CommandStreamFinish {
	result: ExecResult;
	note?: string;
}
