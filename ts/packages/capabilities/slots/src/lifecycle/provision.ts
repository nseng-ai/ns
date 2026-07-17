import { join } from "node:path";

import type { RepoSlotContext } from "../core/context.ts";
import { buildSlotInventory } from "../core/inventory.ts";
import {
	parseSlotsProvisionConfigToml,
	type SlotsProvisionConfigError,
} from "../core/provision-config.ts";
import type { RepoContext } from "../core/repo-context.ts";
import type { LifecycleResult } from "./common.ts";

export type ProvisionNoticeKind =
	| "config-error"
	| "missing-in-store"
	| "store-not-a-file"
	| "target-not-a-file"
	| "copy-failed";

export interface ProvisionNotice {
	kind: ProvisionNoticeKind;
	path: string | null;
	slotName: string | null;
	message: string;
}

export interface ProvisionPlacementCopy {
	slotName: string;
	path: string;
}

export interface ProvisionPlacementReport {
	copied: ProvisionPlacementCopy[];
	notices: ProvisionNotice[];
}

export interface ProvisionWorktreeTarget {
	slotName: string;
	path: string;
}

export type ProvisionApplyAction =
	| "copied"
	| "up-to-date"
	| "differs"
	| "overwritten"
	| "missing-in-store"
	| "skipped-not-a-file"
	| "error";

export interface ProvisionApplyEntry {
	slotName: string;
	path: string;
	action: ProvisionApplyAction;
	message: string | null;
}

export interface ProvisionApplyOutcome {
	entries: ProvisionApplyEntry[];
	storeRoot: string;
}

export type ProvisionImportAction =
	| "created"
	| "replaced"
	| "unchanged"
	| "missing-in-worktree"
	| "skipped-not-a-file"
	| "error";

export interface ProvisionImportEntry {
	path: string;
	action: ProvisionImportAction;
	message: string | null;
}

export interface ProvisionImportOutcome {
	entries: ProvisionImportEntry[];
	storeRoot: string;
	sourceRoot: string;
}

export type ProvisionDeclarationResult =
	| { type: "ok"; paths: readonly string[] }
	| { type: "config-error"; error: SlotsProvisionConfigError };

export type ProvisionPlacementDeclarationSnapshot =
	| ProvisionDeclarationResult
	| { type: "read-error"; message: string };

export function provisionStoreRoot(repo: RepoContext): string {
	return join(repo.repoDir, "provision", "default");
}

export async function loadProvisionDeclaration(
	ctx: RepoSlotContext,
): Promise<ProvisionDeclarationResult> {
	const source = await ctx.provisionFiles.readProjectConfigSource(ctx.repo.root);
	if (source === null) return { type: "ok", paths: [] };
	const parsed = parseSlotsProvisionConfigToml(source);
	if (!parsed.ok) return { type: "config-error", error: parsed.error };
	return { type: "ok", paths: parsed.value.provision };
}

export async function captureProvisionDeclarationForPlacement(
	ctx: RepoSlotContext,
): Promise<ProvisionPlacementDeclarationSnapshot> {
	try {
		return await loadProvisionDeclaration(ctx);
	} catch (error) {
		return { type: "read-error", message: errorMessage(error) };
	}
}

/**
 * Copy declared provision files into the given worktrees, filling gaps only:
 * an existing target file is never touched. Problems become notices; placement
 * flows must never fail because of provisioning.
 */
