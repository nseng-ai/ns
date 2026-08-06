import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
	parseExtensionSourceSpec,
	resolveDeclaredExtensionModules,
	type ExtensionAcquisitionDiagnostic,
	type ExtensionAcquisitionGateway,
	type ManagedNpmStorage,
} from "@nseng-ai/sdk/extensions/acquisition";
import { managedNpmPackagePaths } from "@nseng-ai/sdk/project-config";

import type { EnsureExtensionSourceParams } from "./extension-acquisition.ts";

export interface PrepareUserNpmUpdateParams extends EnsureExtensionSourceParams {
	readonly managedNpmStorage: ManagedNpmStorage;
}

export interface PreparedUserNpmUpdate {
	readonly storage: ManagedNpmStorage;
	readonly operationId: string;
	readonly packageName: string;
	readonly sourceSpec: string;
	readonly intent: "ensure-pinned" | "refresh-floating";
	readonly outcome: "restored" | "refreshed" | "unchanged";
	readonly canonicalExisted: boolean;
	readonly candidateModuleRoot: string;
}

export type PromotedUserNpmUpdate = PreparedUserNpmUpdate;

export interface UserNpmUpdateFailure {
	readonly type: "failed";
	readonly diagnostics: readonly ExtensionAcquisitionDiagnostic[];
	readonly retainedPaths: readonly string[];
}

export type PrepareUserNpmUpdateResult =
	| { readonly type: "prepared"; readonly prepared: PreparedUserNpmUpdate }
	| UserNpmUpdateFailure;
export type PromoteUserNpmUpdateResult =
	| { readonly type: "promoted"; readonly promoted: PromotedUserNpmUpdate }
	| UserNpmUpdateFailure;
export type SettleUserNpmUpdateResult = { readonly type: "settled" } | UserNpmUpdateFailure;

/** Consumer Gateway for the package-specific staged lifecycle of a User npm update. */
export interface UserNpmUpdateAcquisitionGateway {
	prepare(params: PrepareUserNpmUpdateParams): Promise<PrepareUserNpmUpdateResult>;
	promote(prepared: PreparedUserNpmUpdate): Promise<PromoteUserNpmUpdateResult>;
	settle(
		promoted: PromotedUserNpmUpdate,
		disposition: "commit" | "rollback",
	): Promise<SettleUserNpmUpdateResult>;
	discard(prepared: PreparedUserNpmUpdate): Promise<SettleUserNpmUpdateResult>;
}

interface UserNpmUpdateOperationPaths {
	readonly updatesRoot: string;
	readonly packageOperationsRoot: string;
	readonly operationRoot: string;
	readonly candidateNpmRoot: string;
	readonly candidateProjectRoot: string;
	readonly canonicalProjectRoot: string;
	readonly backupProjectRoot: string;
	readonly promotedProjectRoot: string;
	readonly operationTrustedAncestors: readonly string[];
	readonly canonicalParentRoot: string;
}

function userNpmUpdateOperationPaths(
	storage: ManagedNpmStorage,
	packageName: string,
	operationId: string,
): UserNpmUpdateOperationPaths {
	const updatesRoot = join(storage.npmRoot, ".updates");
	const packageOperationsRoot = managedNpmPackagePaths(
		{ npmRoot: updatesRoot, trustedAncestors: [] },
		packageName,
	).npmProjectRoot;
	const operationRoot = join(packageOperationsRoot, operationId);
	const candidateNpmRoot = join(operationRoot, "candidate");
	const candidatePaths = managedNpmPackagePaths(
		{ npmRoot: candidateNpmRoot, trustedAncestors: [] },
		packageName,
	);
	const canonicalPaths = managedNpmPackagePaths(storage, packageName);
	const packageSegments = packageName.split("/");
	return {
		updatesRoot,
		packageOperationsRoot,
		operationRoot,
		candidateNpmRoot,
		candidateProjectRoot: candidatePaths.npmProjectRoot,
		canonicalProjectRoot: canonicalPaths.npmProjectRoot,
		backupProjectRoot: join(operationRoot, "backup"),
		promotedProjectRoot: join(operationRoot, "promoted"),
		operationTrustedAncestors: [
			updatesRoot,
			...(packageSegments.length === 2 ? [join(updatesRoot, packageSegments[0] ?? "")] : []),
			packageOperationsRoot,
			operationRoot,
		],
		canonicalParentRoot: dirname(canonicalPaths.npmProjectRoot),
	};
}

