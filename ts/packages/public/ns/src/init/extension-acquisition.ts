import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	gitExtensionSourceUnsupportedMessage,
	npmPackageRoot,
	parseExtensionSourceSpec,
	resolveDeclaredExtensionModules,
	type ExtensionAcquisitionDiagnostic,
	type ExtensionAcquisitionGateway,
	type ManagedNpmPackageRemovalResult,
	type ManagedNpmStorage,
} from "@nseng-ai/sdk/extensions/acquisition";
import { managedNpmPackagePaths, managedNpmProjectRoot } from "@nseng-ai/sdk/project-config";

export interface EnsureExtensionSourceParams {
	readonly repoRoot: string;
	readonly sourceSpec: string;
	readonly managedNpmStorage?: ManagedNpmStorage;
}

export type EnsureExtensionSourceResult =
	| {
			readonly ok: true;
			readonly sourceKind: "local" | "npm";
			readonly moduleRoot: string;
			readonly outcome: "installed" | "unchanged" | "local-in-place";
			/** True only when this invocation created the isolated npm package project. */
			readonly createdPackageProject: boolean;
	  }
	| {
			readonly ok: false;
			readonly diagnostics: readonly ExtensionAcquisitionDiagnostic[];
	  };

/** Consumer Gateway for placing one install source where descriptor activation can load it. */
export interface ExtensionInstallAcquisitionGateway {
	ensure(params: EnsureExtensionSourceParams): Promise<EnsureExtensionSourceResult>;
}

export class RealExtensionInstallAcquisitionGateway implements ExtensionInstallAcquisitionGateway {
	private readonly acquisition: ExtensionAcquisitionGateway;

	constructor(acquisition: ExtensionAcquisitionGateway) {
		this.acquisition = acquisition;
	}

	async ensure(params: EnsureExtensionSourceParams): Promise<EnsureExtensionSourceResult> {
		const result = await resolveDeclaredExtensionModules({
			projectRoot: params.repoRoot,
			...optionalEntry("managedNpmStorage", params.managedNpmStorage),
			declaredSpecs: [params.sourceSpec],
			mode: "apply",
			npmAcquisition: "ensure",
			gateway: this.acquisition,
		});
		const root = result.roots.find((candidate) => candidate.spec === params.sourceSpec);
		if (root === undefined || result.diagnostics.length > 0) {
			return { ok: false, diagnostics: result.diagnostics };
		}
		return {
			ok: true,
			sourceKind: root.sourceKind,
			moduleRoot: root.moduleRoot,
			outcome:
				root.sourceKind === "local"
					? "local-in-place"
					: root.wasInstalled
						? "unchanged"
						: "installed",
			createdPackageProject: root.sourceKind === "npm" && !root.packageProjectExisted,
		};
	}
}

export interface ExtensionUpdateAcquisitionFailure {
	readonly type: "failed";
	readonly diagnostics: readonly ExtensionAcquisitionDiagnostic[];
}

export type PreviewExtensionUpdateSourceResult =
	| ExtensionUpdateAcquisitionFailure
	| {
			readonly type: "preview-existing";
			readonly sourceKind: "local";
			readonly moduleRoot: string;
			readonly intent: "local-in-place";
	  }
	| {
			readonly type: "preview-existing";
			readonly sourceKind: "npm";
			readonly moduleRoot: string;
			readonly intent: "ensure-pinned";
	  }
	| {
			readonly type: "preview-apply-required";
			readonly sourceKind: "npm";
			readonly intent: "ensure-pinned" | "refresh-floating";
	  };

export type ReconcileExtensionUpdateSourceResult =
	| ExtensionUpdateAcquisitionFailure
	| {
			readonly type: "applied";
			readonly sourceKind: "local";
			readonly moduleRoot: string;
			readonly intent: "local-in-place";
			readonly outcome: "local-in-place";
	  }
	| {
			readonly type: "applied";
			readonly sourceKind: "npm";
			readonly moduleRoot: string;
			readonly intent: "ensure-pinned";
			readonly outcome: "restored" | "unchanged";
	  }
	| {
			readonly type: "applied";
			readonly sourceKind: "npm";
			readonly moduleRoot: string;
			readonly intent: "refresh-floating";
			readonly outcome: "refreshed" | "restored";
	  };

