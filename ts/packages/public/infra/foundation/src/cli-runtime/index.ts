import process from "node:process";

import { ClinkrGroup, resolveIo, type ClinkrIo } from "@nseng-ai/clinkr";
import { failure, type ClinkrExit, type RenderCapabilities } from "@nseng-ai/clinkr/legacy";
import {
	formatErrorMessage,
	optionalEntries,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";

import { isDirectCliInvocation } from "./direct-invocation.ts";
import {
	createCliRuntimeInfo,
	readCliPackageMetadata,
	type CliPackageMetadata,
	type CliRuntime,
} from "./package-metadata.ts";

export { defineClinkrAppCli } from "./clinkr-app-cli.ts";
export type {
	ClinkrAppCliBuildInput,
	ClinkrAppCliEntrypointDeps,
	ClinkrAppCliPrepareRunInput,
	ClinkrAppCliPrepareRunResult,
	ClinkrAppCliRunDeps,
	ClinkrAppCliRunErrorInput,
	ClinkrAppCliRunIfMainInput,
	DefinedClinkrAppCli,
	DefineClinkrAppCliOptions,
} from "./clinkr-app-cli.ts";
export { isDirectCliInvocation } from "./direct-invocation.ts";
export type { CliPackageMetadata, CliRuntime } from "./package-metadata.ts";
export { readJsonInput, readStdinLine } from "./stdin.ts";

export interface CliEntrypointDeps {
	readonly cwd?: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
	readonly renderCapabilities?: RenderCapabilities;
}

export interface CliRunIfMainInput {
	readonly isImportMetaMain: boolean;
	readonly argv?: readonly string[];
}

export type CliPrepareRunResult<TContext, TBuildState> =
	| { readonly type: "handled"; readonly exitCode: number }
	| {
			readonly type: "run";
			readonly context: TContext;
			readonly buildState: TBuildState;
			readonly args?: readonly string[];
	  };

export type CliRunDeps<TDeps extends CliEntrypointDeps> = Partial<TDeps> & CliEntrypointDeps;

export interface CliPrepareRunInput<TDeps extends CliEntrypointDeps> {
	readonly args: readonly string[];
	readonly deps: CliRunDeps<TDeps>;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly io: ClinkrIo;
	readonly metadata: CliPackageMetadata;
}

export interface CliRunErrorInput<TDeps extends CliEntrypointDeps> {
	readonly error: unknown;
	readonly args: readonly string[];
	readonly deps: CliRunDeps<TDeps>;
	readonly io: ClinkrIo;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly metadata: CliPackageMetadata;
}

export interface DefineCliBuildInput<TBuildState> {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly runtimeInfo: () => string;
	readonly metadata: CliPackageMetadata;
	readonly buildState: TBuildState;
}

export interface DefineCliConfigureInput<
	TContext,
	TBuildState,
> extends DefineCliBuildInput<TBuildState> {
	readonly root: ClinkrGroup<TContext>;
}

export interface DefineCliBaseOptions<TContext, TDeps extends CliEntrypointDeps, TBuildState> {
	readonly metaUrl: string;
	readonly runtime: CliRuntime;
	readonly description: string;
	readonly prepareRun: (
		input: CliPrepareRunInput<TDeps>,
	) =>
		| CliPrepareRunResult<TContext, TBuildState>
		| Promise<CliPrepareRunResult<TContext, TBuildState>>;
	readonly handleRunError?: (
		input: CliRunErrorInput<TDeps>,
	) => number | undefined | Promise<number | undefined>;
}

export interface DefineCliBuildOptions<
	TContext,
	TDeps extends CliEntrypointDeps,
	TBuildState,
> extends DefineCliBaseOptions<TContext, TDeps, TBuildState> {
	readonly buildCli: (input: DefineCliBuildInput<TBuildState>) => ClinkrGroup<TContext>;
	readonly configureCli?: never;
}

export interface DefineCliConfigureOptions<
	TContext,
	TDeps extends CliEntrypointDeps,
	TBuildState,
> extends DefineCliBaseOptions<TContext, TDeps, TBuildState> {
	readonly configureCli: (
		input: DefineCliConfigureInput<TContext, TBuildState>,
	) => ClinkrGroup<TContext> | void;
	readonly buildCli?: never;
}

export type DefineCliOptions<TContext, TDeps extends CliEntrypointDeps, TBuildState> =
	| DefineCliBuildOptions<TContext, TDeps, TBuildState>
	| DefineCliConfigureOptions<TContext, TDeps, TBuildState>;

export interface DefinedCli<TContext, TDeps extends CliEntrypointDeps, TBuildState> {
	readonly metadata: CliPackageMetadata;
	readonly version: string;
	readonly runtimeInfo: () => string;
	readonly buildCli: (buildState: TBuildState) => ClinkrGroup<TContext>;
	readonly run: (args: readonly string[], deps?: CliRunDeps<TDeps>) => Promise<number>;
	readonly runIfMain: (input: CliRunIfMainInput) => Promise<void>;
}

export async function runClinkrCommand<T>(
	errorType: string,
	operation: () => Promise<ClinkrExit<T>>,
): Promise<ClinkrExit<T>> {
	return await runOperationCommand({
		operation: errorType,
		action: operation,
		failureFromError: (operation, error) => failure(operation, formatErrorMessage(error)),
	});
}

export interface RunOperationCommandOptions<TOperation, TData> {
	readonly operation: TOperation;
	readonly action: () => Promise<ClinkrExit<TData>>;
	readonly failureFromError: (operation: TOperation, error: unknown) => ClinkrExit<never>;
}

export async function runOperationCommand<TOperation, TData>(
	options: RunOperationCommandOptions<TOperation, TData>,
): Promise<ClinkrExit<TData>> {
	try {
		return await options.action();
	} catch (error) {
		return options.failureFromError(options.operation, error);
	}
}

export function defineCli<
	TContext,
	TDeps extends CliEntrypointDeps = CliEntrypointDeps,
	TBuildState = undefined,
>(
	options: DefineCliOptions<TContext, TDeps, TBuildState>,
): DefinedCli<TContext, TDeps, TBuildState> {
	const metadata = readCliPackageMetadata(options.metaUrl);
	const runtimeInfo = createCliRuntimeInfo(options.runtime, metadata);
	const buildCli = (buildState: TBuildState): ClinkrGroup<TContext> => {
		const buildInput = {
			name: metadata.binName,
			description: options.description,
			version: metadata.version,
			runtimeInfo,
			metadata,
			buildState,
		};
		if (options.buildCli !== undefined) return options.buildCli(buildInput);
		const root = new ClinkrGroup<TContext>({
			name: buildInput.name,
			description: buildInput.description,
			version: buildInput.version,
			runtimeInfo: buildInput.runtimeInfo,
		});
		return options.configureCli({ ...buildInput, root }) ?? root;
	};
	const run = async (args: readonly string[], deps: CliRunDeps<TDeps> = {}): Promise<number> => {
		const io = resolveIo({
			...optionalEntries({
				stdout: deps.stdout,
				stderr: deps.stderr,
				canEmitAnsi: deps.renderCapabilities?.canEmitAnsi,
				caps: deps.renderCapabilities?.caps,
			}),
		});
		const stdout = io.stdout;
		const stderr = io.stderr;
		try {
			const cwd = deps.cwd ?? process.cwd();
			const env = deps.env ?? process.env;
			const prepareResult = await options.prepareRun({
				args,
				deps,
				cwd,
				env,
				stdout,
				stderr,
				io,
				metadata,
			});
			if (prepareResult.type === "handled") return prepareResult.exitCode;
			return await buildCli(prepareResult.buildState).run(prepareResult.args ?? args, {
				context: prepareResult.context,
				io,
			});
		} catch (error) {
			if (options.handleRunError === undefined) throw error;
			const handledExitCode = await options.handleRunError({
				error,
				args,
				deps,
				io,
				stdout,
				stderr,
				metadata,
			});
			if (handledExitCode === undefined) throw error;
			return handledExitCode;
		}
	};
	const runIfMain = async (input: CliRunIfMainInput): Promise<void> => {
		const argv = input.argv ?? process.argv;
		if (!input.isImportMetaMain && !isDirectCliInvocation(options.metaUrl, argv[1])) return;
		process.exitCode = await run(argv.slice(2));
	};
	return {
		metadata,
		version: metadata.version,
		runtimeInfo,
		buildCli,
		run,
		runIfMain,
	};
}
