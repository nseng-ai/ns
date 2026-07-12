import type { ExecResult } from "@nseng-ai/foundation/exec";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export type { ExecResult } from "@nseng-ai/foundation/exec";

import type { ClinkrFormat, RenderCapabilities } from "./command.ts";
import type { NsCommandIo, NsProgress } from "./services.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface NsExecOptions {
	timeoutMs?: number;
	cwd?: ExplicitUndefined<"public-api-compatibility", string>;
	stdin?: ExplicitUndefined<"public-api-compatibility", string>;
	onStdout?: ExplicitUndefined<"public-api-compatibility", (text: string) => void>;
	onStderr?: ExplicitUndefined<"public-api-compatibility", (text: string) => void>;
}

export type NsOutputStream = "stdout" | "stderr";
export interface NsConfirmOptions {
	defaultAnswer?: "yes" | "no";
}

export type NsConfirmPrompt = (
	title: string,
	message: string,
	options?: NsConfirmOptions,
) => Promise<boolean> | boolean;

export interface NsExtensionApi {
	/** Current repository working directory for command-entry execution. */
	cwd: string;
	/** Environment visible to ns commands and shell execution. */
	env: Record<string, string | undefined>;
	/**
	 * Compatibility ingress for a host-resolved user home, when available.
	 * Command packages should adapt this into domain-specific contexts instead of treating it as the
	 * owner of harness path or XDG discovery semantics.
	 */
	homeDir?: string;
	/** Whether an extension package is present in the effective ns extension registry. */
	hasExtension(packageName: string): boolean;
	/** Low-level argv execution hook. Project commands own the exact commands they run. */
	exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult>;
	/** Text-generation capability; ns commands own prompts, validation, and repair policy. */
	textGenerator: TextGenerator;
	/** Higher-level human command-output service provided by the SDK host. */
	commandIo: NsCommandIo;
	/** Structured phase progress sink provided by the SDK host. */
	progress: NsProgress;
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
		(stream: NsOutputStream, text: string) => void
	>;
	/** Optional UI confirmation hook for interactive ns commands. */
	confirm?: ExplicitUndefined<"public-api-compatibility", NsConfirmPrompt>;
	/** Project-local extension bag. ns commands own any values they read from it. */
	extensions?: ExplicitUndefined<"public-api-compatibility", Readonly<Record<string, unknown>>>;
}
