import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { commandSucceeded, formatShellArg, type ExecResult } from "@nseng-ai/foundation/exec";
import { z } from "zod";

import type { FileSystemGateway, NsDevCliContext } from "./context.ts";

const MAX_OUTPUT_SNIPPET_CHARS = 2_000;

export const commandSummarySchema = z.object({
	command: z.string(),
	args: z.array(z.string()),
	cwd: z.string(),
	exitCode: z.number().int(),
});

export const commandFailureDataSchema = z.object({
	command: z.string(),
	args: z.array(z.string()),
	cwd: z.string(),
	exitCode: z.number().int(),
	killed: z.boolean(),
	stdout: z.string(),
	stderr: z.string(),
	startupError: z.string().optional(),
});

export interface CommandSummary {
	readonly command: string;
	readonly args: string[];
	readonly cwd: string;
	readonly exitCode: number;
}

export interface CommandFailureData extends CommandSummary {
	readonly killed: boolean;
	readonly stdout: string;
	readonly stderr: string;
	readonly startupError?: string;
}

export type CommandRunResult =
	| { readonly type: "ok"; readonly summary: CommandSummary; readonly result: ExecResult }
	| { readonly type: "failed"; readonly message: string; readonly data: CommandFailureData };

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
): Promise<
	| { readonly type: "ok"; readonly value: Record<string, unknown> }
	| { readonly type: "error"; readonly message: string }
> {
	try {
		const parsed: unknown = JSON.parse(await fs.readText(path));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return { type: "error", message: `Expected ${path} to contain a JSON object.` };
		}
		return { type: "ok", value: parsed as Record<string, unknown> };
	} catch (error) {
		return {
			type: "error",
			message: `Could not read JSON from ${path}: ${formatErrorMessage(error)}`,
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

export async function runTrackedCommand(
	context: NsDevCliContext,
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<CommandRunResult> {
	context.status?.(`ns-dev: running ${formatCommandForHumans(command, args)} in ${cwd}\n`);
	const result = await context.runCommand(command, args, { cwd, env: context.env });
	const summary: CommandSummary = { command, args: [...args], cwd, exitCode: result.code };
	if (commandSucceeded(result)) return { type: "ok", summary, result };
	const data: CommandFailureData = {
		...summary,
		killed: result.killed,
		stdout: snippet(result.stdout),
		stderr: snippet(result.stderr),
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	};
	return {
		type: "failed",
		message: `Command failed: ${formatCommandForHumans(command, args)} (${formatFailure(result)})`,
		data,
	};
}

export async function newestTarball(
	fs: FileSystemGateway,
	packDir: string,
	sinceMs: number,
): Promise<
	| { readonly type: "ok"; readonly path: string }
	| { readonly type: "error"; readonly message: string }
> {
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
	return { type: "ok", path: newest.path };
}

export async function collectPackageDirs(
	fs: FileSystemGateway,
	root: string,
): Promise<readonly string[]> {
	const matches: string[] = [];
	await collectPackageDirsAt(fs, root, matches, 0);
	return matches;
}

export function packagePathIsLocalPackage(nsWorktree: string, packagePath: string): boolean {
	const packagesRoot = join(nsWorktree, "ts", "packages");
	const relativePath = relative(packagesRoot, packagePath).replaceAll("\\", "/");
	return !relativePath.startsWith("../") && relativePath !== ".." && relativePath !== "";
}

export function tarballName(path: string): string {
	return basename(path);
}

function formatCommandForHumans(command: string, args: readonly string[]): string {
	return [command, ...args].map(formatShellArg).join(" ");
}

function formatFailure(result: ExecResult): string {
	const detail = result.stderr.trim() || result.stdout.trim();
	if (detail !== "") return `exit ${result.code}: ${snippet(detail)}`;
	return `exit ${result.code}${result.killed ? ", killed" : ""}`;
}

function snippet(text: string): string {
	if (text.length <= MAX_OUTPUT_SNIPPET_CHARS) return text;
	return text.slice(-MAX_OUTPUT_SNIPPET_CHARS);
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function collectPackageDirsAt(
	fs: FileSystemGateway,
	current: string,
	matches: string[],
	depth: number,
): Promise<void> {
	if (depth > 4) return;
	if (await fs.exists(join(current, "package.json"))) {
		matches.push(current);
		return;
	}
	let entries: readonly { readonly name: string; readonly isDirectory: boolean }[];
	try {
		entries = await fs.readDir(current);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.isDirectory || entry.name === "node_modules" || entry.name === "dist") continue;
		await collectPackageDirsAt(fs, join(current, entry.name), matches, depth + 1);
	}
}
