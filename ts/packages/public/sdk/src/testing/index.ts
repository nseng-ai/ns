import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type {
	ExtensionAcquisitionDiagnostic,
	ExtensionAcquisitionGateway,
	ManagedNpmPackageRemovalResult,
} from "../extensions/acquisition.ts";
import { managedNpmPackagePaths } from "../project-config/managed-extension-paths.ts";
import type { ManagedNpmStorage } from "../project-config/managed-extension-paths.ts";

export interface FakeManagedNpmCall {
	readonly storage: ManagedNpmStorage;
	readonly packageName: string;
}

export interface FakeNpmInstallCall extends FakeManagedNpmCall {
	readonly rawSpec: string;
	readonly version: string | undefined;
	readonly isPinned: boolean;
}

export interface FakeExtensionAcquisitionGatewayOptions {
	readonly installedPackageRoots?: readonly string[];
	readonly existingProjectRoots?: readonly string[];
	readonly failSpecs?: readonly string[];
	readonly failRemovePackageNames?: readonly string[];
	readonly failInspectPackageRoots?: readonly string[];
	readonly failInspectProjectRoots?: readonly string[];
}

export interface FakeManagedNpmRemovalCall {
	readonly storage: ManagedNpmStorage;
	readonly packageName: string;
}

export class FakeExtensionAcquisitionGateway implements ExtensionAcquisitionGateway {
	failSpec: string | undefined;
	private readonly installedPackageRoots: Set<string>;
	private readonly existingProjectRoots: Set<string>;
	private readonly ensuredProjectLog: string[] = [];
	private readonly installLog: FakeNpmInstallCall[] = [];
	private readonly failSpecs: ReadonlySet<string>;
	private readonly failRemovePackageNames: ReadonlySet<string>;
	private readonly failInspectPackageRoots: ReadonlySet<string>;
	private readonly failInspectProjectRoots: ReadonlySet<string>;
	private readonly inspectionLog: string[] = [];
	private readonly removalLog: FakeManagedNpmRemovalCall[] = [];

	constructor(options: FakeExtensionAcquisitionGatewayOptions = {}) {
		this.installedPackageRoots = new Set(options.installedPackageRoots ?? []);
		this.existingProjectRoots = new Set(options.existingProjectRoots ?? []);
		this.failSpecs = new Set(options.failSpecs ?? []);
		this.failRemovePackageNames = new Set(options.failRemovePackageNames ?? []);
		this.failInspectPackageRoots = new Set(options.failInspectPackageRoots ?? []);
		this.failInspectProjectRoots = new Set(options.failInspectProjectRoots ?? []);
	}

	get installed(): ReadonlySet<string> {
		return new Set(this.installedPackageRoots);
	}

	get ensureCalls(): number {
		return this.ensuredProjectLog.length;
	}

	get ensuredProjects(): readonly string[] {
		return [...this.ensuredProjectLog];
	}

	get installs(): readonly FakeNpmInstallCall[] {
		return this.installLog.map((install) => ({
			...install,
			storage: copyManagedNpmStorage(install.storage),
		}));
	}

	get inspections(): readonly string[] {
		return [...this.inspectionLog];
	}

	get removals(): readonly FakeManagedNpmRemovalCall[] {
		return this.removalLog.map((removal) => ({
			...removal,
			storage: copyManagedNpmStorage(removal.storage),
		}));
	}

	async isManagedNpmProjectPresent(
		request: FakeManagedNpmCall,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		const paths = managedNpmPackagePaths(request.storage, request.packageName);
		const projectDir = paths.npmProjectRoot;
		if (this.failInspectProjectRoots.has(projectDir)) {
			return resultErr({
				code: "extension_acquisition_npm_project_failed",
				message: `failed to inspect ${projectDir}`,
				path: projectDir,
			});
		}
		return resultOk(
			this.existingProjectRoots.has(projectDir) ||
				this.installedPackageRoots.has(paths.packageRoot),
		);
	}

	async ensureManagedNpmProject(
		request: FakeManagedNpmCall,
	): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		const projectDir = managedNpmPackagePaths(request.storage, request.packageName).npmProjectRoot;
		this.ensuredProjectLog.push(projectDir);
		this.existingProjectRoots.add(projectDir);
		return resultOk(undefined);
	}

	async isNpmPackageInstalled(
		request: FakeManagedNpmCall,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		const packageRoot = managedNpmPackagePaths(request.storage, request.packageName).packageRoot;
		this.inspectionLog.push(packageRoot);
		if (this.failInspectPackageRoots.has(packageRoot)) {
			return resultErr({
				code: "extension_acquisition_npm_project_failed",
				message: `failed to inspect ${packageRoot}`,
				path: packageRoot,
			});
		}
		return resultOk(this.installedPackageRoots.has(packageRoot));
	}

	async removeManagedNpmPackage(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<ManagedNpmPackageRemovalResult, ExtensionAcquisitionDiagnostic>> {
		this.removalLog.push({
			...request,
			storage: copyManagedNpmStorage(request.storage),
		});
		const paths = managedNpmPackagePaths(request.storage, request.packageName);
		const projectDir = paths.npmProjectRoot;
		if (this.failRemovePackageNames.has(request.packageName)) {
			return resultErr({
				code: "extension_acquisition_npm_remove_failed",
				message: `failed to remove ${request.packageName}`,
				path: projectDir,
			});
		}
		const packageWasInstalled = this.installedPackageRoots.delete(paths.packageRoot);
		const projectExisted = this.existingProjectRoots.delete(projectDir);
		return resultOk({
			status: packageWasInstalled || projectExisted ? "removed" : "already-absent",
			path: projectDir,
		});
	}

	async installNpmPackage(request: {
		readonly storage: ManagedNpmStorage;
		readonly rawSpec: string;
		readonly packageName: string;
		readonly version: string | undefined;
		readonly isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.installLog.push({
			storage: copyManagedNpmStorage(request.storage),
			rawSpec: request.rawSpec,
			packageName: request.packageName,
			version: request.version,
			isPinned: request.isPinned,
		});
		if (request.rawSpec === this.failSpec || this.failSpecs.has(request.rawSpec)) {
			return resultErr({
				code: "extension_acquisition_npm_install_failed",
				message: `failed ${request.rawSpec}`,
				spec: request.rawSpec,
			});
		}
		this.installedPackageRoots.add(
			managedNpmPackagePaths(request.storage, request.packageName).packageRoot,
		);
		return resultOk(undefined);
	}
}

function copyManagedNpmStorage(storage: ManagedNpmStorage): ManagedNpmStorage {
	return { npmRoot: storage.npmRoot, trustedAncestors: [...storage.trustedAncestors] };
}