export class RealUserNpmUpdateAcquisitionGateway implements UserNpmUpdateAcquisitionGateway {
	private readonly acquisition: ExtensionAcquisitionGateway;

	constructor(acquisition: ExtensionAcquisitionGateway) {
		this.acquisition = acquisition;
	}

	async prepare(params: PrepareUserNpmUpdateParams): Promise<PrepareUserNpmUpdateResult> {
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok || parsed.value.kind !== "npm") {
			return {
				type: "failed",
				diagnostics: parsed.ok ? [] : [{ ...parsed.error }],
				retainedPaths: [],
			};
		}
		const operationId = randomUUID();
		const paths = userNpmUpdateOperationPaths(
			params.managedNpmStorage,
			parsed.value.packageName,
			operationId,
		);
		const stagingStorage: ManagedNpmStorage = {
			npmRoot: paths.candidateNpmRoot,
			trustedAncestors: [
				...params.managedNpmStorage.trustedAncestors,
				...paths.operationTrustedAncestors,
				paths.candidateNpmRoot,
			],
		};
		const canonicalPresent = await this.acquisition.isManagedNpmProjectPresent({
			storage: params.managedNpmStorage,
			packageName: parsed.value.packageName,
		});
		if (!canonicalPresent.ok) {
			return { type: "failed", diagnostics: [canonicalPresent.error], retainedPaths: [] };
		}
		const candidate = await resolveDeclaredExtensionModules({
			projectRoot: params.repoRoot,
			managedNpmStorage: stagingStorage,
			declaredSpecs: [params.sourceSpec],
			mode: "apply",
			npmAcquisition: "refresh-floating",
			gateway: this.acquisition,
		});
		const root = candidate.roots[0];
		if (root === undefined || root.sourceKind !== "npm" || candidate.diagnostics.length > 0) {
			return discardFailedPreparation(
				params.managedNpmStorage,
				parsed.value.packageName,
				operationId,
				params.sourceSpec,
				candidate.diagnostics,
			);
		}
		return {
			type: "prepared",
			prepared: {
				storage: copyManagedNpmStorage(params.managedNpmStorage),
				operationId,
				packageName: parsed.value.packageName,
				sourceSpec: params.sourceSpec,
				intent: parsed.value.isPinned ? "ensure-pinned" : "refresh-floating",
				outcome: canonicalPresent.value
					? parsed.value.isPinned
						? "unchanged"
						: "refreshed"
					: "restored",
				canonicalExisted: canonicalPresent.value,
				candidateModuleRoot: root.moduleRoot,
			},
		};
	}

	async promote(prepared: PreparedUserNpmUpdate): Promise<PromoteUserNpmUpdateResult> {
		try {
			const paths = await validatePreparedUpdate(prepared);
			const state = await classifyPreparedUpdate(prepared, paths);
			if (state === "promoted") return { type: "promoted", promoted: copyPreparedUpdate(prepared) };
			if (state === "ready") {
				if (prepared.canonicalExisted)
					await rename(paths.canonicalProjectRoot, paths.backupProjectRoot);
				else await mkdir(paths.canonicalParentRoot, { recursive: true });
			} else if (state !== "backup-retained") {
				throw new Error(`Cannot promote staged User npm update from ${state} state.`);
			}
			await rename(paths.candidateProjectRoot, paths.canonicalProjectRoot);
			return { type: "promoted", promoted: copyPreparedUpdate(prepared) };
		} catch (error) {
			return updateOperationFailure("promote", prepared, error);
		}
	}

	async settle(
		promoted: PromotedUserNpmUpdate,
		disposition: "commit" | "rollback",
	): Promise<SettleUserNpmUpdateResult> {
		try {
			const paths = await validatePreparedUpdate(promoted);
			const state = await classifyPreparedUpdate(promoted, paths);
			const rollbackAlreadyRestored =
				disposition === "rollback" &&
				(state === "rollback-restored" || state === "rollback-retained");
			if (state !== "promoted" && !rollbackAlreadyRestored)
				throw new Error(`Cannot ${disposition} staged User npm update from ${state} state.`);
			if (disposition === "rollback" && !rollbackAlreadyRestored) {
				await rename(paths.canonicalProjectRoot, paths.promotedProjectRoot);
				if (promoted.canonicalExisted) {
					try {
						await rename(paths.backupProjectRoot, paths.canonicalProjectRoot);
					} catch (error) {
						await rename(paths.promotedProjectRoot, paths.canonicalProjectRoot).catch(
							() => undefined,
						);
						throw error;
					}
				}
			}
			await rm(paths.operationRoot, { recursive: true });
			return { type: "settled" };
		} catch (error) {
			return updateOperationFailure(disposition, promoted, error);
		}
	}

	async discard(prepared: PreparedUserNpmUpdate): Promise<SettleUserNpmUpdateResult> {
		try {
			const paths = await validatePreparedUpdate(prepared);
			const state = await classifyPreparedUpdate(prepared, paths);
			if (state !== "ready")
				throw new Error(`Cannot discard staged User npm update from ${state} state.`);
			await rm(paths.operationRoot, { recursive: true });
			return { type: "settled" };
		} catch (error) {
			return updateOperationFailure("discard", prepared, error);
		}
	}
}