export interface ExtensionUpdateAcquisitionGateway {
	preview(params: EnsureExtensionSourceParams): Promise<PreviewExtensionUpdateSourceResult>;
	reconcile(params: EnsureExtensionSourceParams): Promise<ReconcileExtensionUpdateSourceResult>;
}

export class RealExtensionUpdateAcquisitionGateway implements ExtensionUpdateAcquisitionGateway {
	private readonly acquisition: ExtensionAcquisitionGateway;

	constructor(acquisition: ExtensionAcquisitionGateway) {
		this.acquisition = acquisition;
	}

	async preview(params: EnsureExtensionSourceParams): Promise<PreviewExtensionUpdateSourceResult> {
		const result = await resolveDeclaredExtensionModules({
			projectRoot: params.repoRoot,
			...optionalEntry("managedNpmStorage", params.managedNpmStorage),
			declaredSpecs: [params.sourceSpec],
			mode: "preview",
			npmAcquisition: "refresh-floating",
			gateway: this.acquisition,
		});
		const root = result.roots.find((candidate) => candidate.spec === params.sourceSpec);
		const unexpectedDiagnostics = result.diagnostics.filter(
			(diagnostic) => diagnostic.code !== "extension_acquisition_preview_skipped",
		);
		if (unexpectedDiagnostics.length > 0) {
			return { type: "failed", diagnostics: unexpectedDiagnostics };
		}
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok) return { type: "failed", diagnostics: [{ ...parsed.error }] };
		if (
			parsed.value.kind === "npm" &&
			(result.diagnostics.some(
				(diagnostic) => diagnostic.code === "extension_acquisition_preview_skipped",
			) ||
				!parsed.value.isPinned)
		) {
			return {
				type: "preview-apply-required",
				sourceKind: "npm",
				intent: parsed.value.isPinned ? "ensure-pinned" : "refresh-floating",
			};
		}
		if (root === undefined) return { type: "failed", diagnostics: result.diagnostics };
		if (root.sourceKind === "local") {
			return {
				type: "preview-existing",
				sourceKind: "local",
				moduleRoot: root.moduleRoot,
				intent: "local-in-place",
			};
		}
		return {
			type: "preview-existing",
			sourceKind: "npm",
			moduleRoot: root.moduleRoot,
			intent: "ensure-pinned",
		};
	}

	async reconcile(
		params: EnsureExtensionSourceParams,
	): Promise<ReconcileExtensionUpdateSourceResult> {
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok) return { type: "failed", diagnostics: [{ ...parsed.error }] };
		const applied = await resolveDeclaredExtensionModules({
			projectRoot: params.repoRoot,
			...optionalEntry("managedNpmStorage", params.managedNpmStorage),
			declaredSpecs: [params.sourceSpec],
			mode: "apply",
			npmAcquisition: "refresh-floating",
			gateway: this.acquisition,
		});
		const root = applied.roots.find((candidate) => candidate.spec === params.sourceSpec);
		if (root === undefined || applied.diagnostics.length > 0) {
			return { type: "failed", diagnostics: applied.diagnostics };
		}
		if (root.sourceKind === "local") {
			return {
				type: "applied",
				sourceKind: "local",
				moduleRoot: root.moduleRoot,
				intent: "local-in-place",
				outcome: "local-in-place",
			};
		}
		if (parsed.value.kind !== "npm") {
			throw new Error(`Resolved npm root has non-npm source spec: ${params.sourceSpec}.`);
		}
		if (parsed.value.isPinned) {
			return {
				type: "applied",
				sourceKind: "npm",
				moduleRoot: root.moduleRoot,
				intent: "ensure-pinned",
				outcome: root.wasInstalled ? "unchanged" : "restored",
			};
		}
		return {
			type: "applied",
			sourceKind: "npm",
			moduleRoot: root.moduleRoot,
			intent: "refresh-floating",
			outcome: root.wasInstalled ? "refreshed" : "restored",
		};
	}
}

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
	readonly candidateModuleRoot: string;
	readonly candidateProjectRoot: string;
	readonly operationRoot: string;
	readonly canonicalProjectRoot: string;
	readonly backupProjectRoot: string;
	readonly canonicalExisted: boolean;
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
		const packageSegments = parsed.value.packageName.split("/");
		const updatesRoot = join(params.managedNpmStorage.npmRoot, ".updates");
		const packageOperationsRoot = join(updatesRoot, ...packageSegments);
		const operationRoot = join(packageOperationsRoot, operationId);
		const candidateNpmRoot = join(operationRoot, "candidate");
		const stagingStorage: ManagedNpmStorage = {
			npmRoot: candidateNpmRoot,
			trustedAncestors: [
				...params.managedNpmStorage.trustedAncestors,
				updatesRoot,
				...(packageSegments.length === 2 ? [join(updatesRoot, packageSegments[0] ?? "")] : []),
				packageOperationsRoot,
				operationRoot,
				candidateNpmRoot,
			],
		};
		const canonicalPaths = managedNpmPackagePaths(
			params.managedNpmStorage,
			parsed.value.packageName,
		);
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
			try {
				await validateDirectoryChain([
					...stagingStorage.trustedAncestors.slice(0, -1),
					operationRoot,
				]);
				await rm(operationRoot, { recursive: true });
				return { type: "failed", diagnostics: candidate.diagnostics, retainedPaths: [] };
			} catch (error) {
				return {
					type: "failed",
					diagnostics: [
						...candidate.diagnostics,
						updateDiagnostic(
							"discard candidate after preparation failure",
							params.sourceSpec,
							operationRoot,
							error,
						),
					],
					retainedPaths: [operationRoot],
				};
			}
		}
		const candidatePaths = managedNpmPackagePaths(stagingStorage, parsed.value.packageName);
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
				candidateModuleRoot: root.moduleRoot,
				candidateProjectRoot: candidatePaths.npmProjectRoot,
				operationRoot,
				canonicalProjectRoot: canonicalPaths.npmProjectRoot,
				backupProjectRoot: join(operationRoot, "backup"),
				canonicalExisted: canonicalPresent.value,
			},
		};
	}

	async promote(prepared: PreparedUserNpmUpdate): Promise<PromoteUserNpmUpdateResult> {
		try {
			await validatePreparedUpdate(prepared);
			const state = await classifyPreparedUpdate(prepared);
			if (state === "promoted") return { type: "promoted", promoted: copyPreparedUpdate(prepared) };
			if (state === "ready") {
				if (prepared.canonicalExisted)
					await rename(prepared.canonicalProjectRoot, prepared.backupProjectRoot);
				else await mkdir(dirname(prepared.canonicalProjectRoot), { recursive: true });
			} else if (state !== "backup-retained") {
				throw new Error(`Cannot promote staged User npm update from ${state} state.`);
			}
			await rename(prepared.candidateProjectRoot, prepared.canonicalProjectRoot);
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
			await validatePreparedUpdate(promoted);
			const state = await classifyPreparedUpdate(promoted);
			const rollbackAlreadyRestored =
				disposition === "rollback" &&
				(state === "rollback-restored" || state === "rollback-retained");
			if (state !== "promoted" && !rollbackAlreadyRestored)
				throw new Error(`Cannot ${disposition} staged User npm update from ${state} state.`);
			if (disposition === "rollback" && !rollbackAlreadyRestored) {
				const promotedResidue = join(promoted.operationRoot, "promoted");
				await rename(promoted.canonicalProjectRoot, promotedResidue);
				if (promoted.canonicalExisted) {
					try {
						await rename(promoted.backupProjectRoot, promoted.canonicalProjectRoot);
					} catch (error) {
						await rename(promotedResidue, promoted.canonicalProjectRoot).catch(() => undefined);
						throw error;
					}
				}
			}
			await rm(promoted.operationRoot, { recursive: true });
			return { type: "settled" };
		} catch (error) {
			return updateOperationFailure(disposition, promoted, error);
		}
	}

	async discard(prepared: PreparedUserNpmUpdate): Promise<SettleUserNpmUpdateResult> {
		try {
			await validatePreparedUpdate(prepared);
			const state = await classifyPreparedUpdate(prepared);
			if (state !== "ready")
				throw new Error(`Cannot discard staged User npm update from ${state} state.`);
			await rm(prepared.operationRoot, { recursive: true });
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

async function validatePreparedUpdate(prepared: PreparedUserNpmUpdate): Promise<void> {
	const parsedSource = parseExtensionSourceSpec(prepared.storage.npmRoot, prepared.sourceSpec);
	if (
		!parsedSource.ok ||
		parsedSource.value.kind !== "npm" ||
		parsedSource.value.packageName !== prepared.packageName
	)
		throw new Error("Staged User npm update source does not match its package identity.");
	const canonical = managedNpmPackagePaths(prepared.storage, prepared.packageName).npmProjectRoot;
	const packageSegments = prepared.packageName.split("/");
	const packageOperationsRoot = join(prepared.storage.npmRoot, ".updates", ...packageSegments);
	const expectedOperationRoot = join(packageOperationsRoot, prepared.operationId);
	const candidateStorage: ManagedNpmStorage = {
		npmRoot: join(expectedOperationRoot, "candidate"),
		trustedAncestors: [],
	};
	const candidatePaths = managedNpmPackagePaths(candidateStorage, prepared.packageName);
	if (
		!isCanonicalAbsolutePath(prepared.storage.npmRoot) ||
		prepared.operationId.length === 0 ||
		join(prepared.operationId) !== prepared.operationId ||
		!isStrictlyBelow(packageOperationsRoot, expectedOperationRoot) ||
		prepared.canonicalProjectRoot !== canonical ||
		prepared.operationRoot !== expectedOperationRoot ||
		prepared.backupProjectRoot !== join(expectedOperationRoot, "backup") ||
		prepared.candidateProjectRoot !== candidatePaths.npmProjectRoot ||
		prepared.candidateModuleRoot !== candidatePaths.packageRoot
	)
		throw new Error(
			"Staged User npm update paths do not match their package-specific operation identity.",
		);
	await validateDirectoryChain([
		...prepared.storage.trustedAncestors,
		join(prepared.storage.npmRoot, ".updates"),
		...(packageSegments.length === 2
			? [join(prepared.storage.npmRoot, ".updates", packageSegments[0] ?? "")]
			: []),
		join(prepared.storage.npmRoot, ".updates", ...packageSegments),
		prepared.operationRoot,
	]);
}

async function classifyPreparedUpdate(
	prepared: PreparedUserNpmUpdate,
): Promise<PreparedUpdateState> {
	const [candidate, canonical, backup, promotedResidue] = await Promise.all([
		directoryPresence(prepared.candidateProjectRoot),
		directoryPresence(prepared.canonicalProjectRoot),
		directoryPresence(prepared.backupProjectRoot),
		directoryPresence(join(prepared.operationRoot, "promoted")),
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

async function validateDirectoryChain(paths: readonly string[]): Promise<void> {
	for (const path of paths) {
		if (!(await directoryPresence(path)))
			throw new Error(`Missing trusted User npm update ancestor: ${path}.`);
	}
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

function updateOperationFailure(
	operation: string,
	prepared: PreparedUserNpmUpdate,
	error: unknown,
): UserNpmUpdateFailure {
	const message = error instanceof Error ? error.message : String(error);
	return {
		type: "failed",
		diagnostics: [
			{
				code: "extension_acquisition_npm_project_failed",
				message: `Could not ${operation} staged User npm update for ${prepared.sourceSpec}: ${message}`,
				path: prepared.operationRoot,
			},
		],
		retainedPaths: [
			prepared.operationRoot,
			prepared.canonicalProjectRoot,
			prepared.backupProjectRoot,
		],
	};
}

export interface RemoveManagedNpmExtensionParams {
	readonly storage: ManagedNpmStorage;
	readonly packageName: string;
}

export type RemoveManagedNpmExtensionResult =
	| { readonly ok: true; readonly value: ManagedNpmPackageRemovalResult }
	| { readonly ok: false; readonly error: ExtensionAcquisitionDiagnostic };

/** Consumer Gateway for deleting only an extension's managed npm package project. */
export interface ExtensionUninstallAcquisitionGateway {
	removeManagedNpmPackage(
		params: RemoveManagedNpmExtensionParams,
	): Promise<RemoveManagedNpmExtensionResult>;
}

export class RealExtensionUninstallAcquisitionGateway implements ExtensionUninstallAcquisitionGateway {
	private readonly acquisition: ExtensionAcquisitionGateway;

	constructor(acquisition: ExtensionAcquisitionGateway) {
		this.acquisition = acquisition;
	}

	async removeManagedNpmPackage(
		params: RemoveManagedNpmExtensionParams,
	): Promise<RemoveManagedNpmExtensionResult> {
		return this.acquisition.removeManagedNpmPackage({
			storage: params.storage,
			packageName: params.packageName,
		});
	}
}

export interface InMemoryExtensionInstallAcquisitionState {
	readonly installedPackageRoots?: readonly string[];
	readonly existingProjectRoots?: readonly string[];
	readonly failureBySpec?: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
}

export class InMemoryExtensionInstallAcquisitionGateway implements ExtensionInstallAcquisitionGateway {
	private readonly installedPackageRoots: Set<string>;
	private readonly existingProjectRoots: Set<string>;
	private readonly failureBySpec: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
	private readonly ensureLog: EnsureExtensionSourceParams[] = [];

	constructor(state: InMemoryExtensionInstallAcquisitionState = {}) {
		this.installedPackageRoots = new Set(state.installedPackageRoots ?? []);
		this.existingProjectRoots = new Set(state.existingProjectRoots ?? []);
		for (const packageRoot of this.installedPackageRoots) {
			this.existingProjectRoots.add(
				packageRoot.slice(0, packageRoot.lastIndexOf("/node_modules/")),
			);
		}
		this.failureBySpec = structuredClone(state.failureBySpec ?? {});
	}

	async ensure(params: EnsureExtensionSourceParams): Promise<EnsureExtensionSourceResult> {
		this.ensureLog.push({ ...params });
		const failure = this.failureBySpec[params.sourceSpec];
		if (failure !== undefined) return { ok: false, diagnostics: [{ ...failure }] };
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok) return { ok: false, diagnostics: [{ ...parsed.error }] };
		if (parsed.value.kind === "git") {
			return {
				ok: false,
				diagnostics: [
					{
						code: "extension_acquisition_git_unsupported",
						message: gitExtensionSourceUnsupportedMessage(params.sourceSpec),
						spec: params.sourceSpec,
					},
				],
			};
		}
		if (parsed.value.kind === "local") {
			return {
				ok: true,
				sourceKind: "local",
				moduleRoot: parsed.value.path,
				outcome: "local-in-place",
				createdPackageProject: false,
			};
		}
		const moduleRoot = packageRootForParams(params, parsed.value.packageName);
		const projectRoot =
			params.managedNpmStorage === undefined
				? managedNpmProjectRoot(params.repoRoot, parsed.value.packageName)
				: managedNpmPackagePaths(params.managedNpmStorage, parsed.value.packageName).npmProjectRoot;
		const wasInstalled = this.installedPackageRoots.has(moduleRoot);
		const projectExisted = this.existingProjectRoots.has(projectRoot);
		this.existingProjectRoots.add(projectRoot);
		this.installedPackageRoots.add(moduleRoot);
		return {
			ok: true,
			sourceKind: "npm",
			moduleRoot,
			outcome: wasInstalled ? "unchanged" : "installed",
			createdPackageProject: !projectExisted,
		};
	}

	installedRoots(): ReadonlySet<string> {
		return new Set(this.installedPackageRoots);
	}

	calls(): readonly EnsureExtensionSourceParams[] {
		return this.ensureLog.map((call) => ({ ...call }));
	}
}

export interface InMemoryExtensionUpdateAcquisitionState {
	readonly installedPackageRoots?: readonly string[];
	readonly previewFailureBySpec?: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
	readonly reconcileFailureBySpec?: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
}

export class InMemoryExtensionUpdateAcquisitionGateway implements ExtensionUpdateAcquisitionGateway {
	private readonly installedPackageRoots: Set<string>;
	private readonly previewFailureBySpec: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
	private readonly reconcileFailureBySpec: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
	private readonly operationLog: Array<{
		readonly operation: "preview" | "reconcile";
		readonly params: EnsureExtensionSourceParams;
	}> = [];

	constructor(state: InMemoryExtensionUpdateAcquisitionState = {}) {
		this.installedPackageRoots = new Set(state.installedPackageRoots ?? []);
		this.previewFailureBySpec = structuredClone(state.previewFailureBySpec ?? {});
		this.reconcileFailureBySpec = structuredClone(state.reconcileFailureBySpec ?? {});
	}

	async preview(params: EnsureExtensionSourceParams): Promise<PreviewExtensionUpdateSourceResult> {
		this.operationLog.push({ operation: "preview", params: { ...params } });
		const failure = this.previewFailureBySpec[params.sourceSpec];
		if (failure !== undefined) return { type: "failed", diagnostics: [{ ...failure }] };
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok) return { type: "failed", diagnostics: [{ ...parsed.error }] };
		if (parsed.value.kind === "git") {
			return {
				type: "failed",
				diagnostics: [
					{
						code: "extension_acquisition_git_unsupported",
						message: gitExtensionSourceUnsupportedMessage(params.sourceSpec),
						spec: params.sourceSpec,
					},
				],
			};
		}
		if (parsed.value.kind === "local") {
			return {
				type: "preview-existing",
				sourceKind: "local",
				moduleRoot: parsed.value.path,
				intent: "local-in-place",
			};
		}
		const moduleRoot = packageRootForParams(params, parsed.value.packageName);
		if (!parsed.value.isPinned || !this.installedPackageRoots.has(moduleRoot)) {
			return {
				type: "preview-apply-required",
				sourceKind: "npm",
				intent: parsed.value.isPinned ? "ensure-pinned" : "refresh-floating",
			};
		}
		return {
			type: "preview-existing",
			sourceKind: "npm",
			moduleRoot,
			intent: "ensure-pinned",
		};
	}

	async reconcile(
		params: EnsureExtensionSourceParams,
	): Promise<ReconcileExtensionUpdateSourceResult> {
		this.operationLog.push({ operation: "reconcile", params: { ...params } });
		const failure = this.reconcileFailureBySpec[params.sourceSpec];
		if (failure !== undefined) return { type: "failed", diagnostics: [{ ...failure }] };
		const parsed = parseExtensionSourceSpec(params.repoRoot, params.sourceSpec);
		if (!parsed.ok) return { type: "failed", diagnostics: [{ ...parsed.error }] };
		if (parsed.value.kind === "git") {
			return {
				type: "failed",
				diagnostics: [
					{
						code: "extension_acquisition_git_unsupported",
						message: gitExtensionSourceUnsupportedMessage(params.sourceSpec),
						spec: params.sourceSpec,
					},
				],
			};
		}
		if (parsed.value.kind === "local") {
			return {
				type: "applied",
				sourceKind: "local",
				moduleRoot: parsed.value.path,
				intent: "local-in-place",
				outcome: "local-in-place",
			};
		}
		const moduleRoot = packageRootForParams(params, parsed.value.packageName);
		const hasExistingInstallation = this.installedPackageRoots.has(moduleRoot);
		this.installedPackageRoots.add(moduleRoot);
		if (parsed.value.isPinned) {
			return {
				type: "applied",
				sourceKind: "npm",
				moduleRoot,
				intent: "ensure-pinned",
				outcome: hasExistingInstallation ? "unchanged" : "restored",
			};
		}
		return {
			type: "applied",
			sourceKind: "npm",
			moduleRoot,
			intent: "refresh-floating",
			outcome: hasExistingInstallation ? "refreshed" : "restored",
		};
	}

	installedRoots(): ReadonlySet<string> {
		return new Set(this.installedPackageRoots);
	}

	operations(): readonly {
		readonly operation: "preview" | "reconcile";
		readonly params: EnsureExtensionSourceParams;
	}[] {
		return this.operationLog.map((entry) => ({
			operation: entry.operation,
			params: { ...entry.params },
		}));
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
		const canonicalPaths = managedNpmPackagePaths(
			params.managedNpmStorage,
			parsed.value.packageName,
		);
		const operationRoot = join(
			params.managedNpmStorage.npmRoot,
			".updates",
			...parsed.value.packageName.split("/"),
			operationId,
		);
		const candidateProjectRoot = join(
			operationRoot,
			"candidate",
			...parsed.value.packageName.split("/"),
		);
		const candidateModuleRoot =
			this.candidateModuleRootBySpec[params.sourceSpec] ??
			join(candidateProjectRoot, "node_modules", ...parsed.value.packageName.split("/"));
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
				candidateModuleRoot,
				candidateProjectRoot,
				operationRoot,
				canonicalProjectRoot: canonicalPaths.npmProjectRoot,
				backupProjectRoot: join(operationRoot, "backup"),
				canonicalExisted,
			},
		};
	}

	async promote(prepared: PreparedUserNpmUpdate): Promise<PromoteUserNpmUpdateResult> {
		this.operationLog.push({ operation: "promote", sourceSpec: prepared.sourceSpec });
		const failure = this.failureByOperation?.promote;
		if (failure !== undefined)
			return {
				type: "failed",
				diagnostics: [{ ...failure }],
				retainedPaths: [prepared.operationRoot],
			};
		this.existingCanonicalPackageNames.add(prepared.packageName);
		return { type: "promoted", promoted: copyPreparedUpdate(prepared) };
	}

	async settle(
		promoted: PromotedUserNpmUpdate,
		disposition: "commit" | "rollback",
	): Promise<SettleUserNpmUpdateResult> {
		this.operationLog.push({ operation: disposition, sourceSpec: promoted.sourceSpec });
		const failure = this.failureByOperation?.[disposition];
		if (failure !== undefined)
			return {
				type: "failed",
				diagnostics: [{ ...failure }],
				retainedPaths: [promoted.operationRoot, promoted.backupProjectRoot],
			};
		if (disposition === "rollback" && !promoted.canonicalExisted)
			this.existingCanonicalPackageNames.delete(promoted.packageName);
		return { type: "settled" };
	}

	async discard(prepared: PreparedUserNpmUpdate): Promise<SettleUserNpmUpdateResult> {
		this.operationLog.push({ operation: "discard", sourceSpec: prepared.sourceSpec });
		const failure = this.failureByOperation?.discard;
		return failure === undefined
			? { type: "settled" }
			: { type: "failed", diagnostics: [{ ...failure }], retainedPaths: [prepared.operationRoot] };
	}

	operations(): readonly { readonly operation: string; readonly sourceSpec: string }[] {
		return this.operationLog.map((entry) => ({ ...entry }));
	}
}

export interface InMemoryExtensionUninstallAcquisitionState {
	readonly installedPackageNames?: readonly string[];
	readonly failureByPackageName?: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
}

export class InMemoryExtensionUninstallAcquisitionGateway implements ExtensionUninstallAcquisitionGateway {
	private readonly installedPackageNames: Set<string>;
	private readonly failureByPackageName: Readonly<Record<string, ExtensionAcquisitionDiagnostic>>;
	private readonly removalLog: RemoveManagedNpmExtensionParams[] = [];

	constructor(state: InMemoryExtensionUninstallAcquisitionState = {}) {
		this.installedPackageNames = new Set(state.installedPackageNames ?? []);
		this.failureByPackageName = structuredClone(state.failureByPackageName ?? {});
	}

	async removeManagedNpmPackage(
		params: RemoveManagedNpmExtensionParams,
	): Promise<RemoveManagedNpmExtensionResult> {
		this.removalLog.push({
			...params,
			storage: copyManagedNpmStorage(params.storage),
		});
		const failure = this.failureByPackageName[params.packageName];
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		const isRemoved = this.installedPackageNames.delete(params.packageName);
		return {
			ok: true,
			value: {
				status: isRemoved ? "removed" : "already-absent",
				path: managedNpmPackagePaths(params.storage, params.packageName).npmProjectRoot,
			},
		};
	}

	installedPackages(): ReadonlySet<string> {
		return new Set(this.installedPackageNames);
	}

	removals(): readonly RemoveManagedNpmExtensionParams[] {
		return this.removalLog.map((call) => ({
			...call,
			storage: copyManagedNpmStorage(call.storage),
		}));
	}
}

function packageRootForParams(params: EnsureExtensionSourceParams, packageName: string): string {
	if (params.managedNpmStorage === undefined) return npmPackageRoot(params.repoRoot, packageName);
	return managedNpmPackagePaths(params.managedNpmStorage, packageName).packageRoot;
}

function copyManagedNpmStorage(storage: ManagedNpmStorage): ManagedNpmStorage {
	return { npmRoot: storage.npmRoot, trustedAncestors: [...storage.trustedAncestors] };
}
