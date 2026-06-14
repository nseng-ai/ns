import { constants } from "node:fs";
import { access, lstat, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import type { EntryContent, EntryDiagnostic } from "../gateway.ts";
import { compareEntries, namespaceDisplayLabel, normalizeNamespaceOption, type EntryRef } from "../ref-layout.ts";
import { firstFailure, validateBranchName, validateEntryKey, validateNamespaceName, validationMessage } from "../validation.ts";
import { gatewayFailure, resolveCurrentBranch } from "./shared.ts";

const exportedEntrySchema = z.object({
	key: z.string(),
	path: z.string(),
	ref_name: z.string(),
	size_bytes: z.number().int(),
});

export const exportRequestSchema = z.object({
	namespace: z.string().optional().describe("Namespace to export. Omit for Base Namespace Entries only."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	output_dir: z.string().optional().describe("Output directory. Defaults to a fresh temporary directory."),
	overwrite: z.boolean().default(false).describe("Overwrite existing regular files at target paths."),
	dry_run: z.boolean().default(false).describe("Plan the Export without writing files."),
});

export const exportResultSchema = z.object({
	namespace: z.string(),
	branch: z.string(),
	output_dir: z.string(),
	overwrite: z.boolean(),
	dry_run: z.boolean(),
	exported: z.array(exportedEntrySchema),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportedEntry = z.infer<typeof exportedEntrySchema>;
export type ExportResult = z.infer<typeof exportResultSchema>;

interface PreparedExport {
	exportedEntry: ExportedEntry;
	targetPath: string;
	content: string;
}

type PreparationResult = { type: "ok"; prepared: readonly PreparedExport[] } | { type: "failure"; exit: ClinkrExit<ExportResult> };
type PreflightResult = { type: "ok" } | { type: "failure"; exit: ClinkrExit<ExportResult> };
type PathState = { type: "missing" } | { type: "present"; isDirectory: boolean; isFile: boolean; isSymlink: boolean } | { type: "error"; message: string };

export async function runExport(ctx: BrmemCliContext, request: ExportRequest) {
	const namespace = normalizeNamespaceOption(request.namespace);
	const requestFailure = firstFailure(
		["invalid_namespace", validationMessage("namespace", namespace, validateNamespaceName(namespace))],
		[
			"invalid_branch_name",
			request.branch === undefined ? undefined : validationMessage("branch name", request.branch, validateBranchName(request.branch)),
		],
	);
	if (requestFailure !== undefined) return failure(requestFailure[0], requestFailure[1]);

	const branchResult = request.branch ?? (await resolveCurrentBranch(ctx));
	if (typeof branchResult !== "string") return branchResult;
	const branch = branchResult;
	const branchFailure = validationMessage("branch name", branch, validateBranchName(branch));
	if (branchFailure !== undefined) return failure("invalid_branch_name", branchFailure);

	const outputDir = resolveOutputDir(request.output_dir, ctx.cwd);
	const baseResult: ExportResult = { namespace, branch, output_dir: outputDir, overwrite: request.overwrite, dry_run: request.dry_run, exported: [] };
	const entriesResult = await ctx.gateway.listEntries({ namespace, branch });
	if (entriesResult.type === "error") return gatewayFailure<ExportResult>(entriesResult.error);
	const entries = [...entriesResult.value].sort(compareEntries);
	if (entries.length === 0) return negative(emptySelectionMessage(namespace, branch), baseResult);

	const prepared = await prepareExports(ctx, entries, outputDir);
	if (prepared.type === "failure") return prepared.exit;
	const result: ExportResult = { ...baseResult, exported: prepared.prepared.map((item) => item.exportedEntry) };

	const preflight = await preflightExport(outputDir, prepared.prepared, request.overwrite);
	if (preflight.type === "failure") return preflight.exit;
	if (request.dry_run) return ok(result);

	for (const item of prepared.prepared) {
		try {
			await mkdir(resolve(item.targetPath, ".."), { recursive: true });
			await writeFile(item.targetPath, item.content, "utf8");
		} catch (error: unknown) {
			return failure("write_failed", `Failed to write ${item.targetPath}: ${errorMessage(error)}`);
		}
	}
	return ok(result);
}

export function renderExport(result: ExportResult): string {
	const verb = result.dry_run ? "Would export" : "Exported";
	const lines = [`${verb} ${selectionSummary(result.namespace, result.exported.length)} on Branch ${result.branch} to ${result.output_dir}.`];
	for (const item of result.exported) lines.push(`  ${item.key} -> ${item.path}`);
	return lines.join("\n");
}

async function prepareExports(ctx: BrmemCliContext, entries: readonly EntryRef[], outputDir: string): Promise<PreparationResult> {
	const prepared: PreparedExport[] = [];
	const seenTargets = new Map<string, string>();
	for (const entry of entries) {
		const target = targetPath(outputDir, entry.key);
		if (target.type === "failure") return { type: "failure", exit: target.exit };
		const previousKey = seenTargets.get(target.path);
		if (previousKey !== undefined) {
			return {
				type: "failure",
				exit: failure(
					"duplicate_target_path",
					`Export keys ${JSON.stringify(previousKey)} and ${JSON.stringify(entry.key)} map to the same target path: ${target.path}`,
				),
			};
		}
		seenTargets.set(target.path, entry.key);

		const diagnostic = await ctx.gateway.checkEntry({ namespace: entry.namespace, key: entry.key, branch: entry.branch });
		if (diagnostic.type === "error") return { type: "failure", exit: gatewayFailure<ExportResult>(diagnostic.error) };
		if (diagnostic.type === "missing") {
			return { type: "failure", exit: failure("entry_diagnostic_missing", `Could not inspect Branch Memory Entry ${entry.entryLocator}.`) };
		}
		const content = await ctx.gateway.getEntry({ namespace: entry.namespace, key: entry.key, branch: entry.branch });
		if (content.type === "error") return { type: "failure", exit: gatewayFailure<ExportResult>(content.error) };
		if (content.type === "missing") {
			return { type: "failure", exit: failure("entry_content_missing", `Could not read Branch Memory Entry ${entry.entryLocator}.`) };
		}
		prepared.push(buildPreparedExport(entry, target.path, diagnostic.value, content.value));
	}
	return { type: "ok", prepared };
}

function buildPreparedExport(entry: EntryRef, targetPathValue: string, diagnostic: EntryDiagnostic, content: EntryContent): PreparedExport {
	return {
		exportedEntry: {
			key: entry.key,
			path: targetPathValue,
			ref_name: entry.entryLocator,
			size_bytes: diagnostic.sizeBytes,
		},
		targetPath: targetPathValue,
		content: content.content,
	};
}

function targetPath(outputDir: string, key: string): { type: "ok"; path: string } | { type: "failure"; exit: ClinkrExit<ExportResult> } {
	const keyFailure = validationMessage("key", key, validateEntryKey(key));
	if (keyFailure !== undefined) return { type: "failure", exit: failure("invalid_key", keyFailure) };
	const parts = key.split("/");
	const unsafeSegment = parts.find((part) => part === "" || part === "." || part === "..");
	if (unsafeSegment !== undefined) {
		return { type: "failure", exit: failure("unsafe_key", `Unsafe export key ${JSON.stringify(key)}: path segment ${JSON.stringify(unsafeSegment)} is not allowed.`) };
	}
	return { type: "ok", path: join(outputDir, ...parts) };
}

async function preflightExport(outputDir: string, prepared: readonly PreparedExport[], overwrite: boolean): Promise<PreflightResult> {
	const outputDirResult = await preflightOutputDir(outputDir);
	if (outputDirResult.type === "failure") return outputDirResult;
	for (const item of prepared) {
		const parents = await preflightParentPaths(outputDir, item.targetPath);
		if (parents.type === "failure") return parents;
		const target = await preflightTargetPath(item.targetPath, overwrite);
		if (target.type === "failure") return target;
	}
	return { type: "ok" };
}

async function preflightOutputDir(outputDir: string): Promise<PreflightResult> {
	const linkState = await inspectPath(outputDir, { followSymlink: false });
	if (linkState.type === "error") return { type: "failure", exit: failure("write_failed", `Failed to inspect output directory ${outputDir}: ${linkState.message}`) };
	if (linkState.type === "missing") return { type: "ok" };
	if (linkState.isSymlink) {
		const targetExists = await pathExistsFollowingSymlink(outputDir);
		if (!targetExists) return { type: "failure", exit: failure("unsafe_output_dir", `Output directory is a broken symlink: ${outputDir}`) };
		const targetState = await inspectPath(outputDir, { followSymlink: true });
		if (targetState.type === "error") return { type: "failure", exit: failure("write_failed", `Failed to inspect output directory ${outputDir}: ${targetState.message}`) };
		if (targetState.type === "missing") return { type: "failure", exit: failure("unsafe_output_dir", `Output directory is a broken symlink: ${outputDir}`) };
		if (!targetState.isDirectory) return { type: "failure", exit: failure("output_dir_not_directory", `Output directory exists and is not a directory: ${outputDir}`) };
		return { type: "ok" };
	}
	if (!linkState.isDirectory) return { type: "failure", exit: failure("output_dir_not_directory", `Output directory exists and is not a directory: ${outputDir}`) };
	return { type: "ok" };
}

async function preflightParentPaths(outputDir: string, targetPathValue: string): Promise<PreflightResult> {
	const outputDirResolved = resolve(outputDir);
	let current = resolve(targetPathValue, "..");
	while (current !== outputDirResolved) {
		const state = await inspectPath(current, { followSymlink: false });
		if (state.type === "error") return { type: "failure", exit: failure("write_failed", `Failed to inspect parent path ${current}: ${state.message}`) };
		if (state.type === "present") {
			if (state.isSymlink) return { type: "failure", exit: failure("unsafe_parent_path", `Parent path is a symlink: ${current}`) };
			if (!state.isDirectory) return { type: "failure", exit: failure("parent_not_directory", `Parent path exists and is not a directory: ${current}`) };
		}
		const next = resolve(current, "..");
		if (next === current) break;
		current = next;
	}
	return { type: "ok" };
}

async function preflightTargetPath(targetPathValue: string, overwrite: boolean): Promise<PreflightResult> {
	const state = await inspectPath(targetPathValue, { followSymlink: false });
	if (state.type === "error") return { type: "failure", exit: failure("write_failed", `Failed to inspect target path ${targetPathValue}: ${state.message}`) };
	if (state.type === "missing") return { type: "ok" };
	if (state.isSymlink) return { type: "failure", exit: failure("unsafe_target_path", `Target path is a symlink: ${targetPathValue}`) };
	if (state.isDirectory) return { type: "failure", exit: failure("target_is_directory", `Target path is a directory: ${targetPathValue}`) };
	if (!state.isFile) return { type: "failure", exit: failure("unsafe_target_path", `Target path is not a regular file: ${targetPathValue}`) };
	if (!overwrite) return { type: "failure", exit: failure("target_exists", `Target already exists: ${targetPathValue}. Pass --overwrite to replace it.`) };
	return { type: "ok" };
}

async function inspectPath(pathValue: string, options: { followSymlink: boolean }): Promise<PathState> {
	try {
		const value = options.followSymlink ? await stat(pathValue) : await lstat(pathValue);
		return { type: "present", isDirectory: value.isDirectory(), isFile: value.isFile(), isSymlink: value.isSymbolicLink() };
	} catch (error: unknown) {
		if (isMissingPathError(error)) return { type: "missing" };
		return { type: "error", message: errorMessage(error) };
	}
}

async function pathExistsFollowingSymlink(pathValue: string): Promise<boolean> {
	try {
		await access(pathValue, constants.F_OK);
		return true;
	} catch (error: unknown) {
		if (isMissingPathError(error)) return false;
		return true;
	}
}

function resolveOutputDir(outputDir: string | undefined, cwd: string): string {
	if (outputDir === undefined) return join(tmpdir(), `brmem-export-${randomBytes(8).toString("hex")}`);
	if (isAbsolute(outputDir)) return outputDir;
	return resolve(cwd, outputDir);
}

function emptySelectionMessage(namespace: string, branch: string): string {
	if (namespace === "base") return `No base entries found on branch ${branch}.`;
	return `No entries found on branch ${branch} in namespace ${namespace}.`;
}

function selectionSummary(namespace: string, count: number): string {
	if (namespace === "base") return `${count} base ${entryWord(count)}`;
	return `${count} ${entryWord(count)} from ${namespaceDisplayLabel(namespace)}`;
}

function entryWord(count: number): string {
	return count === 1 ? "Entry" : "Entries";
}

function isMissingPathError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