type PreparedUpdateState =
	| "ready"
	| "backup-retained"
	| "promoted"
	| "rollback-restored"
	| "rollback-retained"
	| "missing"
	| "inconsistent";

function validatePreparedUpdateIdentity(
	prepared: PreparedUserNpmUpdate,
): UserNpmUpdateOperationPaths {
	const parsedSource = parseExtensionSourceSpec(prepared.storage.npmRoot, prepared.sourceSpec);
	if (
		!parsedSource.ok ||
		parsedSource.value.kind !== "npm" ||
		parsedSource.value.packageName !== prepared.packageName
	)
		throw new Error("Staged User npm update source does not match its package identity.");
	if (
		prepared.operationId.length === 0 ||
		prepared.operationId.trim() !== prepared.operationId ||
		prepared.operationId === "." ||
		prepared.operationId === ".." ||
		prepared.operationId.includes("/") ||
		prepared.operationId.includes("\\") ||
		join(prepared.operationId) !== prepared.operationId
	)
		throw new Error("Staged User npm update operation id is not a safe path segment.");
	if (
		!isCanonicalAbsolutePath(prepared.storage.npmRoot) ||
		prepared.storage.trustedAncestors.length === 0 ||
		prepared.storage.trustedAncestors.some((path) => !isCanonicalAbsolutePath(path)) ||
		prepared.storage.trustedAncestors.at(-1) !== prepared.storage.npmRoot
	)
		throw new Error("Staged User npm update storage roots must be canonical absolute paths.");
	const paths = userNpmUpdateOperationPaths(
		prepared.storage,
		prepared.packageName,
		prepared.operationId,
	);
	if (!isStrictlyBelow(paths.packageOperationsRoot, paths.operationRoot))
		throw new Error("Staged User npm update operation root escapes its package updates root.");
	return paths;
}

