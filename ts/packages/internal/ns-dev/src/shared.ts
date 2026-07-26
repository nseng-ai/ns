import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { failure, type ClinkrExit } from "@nseng-ai/clinkr";
import {
	commandSucceeded,
	formatCommand,
	formatCommandDetails,
	tailText,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	MAX_PACKAGE_TREE_WALK_DEPTH,
	type FileSystemGateway,
	type NsDevCliContext,
} from "./context.ts";

const MAX_OUTPUT_SNIPPET_CHARS = 2_000;

export type NsDevResult<T> =
	| { readonly type: "ok"; readonly value: T }
	| { readonly type: "error"; readonly message: string };

export const commandRefSchema = z.object({
	command: z.string(),
	args: z.array(z.string()),
	cwd: z.string(),
});
export type CommandRef = z.output<typeof commandRefSchema>;

export const commandSummarySchema = commandRefSchema.extend({
	exitCode: z.number().int().nullable(),
});
export type CommandSummary = z.output<typeof commandSummarySchema>;

export const commandFailureDataSchema = commandSummarySchema.extend({
	termination: z.enum(["exited", "spawn-failed", "cancelled", "timed-out"]),
	signal: z.string().nullable().optional(),
	stdout: z.string(),
	stderr: z.string(),
	error: z.string().optional(),
});
export type CommandFailureData = z.output<typeof commandFailureDataSchema>;

export interface RunTrackedCommandRequest {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

export type CommandRunResult =
	| { readonly type: "ok"; readonly summary: CommandSummary; readonly result: ExecResult }
	| {
			readonly type: "failed";
			readonly message: string;
			readonly data: CommandFailureData;
			readonly summary: CommandSummary;
	  };

export async function runTrackedCommand(
	context: NsDevCliContext,
	request: RunTrackedCommandRequest,
): Promise<CommandRunResult> {
	const displayCommand = formatCommand(request.command, request.args);
	context.status?.(`ns-dev: running ${displayCommand} in ${request.cwd}\n`);
	const result = await context.runCommand(request.command, request.args, {
		cwd: request.cwd,
		env: context.env,
	});
	const summary: CommandSummary = {
		...commandRefFrom(request),
		exitCode: result.type === "spawn-failed" ? null : result.code,
	};
	if (commandSucceeded(result)) return { type: "ok", summary, result };
	const data: CommandFailureData = {
		...summary,
		termination: result.type,
		...(result.type === "spawn-failed" ? {} : { signal: result.signal }),
		stdout: snippet(result.stdout),
		stderr: snippet(result.stderr),
		...(result.type === "spawn-failed" ? { error: result.error } : {}),
	};
	const details = formatCommandDetails(result);
	return {
		type: "failed",
		message: `Command failed: ${displayCommand} (${details})`,
		data,
		summary,
	};
}

export function trackedCommandFailureExit(
	failureResult: Extract<CommandRunResult, { type: "failed" }>,
	options: { errorType?: string; extraData?: Record<string, unknown> } = {},
): ClinkrExit<never> {
	return failure(options.errorType ?? "subprocess-failed", failureResult.message, {
		...failureResult.data,
		...(options.extraData ?? {}),
	});
}

export function nsCliPackageRoot(nsWorktree: string): string {
	return join(nsWorktree, "ts", "packages", "hosts", "ns");
}

export function nsCliPublishPath(nsWorktree: string): string {
	return join(nsCliPackageRoot(nsWorktree), "dist", "publish");
}

export async function packLocalNsPackage(
	context: NsDevCliContext,
	nsWorktree: string,
): Promise<CommandRunResult> {
	return runTrackedCommand(context, {
		command: "pnpm",
		args: ["--dir", join(nsWorktree, "ts"), "--filter", "@nseng-ai/ns", "run", "pack:local"],
		cwd: nsWorktree,
	});
}

export async function installNsPublishPackage(
	context: NsDevCliContext,
	options: { readonly nsWorktree: string; readonly targetPath: string },
): Promise<CommandRunResult> {
	return runTrackedCommand(context, {
		command: "npm",
		args: ["install", "--save-dev", nsCliPublishPath(options.nsWorktree)],
		cwd: options.targetPath,
	});
}

export async function guardFilesystemErrors<T>(
	run: () => Promise<ClinkrExit<T>>,
): Promise<ClinkrExit<T>> {
	try {
		return await run();
	} catch (error) {
		return failure("filesystem-error", "Filesystem operation failed.", {
			message: formatUnknownError(error),
		});
	}
}

export function commandRefFrom(ref: {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd: string;
}): CommandRef {
	return { command: ref.command, args: [...ref.args], cwd: ref.cwd };
}

export function expandHome(path: string, homeDir: string): string {
	if (path === "~") return homeDir;
	if (path.startsWith("~/")) return join(homeDir, path.slice(2));
	return path;
}

export function resolvePath(path: string, options: { cwd: string; homeDir: string }): string {
	const expanded = expandHome(path, options.homeDir);
	return isAbsolute(expanded) ? resolve(expanded) : resolve(options.cwd, expanded);
}

export async function readJsonObject(
	fs: FileSystemGateway,
	path: string,
): Promise<NsDevResult<Record<string, unknown>>> {
	try {
		const parsed: unknown = JSON.parse(await fs.readText(path));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return { type: "error", message: `Expected ${path} to contain a JSON object.` };
		}
		return { type: "ok", value: parsed as Record<string, unknown> };
	} catch (error) {
		return {
			type: "error",
			message: `Could not read JSON from ${path}: ${formatUnknownError(error)}`,
		};
	}
}

