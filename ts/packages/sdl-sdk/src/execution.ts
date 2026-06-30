import type { RenderCapabilities } from "./command.ts";
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
	stdin?: string | undefined;
	onStdout?: ((text: string) => void) | undefined;
	onStderr?: ((text: string) => void) | undefined;
}

export type SdlOutputStream = "stdout" | "stderr";
export type SdlConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

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
	/** Durable output for commands that need to stream multiple chunks before returning. */
	stdout?: ((text: string) => void) | undefined;
	/** Durable error output for commands that need to stream multiple chunks before returning. */
	stderr?: ((text: string) => void) | undefined;
	/** Optional full stdin reader for commands that consume a finite payload. */
	stdin?: (() => Promise<string>) | undefined;
	/** Transient live-progress output for UI bridges. */
	onOutput?: ((stream: SdlOutputStream, text: string) => void) | undefined;
	/** Optional UI confirmation hook for interactive SDL commands. */
	confirm?: SdlConfirmPrompt | undefined;
	/** Project-local extension bag. SDL commands own any values they read from it. */
	extensions?: Readonly<Record<string, unknown>> | undefined;
}
