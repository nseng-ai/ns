import { readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ClinkrGroup, resolveIo, type ClinkrIo } from "@asdl/clinkr";
import { z } from "zod";

export type CliRuntime = "typescript" | "bun";

export interface CliPackageMetadata {
	readonly packageName: string;
	readonly packageDirName: string;
	readonly binName: string;
	readonly binPath: string;
	readonly version: string;
}

export interface CliEntrypointDeps {
	readonly cwd?: string | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
}

export type CliPrepareRunResult<TContext, TBuildState> =
	| { readonly type: "handled"; readonly exitCode: number }
	| {
			readonly type: "run";
			readonly context: TContext;
			readonly buildState: TBuildState;
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
	bin: z.record(z.string(), z.string()),
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

export function defineCli<
	TContext,
	TDeps extends CliEntrypointDeps = CliEntrypointDeps,
	TBuildState = undefined,
>(
	options: DefineCliOptions<TContext, TDeps, TBuildState>,
): DefinedCli<TContext, TDeps, TBuildState> {
	const metadata = readCliPackageMetadata(options.metaUrl);
	const runtimeInfo = (): string =>
		`runtime: ${options.runtime}\nentry_point: ${metadata.packageName} bin ${metadata.binName} -> ts/packages/${metadata.packageDirName}/${metadata.binPath}\n`;
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
		return await buildCli(prepareResult.buildState).run(args, {
			context: prepareResult.context,
			io,
		});
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
	const binEntries = Object.entries(parsed.data.bin);
	if (binEntries.length !== 1) {
		throw new Error(
			`Invalid CLI package metadata in ${packageJsonPath}: expected exactly one bin entry, found ${binEntries.length}`,
		);
	}
	const [binEntry] = binEntries;
	if (binEntry === undefined) {
		throw new Error(`Invalid CLI package metadata in ${packageJsonPath}: expected one bin entry`);
	}
	const [binName, packageBinPath] = binEntry;
	return {
		packageName: parsed.data.name,
		packageDirName: basename(dirname(packageJsonPath)),
		binName,
		binPath: normalizeBinPathForDisplay(packageBinPath),
		version: parsed.data.version,
	};
}

function normalizeBinPathForDisplay(binPath: string): string {
	return binPath.startsWith("./") ? binPath.slice(2) : binPath;
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
	return `${path}: ${issue.message}`;
}
