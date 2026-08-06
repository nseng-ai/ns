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
