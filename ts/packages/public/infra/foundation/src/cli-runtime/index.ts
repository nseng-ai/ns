import { existsSync, readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	ClinkrApp,
	failure,
	resolveIo,
	type ClinkrAppBuilder,
	type ClinkrExit,
	type ClinkrIo,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	formatErrorMessage,
	optionalEntries,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";

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

export interface DefineCliBuildInput<TContext, TBuildState> {
	readonly appBuilder: ClinkrAppBuilder<TContext>;
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly runtimeInfo: () => string;
	readonly metadata: CliPackageMetadata;
	readonly buildState: TBuildState;
}

export interface DefineCliOptions<TContext, TDeps extends CliEntrypointDeps, TBuildState> {
	readonly metaUrl: string;
	readonly runtime: CliRuntime;
	readonly name?: string;
	readonly description: string;
	readonly prepareRun: (
		input: CliPrepareRunInput<TDeps>,
	) =>
		| CliPrepareRunResult<TContext, TBuildState>
		| Promise<CliPrepareRunResult<TContext, TBuildState>>;
	readonly buildCli: (input: DefineCliBuildInput<TContext, TBuildState>) => void | Promise<void>;
	readonly handleRunError?: (
		input: CliRunErrorInput<TDeps>,
	) => number | undefined | Promise<number | undefined>;
}

export interface DefinedCli<TContext, TDeps extends CliEntrypointDeps, TBuildState> {
	readonly metadata: CliPackageMetadata;
	readonly version: string;
	readonly runtimeInfo: () => string;
	readonly buildCli: (buildState: TBuildState) => Promise<ClinkrApp<TContext>>;
	readonly run: (args: readonly string[], deps?: CliRunDeps<TDeps>) => Promise<number>;
	readonly runIfMain: (input: CliRunIfMainInput) => Promise<void>;
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
): Promise<ClinkrExit<T | unknown>> {
	return await runOperationCommand({
		operation: errorType,
		action: operation,
		failureFromError: (operation, error) => failure(operation, formatErrorMessage(error)),
	});
}

export interface RunOperationCommandOptions<TOperation, TData, TErrorData = unknown> {
	readonly operation: TOperation;
	readonly action: () => Promise<ClinkrExit<TData>>;
	readonly failureFromError: (operation: TOperation, error: unknown) => ClinkrExit<TErrorData>;
}

export async function runOperationCommand<TOperation, TData, TErrorData = unknown>(
	options: RunOperationCommandOptions<TOperation, TData, TErrorData>,
): Promise<ClinkrExit<TData | TErrorData>> {
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
	const name = options.name ?? metadata.binName;
	const runtimeInfo = (): string =>
		`runtime: ${options.runtime}\nentry_point: ${metadata.packageName} bin ${metadata.binName} -> ts/${metadata.packagePath}/${metadata.binPath}\n`;
	const buildCli = async (buildState: TBuildState): Promise<ClinkrApp<TContext>> =>
		await ClinkrApp.create<TContext>(
			{
				name,
				moduleUrl: options.metaUrl,
				description: options.description,
				version: metadata.version,
				runtimeInfo,
			},
			async (appBuilder) => {
				await options.buildCli({
					appBuilder,
					name,
					description: options.description,
					version: metadata.version,
					runtimeInfo,
					metadata,
					buildState,
				});
				return await appBuilder.define();
			},
		);
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
			const app = await buildCli(prepareResult.buildState);
			return await app.runWithContext(prepareResult.args ?? args, {
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

function readCliPackageMetadata(metaUrl: string): CliPackageMetadata {
	const packageJsonPath = findNearestPackageJson(dirname(fileURLToPath(metaUrl)));
	let rawPackageJson: unknown;
	try {
		rawPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
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

function findNearestPackageJson(startDir: string): string {
	let candidate = startDir;
	while (true) {
		const packageJsonPath = resolve(candidate, "package.json");
		if (existsSync(packageJsonPath)) return packageJsonPath;
		const parent = dirname(candidate);
		if (parent === candidate) return resolve(startDir, "..", "package.json");
		candidate = parent;
	}
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
