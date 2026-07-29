import process from "node:process";

import type { ClinkrContextfulApp } from "@nseng-ai/clinkr/app";

import { optionalEntry, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

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

/**
 * Define a package-backed modern Clinkr application lifecycle.
 *
 * When output overrides are supplied, `run` deliberately intercepts the
 * process stdout/stderr writers while awaiting the app. The modern `ClinkrApp`
 * intentionally has no in-process I/O seam yet; see the
 * `clinkr-readme-driven-development` Objective's runtime/SDK-host contract.
 * Override-backed runs must remain sequential until Clinkr threads output
 * writers through `ClinkrRunOptions`, at which point this interception should
 * be deleted rather than fixed opportunistically here.
 */
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
			const app = buildApp(prepareResult.buildState);
			return await runWithOutputOverrides(
				app,
				prepareResult.args ?? args,
				prepareResult.context,
				deps,
			);
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

async function runWithOutputOverrides<TContext, TDeps extends ClinkrAppCliEntrypointDeps>(
	app: ClinkrContextfulApp<TContext>,
	args: readonly string[],
	context: TContext,
	deps: ClinkrAppCliRunDeps<TDeps>,
): Promise<number> {
	const originalStdoutWrite = process.stdout.write;
	const originalStderrWrite = process.stderr.write;
	const interceptStdout = deps.stdout !== undefined;
	const interceptStderr = deps.stderr !== undefined;
	if (interceptStdout)
		process.stdout.write = sinkWriter(deps.stdout) as typeof process.stdout.write;
	if (interceptStderr)
		process.stderr.write = sinkWriter(deps.stderr) as typeof process.stderr.write;
	try {
		return await app.run(args, {
			context,
			readStdin: deps.readStdin ?? readStdin,
			...optionalEntry("canEmitAnsi", deps.canEmitAnsi),
		});
	} finally {
		if (interceptStdout) process.stdout.write = originalStdoutWrite;
		if (interceptStderr) process.stderr.write = originalStderrWrite;
	}
}

function writeProcessStdout(text: string): void {
	process.stdout.write(text);
}

function writeProcessStderr(text: string): void {
	process.stderr.write(text);
}

function sinkWriter(sink: (text: string) => void) {
	return (chunk: string | Uint8Array): boolean => {
		sink(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	};
}
