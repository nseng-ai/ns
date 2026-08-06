import process from "node:process";
import { TextDecoder } from "node:util";

import type { ClinkrContextfulApp } from "@nseng-ai/clinkr/app";
import type { ClinkrRawOutput } from "@nseng-ai/clinkr/raw";

import {
	optionalEntries,
	optionalEntry,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";

import { isDirectCliInvocation } from "./direct-invocation.ts";
import { readStdin } from "./stdin.ts";
import {
	createCliRuntimeInfo,
	readCliPackageMetadata,
	type CliPackageMetadata,
	type CliRuntime,
} from "./package-metadata.ts";

export interface ClinkrAppCliEntrypointDeps {
	readonly cwd?: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
	readonly readStdin?: () => Promise<string>;
	readonly canEmitAnsi?: boolean;
}

export type ClinkrAppCliRunDeps<TDeps extends ClinkrAppCliEntrypointDeps> = Partial<TDeps> &
	ClinkrAppCliEntrypointDeps;

export interface ClinkrAppCliRunIfMainInput {
	readonly isImportMetaMain: boolean;
	readonly argv?: readonly string[];
}

export type ClinkrAppCliPrepareRunResult<TContext, TBuildState> =
	| { readonly type: "handled"; readonly exitCode: number }
	| {
			readonly type: "run";
			readonly context: TContext;
			readonly buildState: TBuildState;
			readonly args?: readonly string[];
	  };

export interface ClinkrAppCliPrepareRunInput<TDeps extends ClinkrAppCliEntrypointDeps> {
	readonly args: readonly string[];
	readonly deps: ClinkrAppCliRunDeps<TDeps>;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly metadata: CliPackageMetadata;
}

export interface ClinkrAppCliRunErrorInput<TDeps extends ClinkrAppCliEntrypointDeps> {
	readonly error: unknown;
	readonly args: readonly string[];
	readonly deps: ClinkrAppCliRunDeps<TDeps>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly metadata: CliPackageMetadata;
}

export interface ClinkrAppCliBuildInput<TBuildState> {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly runtimeInfo: () => string;
	readonly metadata: CliPackageMetadata;
	readonly buildState: TBuildState;
}

export interface DefineClinkrAppCliOptions<
	TContext,
	TDeps extends ClinkrAppCliEntrypointDeps,
	TBuildState,
> {
	readonly metaUrl: string;
	readonly runtime: CliRuntime;
	readonly description: string;
	readonly prepareRun: (
		input: ClinkrAppCliPrepareRunInput<TDeps>,
	) =>
		| ClinkrAppCliPrepareRunResult<TContext, TBuildState>
		| Promise<ClinkrAppCliPrepareRunResult<TContext, TBuildState>>;
	readonly buildApp: (input: ClinkrAppCliBuildInput<TBuildState>) => ClinkrContextfulApp<TContext>;
	readonly handleRunError?: (
		input: ClinkrAppCliRunErrorInput<TDeps>,
	) => number | undefined | Promise<number | undefined>;
}

export interface DefinedClinkrAppCli<
	TContext,
	TDeps extends ClinkrAppCliEntrypointDeps,
	TBuildState,
> {
	readonly metadata: CliPackageMetadata;
	readonly version: string;
	readonly runtimeInfo: () => string;
	readonly buildApp: (buildState: TBuildState) => ClinkrContextfulApp<TContext>;
	readonly run: (args: readonly string[], deps?: ClinkrAppCliRunDeps<TDeps>) => Promise<number>;
	readonly runIfMain: (input: ClinkrAppCliRunIfMainInput) => Promise<void>;
}

/** Define a package-backed modern Clinkr application lifecycle. */
export function defineClinkrAppCli<
	TContext,
	TDeps extends ClinkrAppCliEntrypointDeps = ClinkrAppCliEntrypointDeps,
	TBuildState = undefined,
>(
	options: DefineClinkrAppCliOptions<TContext, TDeps, TBuildState>,
): DefinedClinkrAppCli<TContext, TDeps, TBuildState> {
	const metadata = readCliPackageMetadata(options.metaUrl);
	const runtimeInfo = createCliRuntimeInfo(options.runtime, metadata);
	function buildApp(buildState: TBuildState): ClinkrContextfulApp<TContext> {
		return options.buildApp({
			name: metadata.binName,
			description: options.description,
			version: metadata.version,
			runtimeInfo,
			metadata,
			buildState,
		});
	}
	async function run(
		args: readonly string[],
		deps: ClinkrAppCliRunDeps<TDeps> = {},
	): Promise<number> {
		const stdout = deps.stdout ?? writeProcessStdout;
		const stderr = deps.stderr ?? writeProcessStderr;
		try {
			const prepareResult = await options.prepareRun({
				args,
				deps,
				cwd: deps.cwd ?? process.cwd(),
				env: deps.env ?? process.env,
				stdout,
				stderr,
				metadata,
			});
			if (prepareResult.type === "handled") return prepareResult.exitCode;
			const rawBridge = createRawOutputBridge(deps);
			try {
				return await buildApp(prepareResult.buildState).run(prepareResult.args ?? args, {
					context: prepareResult.context,
					readStdin: deps.readStdin ?? readStdin,
					rawOutput: rawBridge.output,
					...optionalEntries({
						output:
							deps.stdout === undefined && deps.stderr === undefined
								? undefined
								: { stdout, stderr },
					}),
					...optionalEntry("canEmitAnsi", deps.canEmitAnsi),
				});
			} finally {
				rawBridge.flush();
			}
		} catch (error) {
			if (options.handleRunError === undefined) throw error;
			const exitCode = await options.handleRunError({
				error,
				args,
				deps,
				stdout,
				stderr,
				metadata,
			});
			if (exitCode === undefined) throw error;
			return exitCode;
		}
	}
	async function runIfMain(input: ClinkrAppCliRunIfMainInput): Promise<void> {
		const argv = input.argv ?? process.argv;
		if (!input.isImportMetaMain && !isDirectCliInvocation(options.metaUrl, argv[1])) return;
		process.exitCode = await run(argv.slice(2));
	}
	return { metadata, version: metadata.version, runtimeInfo, buildApp, run, runIfMain };
}

interface RawOutputBridge {
	readonly output: ClinkrRawOutput;
	readonly flush: () => void;
}

function createRawOutputBridge(deps: ClinkrAppCliEntrypointDeps): RawOutputBridge {
	const stdoutDecoder = deps.stdout === undefined ? undefined : new TextDecoder();
	const stderrDecoder = deps.stderr === undefined ? undefined : new TextDecoder();
	const output: ClinkrRawOutput = {
		writeStdout:
			stdoutDecoder === undefined
				? (bytes) => process.stdout.write(bytes)
				: (bytes) => emitDecodedText(stdoutDecoder, bytes, deps.stdout),
		writeStderr:
			stderrDecoder === undefined
				? (bytes) => process.stderr.write(bytes)
				: (bytes) => emitDecodedText(stderrDecoder, bytes, deps.stderr),
	};
	return {
		output,
		flush: () => {
			if (stdoutDecoder !== undefined) {
				const text = stdoutDecoder.decode();
				if (text !== "") deps.stdout?.(text);
			}
			if (stderrDecoder !== undefined) {
				const text = stderrDecoder.decode();
				if (text !== "") deps.stderr?.(text);
			}
		},
	};
}

function emitDecodedText(
	decoder: TextDecoder,
	bytes: Uint8Array,
	write: ((text: string) => void) | undefined,
): void {
	const text = decoder.decode(bytes, { stream: true });
	if (text !== "") write?.(text);
}

function writeProcessStdout(text: string): void {
	process.stdout.write(text);
}

function writeProcessStderr(text: string): void {
	process.stderr.write(text);
}