async function validatePreparedUpdate(
	prepared: PreparedUserNpmUpdate,
): Promise<UserNpmUpdateOperationPaths> {
	const paths = validatePreparedUpdateIdentity(prepared);
	if (
		!isCanonicalAbsolutePath(prepared.candidateModuleRoot) ||
		!isStrictlyBelow(paths.candidateProjectRoot, prepared.candidateModuleRoot)
	)
		throw new Error(
			"Staged User npm update candidate module root is outside its candidate project.",
		);
	await validateDirectoryChain(prepared.storage.trustedAncestors);
	await validateDirectoryChain(paths.operationTrustedAncestors);
	if (paths.canonicalParentRoot !== prepared.storage.npmRoot)
		await validateDirectoryIfPresent(paths.canonicalParentRoot);
	return paths;
}

async function classifyPreparedUpdate(
	prepared: PreparedUserNpmUpdate,
	paths: UserNpmUpdateOperationPaths,
): Promise<PreparedUpdateState> {
	const [candidate, canonical, backup, promotedResidue] = await Promise.all([
		directoryPresence(paths.candidateProjectRoot),
		directoryPresence(paths.canonicalProjectRoot),
		directoryPresence(paths.backupProjectRoot),
		directoryPresence(paths.promotedProjectRoot),
	]);
	if (candidate && canonical === prepared.canonicalExisted && !backup && !promotedResidue)
		return "ready";
	if (prepared.canonicalExisted && candidate && !canonical && backup && !promotedResidue)
		return "backup-retained";
	if (!candidate && canonical && backup === prepared.canonicalExisted && !promotedResidue)
		return "promoted";
	if (prepared.canonicalExisted && !candidate && canonical && !backup && promotedResidue)
		return "rollback-restored";
	if (!prepared.canonicalExisted && !candidate && !canonical && !backup && promotedResidue)
		return "rollback-retained";
	if (!candidate && !canonical && !backup && !promotedResidue) return "missing";
	return "inconsistent";
}