export async function fillProvisionGapsForPlacement(
	ctx: RepoSlotContext,
	worktrees: readonly ProvisionWorktreeTarget[],
	declarationSnapshot?: ProvisionPlacementDeclarationSnapshot,
): Promise<ProvisionPlacementReport | null> {
	const declaration = declarationSnapshot ?? (await captureProvisionDeclarationForPlacement(ctx));
	if (declaration.type === "read-error" || declaration.type === "config-error") {
		const message =
			declaration.type === "read-error" ? declaration.message : declaration.error.message;
		return {
			copied: [],
			notices: [
				{
					kind: "config-error",
					path: null,
					slotName: null,
					message,
				},
			],
		};
	}
	if (declaration.paths.length === 0) return null;
	const storeRoot = provisionStoreRoot(ctx.repo);
	const copied: ProvisionPlacementCopy[] = [];
	const notices: ProvisionNotice[] = [];
	for (const worktree of worktrees) {
		for (const relativePath of declaration.paths) {
			try {
				const notice = await fillGap(ctx, { storeRoot, worktree, relativePath });
				if (notice === null) continue;
				if (notice === "copied") {
					copied.push({ slotName: worktree.slotName, path: relativePath });
					continue;
				}
				notices.push(notice);
			} catch (error) {
				notices.push({
					kind: "copy-failed",
					path: relativePath,
					slotName: worktree.slotName,
					message: `Failed to provision ${relativePath} into ${worktree.slotName}: ${errorMessage(error)}`,
				});
			}
		}
	}
	return { copied, notices };
}

export async function applyProvisionedFiles(
	ctx: RepoSlotContext,
	options: { shouldForce: boolean },
): Promise<LifecycleResult<ProvisionApplyOutcome>> {
	const declaration = await loadProvisionDeclaration(ctx);
	if (declaration.type === "config-error") {
		return {
			type: "failure",
			failure: { errorType: declaration.error.code, message: declaration.error.message },
		};
	}
	const storeRoot = provisionStoreRoot(ctx.repo);
	if (declaration.paths.length === 0) return { type: "ok", outcome: { entries: [], storeRoot } };
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const entries: ProvisionApplyEntry[] = [];
	for (const record of inventory.records) {
		for (const relativePath of declaration.paths) {
			entries.push(
				await applyToWorktree(ctx, {
					storeRoot,
					slotName: record.slotName,
					worktreePath: record.path,
					relativePath,
					shouldForce: options.shouldForce,
				}),
			);
		}
	}
	return { type: "ok", outcome: { entries, storeRoot } };
}

export async function importProvisionedFiles(
	ctx: RepoSlotContext,
	requestedPaths: readonly string[],
): Promise<LifecycleResult<ProvisionImportOutcome>> {
	const declaration = await loadProvisionDeclaration(ctx);
	if (declaration.type === "config-error") {
		return {
			type: "failure",
			failure: { errorType: declaration.error.code, message: declaration.error.message },
		};
	}
	const declared = new Set(declaration.paths);
	for (const requestedPath of requestedPaths) {
		if (!declared.has(requestedPath)) {
			return {
				type: "failure",
				failure: {
					errorType: "not-declared",
					message: `'${requestedPath}' is not declared under [slots] provision in ns.toml.`,
				},
			};
		}
	}
	const paths = requestedPaths.length > 0 ? requestedPaths : declaration.paths;
	const storeRoot = provisionStoreRoot(ctx.repo);
	const sourceRoot = ctx.repo.root;
	const entries: ProvisionImportEntry[] = [];
	for (const relativePath of paths) {
		entries.push(await importOne(ctx, { storeRoot, sourceRoot, relativePath }));
	}
	return { type: "ok", outcome: { entries, storeRoot, sourceRoot } };
}

async function fillGap(
	ctx: RepoSlotContext,
	options: { storeRoot: string; worktree: ProvisionWorktreeTarget; relativePath: string },
): Promise<ProvisionNotice | "copied" | null> {
	const { storeRoot, worktree, relativePath } = options;
	const targetPath = join(worktree.path, relativePath);
	const targetKind = await ctx.provisionFiles.inspect(targetPath);
	if (targetKind === "file") return null;
	if (targetKind !== "missing") {
		return {
			kind: "target-not-a-file",
			path: relativePath,
			slotName: worktree.slotName,
			message: `${relativePath} in ${worktree.slotName} is a ${targetKind}, not a file; left untouched.`,
		};
	}
	const storePath = join(storeRoot, relativePath);
	const storeKind = await ctx.provisionFiles.inspect(storePath);
	if (storeKind === "missing") {
		return {
			kind: "missing-in-store",
			path: relativePath,
			slotName: worktree.slotName,
			message: `${relativePath} is declared but missing from the provision store; run \`ns slot provision import\` from a worktree that has it.`,
		};
	}
	if (storeKind !== "file") {
		return {
			kind: "store-not-a-file",
			path: relativePath,
			slotName: worktree.slotName,
			message: `Provision store entry for ${relativePath} is a ${storeKind}, not a file; skipped.`,
		};
	}
	await ctx.provisionFiles.copyIntoWorktree(storePath, targetPath);
	return "copied";
}

