import type { ExplicitUndefined } from "@ji/core/primitives";

import type { ClinkrFormat, RenderCapabilities } from "./command.ts";
import type { SdlCommandIo, SdlProgress } from "./services.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError?: string;
}

export interface SdlExecOptions {
	timeoutMs?: number;
	stdin?: ExplicitUndefined<"public-api-compatibility", string>;
	onStdout?: ExplicitUndefined<"public-api-compatibility", (text: string) => void>;
	onStderr?: ExplicitUndefined<"public-api-compatibility", (text: string) => void>;
}

export type SdlOutputStream = "stdout" | "stderr";
export interface SdlConfirmOptions {
	defaultAnswer?: "yes" | "no";
}

export type SdlConfirmPrompt = (
	title: string,
	message: string,
	options?: SdlConfirmOptions,
) => Promise<boolean> | boolean;

export interface SdlExtensionApi {
	/** Current repository working directory for command-entry execution. */
	cwd: string;
	/** Environment visible to SDL commands and shell execution. */
	env: Record<string, string | undefined>;
	/** Low-level argv execution hook. Project commands own the exact commands they run. */
	exec(command: string, args: string[], options?: SdlExecOptions): Promise<ExecResult>;
	/** Text-generation capability; SDL commands own prompts, validation, and repair policy. */
	textGenerator: TextGenerator;
	/** Higher-level human command-output service provided by the host/kernel. */
	commandIo: SdlCommandIo;
	/** Structured phase progress sink provided by the host/kernel. */
	progress: SdlProgress;
	/** Host terminal rendering capabilities for human output and previews. */
	renderCapabilities: RenderCapabilities;
	/** Host-selected command output format. Useful only for commands streaming durable output before returning. */
	outputFormat?: ClinkrFormat;
	/** Durable output for commands that need to stream multiple chunks before returning. */
	stdout?: ExplicitUndefined<"public-api-compatibility", (text: string) => void>;
	/** Durable error output for commands that need to stream multiple chunks before returning. */
	stderr?: ExplicitUndefined<"public-api-compatibility", (text: string) => void>;
	/** Optional full stdin reader for commands that consume a finite payload. */
	stdin?: ExplicitUndefined<"public-api-compatibility", () => Promise<string>>;
	/** Transient live-progress output for UI bridges. */
	onOutput?: ExplicitUndefined<
		"public-api-compatibility",
		(stream: SdlOutputStream, text: string) => void
	>;
	/** Optional UI confirmation hook for interactive SDL commands. */
	confirm?: ExplicitUndefined<"public-api-compatibility", SdlConfirmPrompt>;
	/** Project-local extension bag. SDL commands own any values they read from it. */
	extensions?: ExplicitUndefined<"public-api-compatibility", Readonly<Record<string, unknown>>>;
}