async function directoryPresence(path: string): Promise<boolean> {
	try {
		const entry = await lstat(path);
		if (entry.isSymbolicLink() || !entry.isDirectory())
			throw new Error(`Unsafe User npm update path: ${path}.`);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

async function validateDirectoryIfPresent(path: string): Promise<void> {
	await directoryPresence(path);
}

async function validateDirectoryChain(paths: readonly string[]): Promise<void> {
	for (const path of paths) {
		if (!(await directoryPresence(path)))
			throw new Error(`Missing trusted User npm update ancestor: ${path}.`);
	}
}

async function existingDirectoryChain(paths: readonly string[]): Promise<boolean> {
	for (const path of paths) {
		if (!(await directoryPresence(path))) return false;
	}
	return true;
}

function isCanonicalAbsolutePath(path: string): boolean {
	return isAbsolute(path) && resolve(path) === path;
}

function isStrictlyBelow(parent: string, child: string): boolean {
	const childRelative = relative(parent, child);
	return (
		childRelative !== "" &&
		childRelative !== ".." &&
		!childRelative.startsWith(`..${sep}`) &&
		!isAbsolute(childRelative)
	);
}

function copyPreparedUpdate(prepared: PreparedUserNpmUpdate): PreparedUserNpmUpdate {
	return { ...prepared, storage: copyManagedNpmStorage(prepared.storage) };
}

function updateDiagnostic(
	operation: string,
	sourceSpec: string,
	path: string,
	error: unknown,
): ExtensionAcquisitionDiagnostic {
	return {
		code: "extension_acquisition_npm_project_failed",
		message: `Could not ${operation} for ${sourceSpec}: ${error instanceof Error ? error.message : String(error)}`,
		path,
	};
}

async function discardFailedPreparation(
	storage: ManagedNpmStorage,
	packageName: string,
	operationId: string,
	sourceSpec: string,
	diagnostics: readonly ExtensionAcquisitionDiagnostic[],
): Promise<UserNpmUpdateFailure> {
	const paths = userNpmUpdateOperationPaths(storage, packageName, operationId);
	try {
		if (!(await existingDirectoryChain(storage.trustedAncestors)))
			return { type: "failed", diagnostics, retainedPaths: [] };
		if (!(await existingDirectoryChain(paths.operationTrustedAncestors)))
			return { type: "failed", diagnostics, retainedPaths: [] };
		await rm(paths.operationRoot, { recursive: true });
		return { type: "failed", diagnostics, retainedPaths: [] };
	} catch (error) {
		return {
			type: "failed",
			diagnostics: [
				...diagnostics,
				updateDiagnostic(
					"discard candidate after preparation failure",
					sourceSpec,
					paths.operationRoot,
					error,
				),
			],
			retainedPaths: (await safeExistingOperationPaths(storage, paths)).includes(
				paths.operationRoot,
			)
				? [paths.operationRoot]
				: [],
		};
	}
}

async function safeExistingOperationPaths(
	storage: ManagedNpmStorage,
	paths: UserNpmUpdateOperationPaths,
): Promise<readonly string[]> {
	try {
		if (!(await existingDirectoryChain(storage.trustedAncestors))) return [];
		const operationExists = await existingDirectoryChain(paths.operationTrustedAncestors);
		const retainedPaths: string[] = [];
		if (operationExists) retainedPaths.push(paths.operationRoot);
		if (await directoryPresence(paths.canonicalProjectRoot))
			retainedPaths.push(paths.canonicalProjectRoot);
		if (operationExists && (await directoryPresence(paths.backupProjectRoot)))
			retainedPaths.push(paths.backupProjectRoot);
		return retainedPaths;
	} catch {
		// An unsafe ancestor makes descendant probing unsafe and provides no trustworthy residue evidence.
		return [];
	}
}

async function updateOperationFailure(
	operation: string,
	prepared: PreparedUserNpmUpdate,
	error: unknown,
): Promise<UserNpmUpdateFailure> {
	const message = error instanceof Error ? error.message : String(error);
	try {
		const paths = validatePreparedUpdateIdentity(prepared);
		return {
			type: "failed",
			diagnostics: [
				{
					code: "extension_acquisition_npm_project_failed",
					message: `Could not ${operation} staged User npm update for ${prepared.sourceSpec}: ${message}`,
					path: paths.operationRoot,
				},
			],
			retainedPaths: await safeExistingOperationPaths(prepared.storage, paths),
		};
	} catch {
		return {
			type: "failed",
			diagnostics: [
				{
					code: "extension_acquisition_npm_project_failed",
					message: `Could not ${operation} staged User npm update for ${prepared.sourceSpec}: ${message}`,
				},
			],
			retainedPaths: [],
		};
	}
}

export interface InMemoryUserNpmUpdateAcquisitionState {
	readonly candidateModuleRootBySpec?: Readonly<Record<string, string>>;
	readonly existingCanonicalPackageNames?: readonly string[];
	readonly failureByOperation?: Readonly<
		Partial<
			Record<
				"prepare" | "promote" | "commit" | "rollback" | "discard",
				ExtensionAcquisitionDiagnostic
			>
		>
	>;
}

export class InMemoryUserNpmUpdateAcquisitionGateway implements UserNpmUpdateAcquisitionGateway {
	private readonly candidateModuleRootBySpec: Readonly<Record<string, string>>;
	private readonly existingCanonicalPackageNames: Set<string>;
	private readonly failureByOperation: InMemoryUserNpmUpdateAcquisitionState["failureByOperation"];
	private readonly operationLog: Array<{
		readonly operation: string;
		readonly sourceSpec: string;
	}> = [];

	constructor(state: InMemoryUserNpmUpdateAcquisitionState = {}) {
		this.candidateModuleRootBySpec = structuredClone(state.candidateModuleRootBySpec ?? {});
		this.existingCanonicalPackageNames = new Set(state.existingCanonicalPackageNames ?? []);
		this.failureByOperation = structuredClone(state.failureByOperation ?? {});
	}

	async prepare(params: PrepareUserNpmUpdateParams): Promise<PrepareUserNpmUpdateResult> {
		this.operationLog.push({ operation: "prepare", sourceSpec: params.sourceSpec });
		const failure = this.failureByOperation?.prepare;
		if (failure !== undefined)
			return { type: "failed", diagnostics: [{ ...failure }], retainedPaths: [] };
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok || parsed.value.kind !== "npm") {
			return {
				type: "failed",
				diagnostics: parsed.ok ? [] : [{ ...parsed.error }],
				retainedPaths: [],
			};
		}
		const operationId = `fake-${this.operationLog.length}`;
		const paths = userNpmUpdateOperationPaths(
			params.managedNpmStorage,
			parsed.value.packageName,
			operationId,
		);
		const candidateModuleRoot =
			this.candidateModuleRootBySpec[params.sourceSpec] ??
			managedNpmPackagePaths(
				{ npmRoot: paths.candidateNpmRoot, trustedAncestors: [] },
				parsed.value.packageName,
			).packageRoot;
		const canonicalExisted = this.existingCanonicalPackageNames.has(parsed.value.packageName);
		return {
			type: "prepared",
			prepared: {
				storage: copyManagedNpmStorage(params.managedNpmStorage),
				operationId,
				packageName: parsed.value.packageName,
				sourceSpec: params.sourceSpec,
				intent: parsed.value.isPinned ? "ensure-pinned" : "refresh-floating",
				outcome: canonicalExisted
					? parsed.value.isPinned
						? "unchanged"
						: "refreshed"
					: "restored",
				canonicalExisted,
				candidateModuleRoot,
			},
		};
	}

	async promote(prepared: PreparedUserNpmUpdate): Promise<PromoteUserNpmUpdateResult> {
		this.operationLog.push({ operation: "promote", sourceSpec: prepared.sourceSpec });
		const failure = this.failureByOperation?.promote;
		if (failure !== undefined) {
			const paths = userNpmUpdateOperationPaths(
				prepared.storage,
				prepared.packageName,
				prepared.operationId,
			);
			return {
				type: "failed",
				diagnostics: [{ ...failure }],
				retainedPaths: [paths.operationRoot],
			};
		}
		this.existingCanonicalPackageNames.add(prepared.packageName);
		return { type: "promoted", promoted: copyPreparedUpdate(prepared) };
	}

	async settle(
		promoted: PromotedUserNpmUpdate,
		disposition: "commit" | "rollback",
	): Promise<SettleUserNpmUpdateResult> {
		this.operationLog.push({ operation: disposition, sourceSpec: promoted.sourceSpec });
		const failure = this.failureByOperation?.[disposition];
		if (failure !== undefined) {
			const paths = userNpmUpdateOperationPaths(
				promoted.storage,
				promoted.packageName,
				promoted.operationId,
			);
			return {
				type: "failed",
				diagnostics: [{ ...failure }],
				retainedPaths: [paths.operationRoot, paths.backupProjectRoot],
			};
		}
		if (disposition === "rollback" && !promoted.canonicalExisted)
			this.existingCanonicalPackageNames.delete(promoted.packageName);
		return { type: "settled" };
	}

	async discard(prepared: PreparedUserNpmUpdate): Promise<SettleUserNpmUpdateResult> {
		this.operationLog.push({ operation: "discard", sourceSpec: prepared.sourceSpec });
		const failure = this.failureByOperation?.discard;
		if (failure === undefined) return { type: "settled" };
		const paths = userNpmUpdateOperationPaths(
			prepared.storage,
			prepared.packageName,
			prepared.operationId,
		);
		return { type: "failed", diagnostics: [{ ...failure }], retainedPaths: [paths.operationRoot] };
	}

	operations(): readonly { readonly operation: string; readonly sourceSpec: string }[] {
		return this.operationLog.map((entry) => ({ ...entry }));
	}
}

function copyManagedNpmStorage(storage: ManagedNpmStorage): ManagedNpmStorage {
	return { npmRoot: storage.npmRoot, trustedAncestors: [...storage.trustedAncestors] };
}