async function applyToWorktree(
	ctx: RepoSlotContext,
	options: {
		storeRoot: string;
		slotName: string;
		worktreePath: string;
		relativePath: string;
		shouldForce: boolean;
	},
): Promise<ProvisionApplyEntry> {
	const { storeRoot, slotName, relativePath } = options;
	const entry = (action: ProvisionApplyAction, message: string | null): ProvisionApplyEntry => ({
		slotName,
		path: relativePath,
		action,
		message,
	});
	try {
		const storePath = join(storeRoot, relativePath);
		const storeKind = await ctx.provisionFiles.inspect(storePath);
		if (storeKind === "missing") {
			return entry(
				"missing-in-store",
				"Declared but missing from the provision store; run `ns slot provision import` from a worktree that has it.",
			);
		}
		if (storeKind !== "file") {
			return entry("skipped-not-a-file", `Provision store entry is a ${storeKind}, not a file.`);
		}
		const targetPath = join(options.worktreePath, relativePath);
		const targetKind = await ctx.provisionFiles.inspect(targetPath);
		if (targetKind === "missing") {
			await ctx.provisionFiles.copyIntoWorktree(storePath, targetPath);
			return entry("copied", null);
		}
		if (targetKind !== "file") {
			return entry("skipped-not-a-file", `Worktree copy is a ${targetKind}, not a file.`);
		}
		if (await ctx.provisionFiles.contentsEqual(storePath, targetPath)) {
			return entry("up-to-date", null);
		}
		if (!options.shouldForce) {
			return entry("differs", "Differs from the store copy; pass --force to overwrite.");
		}
		await ctx.provisionFiles.copyIntoWorktree(storePath, targetPath);
		return entry("overwritten", null);
	} catch (error) {
		return entry("error", errorMessage(error));
	}
}

async function importOne(
	ctx: RepoSlotContext,
	options: { storeRoot: string; sourceRoot: string; relativePath: string },
): Promise<ProvisionImportEntry> {
	const { storeRoot, sourceRoot, relativePath } = options;
	const entry = (action: ProvisionImportAction, message: string | null): ProvisionImportEntry => ({
		path: relativePath,
		action,
		message,
	});
	try {
		const sourcePath = join(sourceRoot, relativePath);
		const sourceKind = await ctx.provisionFiles.inspect(sourcePath);
		if (sourceKind === "missing") {
			return entry("missing-in-worktree", `Not present in ${sourceRoot}; nothing imported.`);
		}
		if (sourceKind !== "file") {
			return entry("skipped-not-a-file", `Worktree copy is a ${sourceKind}, not a file.`);
		}
		const storePath = join(storeRoot, relativePath);
		const storeKind = await ctx.provisionFiles.inspect(storePath);
		if (storeKind === "file") {
			if (await ctx.provisionFiles.contentsEqual(sourcePath, storePath)) {
				return entry("unchanged", null);
			}
			await ctx.provisionFiles.copyIntoStore(sourcePath, storePath);
			return entry("replaced", null);
		}
		if (storeKind !== "missing") {
			return entry("skipped-not-a-file", `Provision store entry is a ${storeKind}, not a file.`);
		}
		await ctx.provisionFiles.copyIntoStore(sourcePath, storePath);
		return entry("created", null);
	} catch (error) {
		return entry("error", errorMessage(error));
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
