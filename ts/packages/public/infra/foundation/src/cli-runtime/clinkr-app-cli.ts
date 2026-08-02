import process from "node:process";

import type { ClinkrContextfulApp } from "@nseng-ai/clinkr/app";
import { withInterceptedProcessWriters } from "@nseng-ai/clinkr/app/process-writer-interception";

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

/**
 * Define a package-backed modern Clinkr application lifecycle.
 *
 * When output overrides are supplied, `run` uses guarded process-global
 * writer interception. Override-backed runs must be awaited sequentially;
 * overlap fails before changing a process writer.
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
	const runApp = async () =>
		await app.run(args, {
			context,
			readStdin: deps.readStdin ?? readStdin,
			...optionalEntry("canEmitAnsi", deps.canEmitAnsi),
		});
	if (deps.stdout === undefined && deps.stderr === undefined) return await runApp();
	return await withInterceptedProcessWriters(
		optionalEntries({ stdout: deps.stdout, stderr: deps.stderr }),
		runApp,
	);
}

function writeProcessStdout(text: string): void {
	process.stdout.write(text);
}

function writeProcessStderr(text: string): void {
	process.stderr.write(text);
}