export function stringField(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	return typeof field === "string" ? field : undefined;
}

export function scriptField(value: Record<string, unknown>, key: string): string | undefined {
	const scripts = value.scripts;
	if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) return undefined;
	const script = (scripts as Record<string, unknown>)[key];
	return typeof script === "string" ? script : undefined;
}

export async function readVerifiedNsPackage(
	fs: FileSystemGateway,
	path: string,
): Promise<NsDevResult<{ readonly name: "@nseng-ai/ns"; readonly version: string }>> {
	const packageJson = await readJsonObject(fs, path);
	if (packageJson.type === "error") return packageJson;
	const name = stringField(packageJson.value, "name");
	const version = stringField(packageJson.value, "version");
	if (name !== "@nseng-ai/ns") {
		return {
			type: "error",
			message: `Expected ${path} to be @nseng-ai/ns, found ${name ?? "<missing>"}.`,
		};
	}
	if (version === undefined) {
		return { type: "error", message: `Expected ${path} to contain version.` };
	}
	return { type: "ok", value: { name, version } };
}

export async function newestTarball(
	fs: FileSystemGateway,
	packDir: string,
	sinceMs: number,
): Promise<NsDevResult<string>> {
	const entries = await fs.readDir(packDir);
	const tarballs = entries.filter((entry) => entry.isFile && entry.name.endsWith(".tgz"));
	if (tarballs.length === 0) return { type: "error", message: `No .tgz generated in ${packDir}.` };
	const withTimes = await Promise.all(
		tarballs.map(async (entry) => {
			const path = join(packDir, entry.name);
			return { path, mtimeMs: await fs.mtimeMs(path) };
		}),
	);
	withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs);
	const newest = withTimes[0];
	if (newest === undefined) return { type: "error", message: `No .tgz generated in ${packDir}.` };
	if (newest.mtimeMs + 1_000 < sinceMs) {
		return { type: "error", message: `Newest tarball in ${packDir} appears stale: ${newest.path}` };
	}
	return { type: "ok", value: newest.path };
}

export async function collectPackageDirs(
	fs: FileSystemGateway,
	root: string,
): Promise<readonly string[]> {
	return collectPackageDirsAt(fs, root, 0);
}

export function packagePathIsLocalPackage(nsWorktree: string, packagePath: string): boolean {
	const packagesRoot = join(nsWorktree, "ts", "packages");
	const relativePath = relative(packagesRoot, packagePath).replaceAll("\\", "/");
	return !relativePath.startsWith("../") && relativePath !== ".." && relativePath !== "";
}

export function tarballName(path: string): string {
	return basename(path);
}

export function formatUnknownError(error: unknown): string {
	return formatErrorMessage(error);
}

function snippet(text: string): string {
	return tailText(text, { maxChars: MAX_OUTPUT_SNIPPET_CHARS });
}

async function collectPackageDirsAt(
	fs: FileSystemGateway,
	current: string,
	depth: number,
): Promise<readonly string[]> {
	if (depth > MAX_PACKAGE_TREE_WALK_DEPTH) return [];
	if (await fs.exists(join(current, "package.json"))) return [current];
	let entries: readonly { readonly name: string; readonly isDirectory: boolean }[];
	try {
		entries = await fs.readDir(current);
	} catch {
		// Best-effort workspace package discovery skips unreadable directories.
		return [];
	}
	const matches: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory || entry.name === "node_modules" || entry.name === "dist") continue;
		matches.push(...(await collectPackageDirsAt(fs, join(current, entry.name), depth + 1)));
	}
	return matches;
}
