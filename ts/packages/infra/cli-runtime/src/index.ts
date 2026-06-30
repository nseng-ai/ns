import { readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ClinkrGroup, failure, resolveIo, type ClinkrExit, type ClinkrIo } from "@sdl/clinkr";
import { z } from "zod";

import { formatErrorMessage, type ExplicitUndefined } from "@sdl/core/primitives";

export { readStdin, readStdinLine } from "./stdin.ts";

export type CliRuntime = "typescript" | "bun";

export interface CliPackageMetadata {
	readonly packageName: string;
	readonly packagePath: string;
	readonly binName: string;
	readonly binPath: string;
	readonly version: string;
}

export interface CliEntrypointDeps {
	readonly cwd?: string | undefined;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
}

export type CliPrepareRunResult<TContext, TBuildState> =
	| { readonly type: "handled"; readonly exitCode: number }
	| {
			readonly type: "run";
			readonly context: TContext;
			readonly buildState: TBuildState;
			readonly args?: readonly string[] | undefined;
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
	readonly runIfMain: (input: {
		readonly isImportMetaMain: boolean;
		readonly argv?: readonly string[] | undefined;
	}) => Promise<void>;
}

const packageJsonSchema = z.object({
	name: z.string(),
	version: z.string(),
	bin: z.record(z.string(), z.string()).optional(),
});

/**
 * Whether this module is the process entrypoint, for runtimes where
 * `import.meta.main` is unavailable. Entrypoint footers pair the two:
 * `if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1]))`.
 */
export function isDirectCliInvocation(metaUrl: string, argvPath: string | undefined): boolean {
	if (argvPath === undefined) return false;

	try {
		const modulePath = realpathSync(fileURLToPath(metaUrl));
		const entryPath = realpathSync(resolve(argvPath));
		return modulePath === entryPath;
	} catch {
		return false;
	}
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
	const runtimeInfo = (): string =>
		`runtime: ${options.runtime}\nentry_point: ${metadata.packageName} bin ${metadata.binName} -> ts/${metadata.packagePath}/${metadata.binPath}\n`;
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
		const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
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
	const runIfMain = async (input: {
		readonly isImportMetaMain: boolean;
		readonly argv?: readonly string[] | undefined;
	}): Promise<void> => {
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

function readCliPackageMetadata(metaUrl: string): CliPackageMetadata {
	const packageJsonUrl = new URL("../package.json", metaUrl);
	const packageJsonPath = fileURLToPath(packageJsonUrl);
	let rawPackageJson: unknown;
	try {
		rawPackageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
	} catch (error) {
		throw new Error(`Unable to read CLI package metadata from ${packageJsonPath}`, {
			cause: error,
		});
	}
	const parsed = packageJsonSchema.safeParse(rawPackageJson);
	if (!parsed.success) {
		throw new Error(
			`Invalid CLI package metadata in ${packageJsonPath}: ${parsed.error.issues.map(formatZodIssue).join("; ")}`,
		);
	}
	const binEntries = Object.entries(parsed.data.bin ?? {});
	if (binEntries.length > 1) {
		throw new Error(
			`Invalid CLI package metadata in ${packageJsonPath}: expected at most one bin entry, found ${binEntries.length}`,
		);
	}
	const [binEntry] = binEntries;
	const [binName, binPath] =
		binEntry === undefined
			? [cliNameFromPackageName(parsed.data.name), "(no package bin)"]
			: [binEntry[0], normalizeBinPathForDisplay(binEntry[1])];
	return {
		packageName: parsed.data.name,
		packagePath: packagePathForDisplay(packageJsonPath),
		binName,
		binPath,
		version: parsed.data.version,
	};
}

function packagePathForDisplay(packageJsonPath: string): string {
	const packageDir = dirname(packageJsonPath);
	let candidate = packageDir;
	while (basename(candidate) !== "packages") {
		const parent = dirname(candidate);
		if (parent === candidate) return `packages/${basename(packageDir)}`;
		candidate = parent;
	}
	return relative(dirname(candidate), packageDir);
}

function normalizeBinPathForDisplay(binPath: string): string {
	return binPath.startsWith("./") ? binPath.slice(2) : binPath;
}

function cliNameFromPackageName(packageName: string): string {
	return packageName.split("/").at(-1) ?? packageName;
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
	return `${path}: ${issue.message}`;
}
