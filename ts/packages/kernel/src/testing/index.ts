import { join } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type {
	ExtensionAcquisitionDiagnostic,
	ExtensionAcquisitionGateway,
	ManagedNpmPackageRemovalResult,
} from "../extensions/acquisition.ts";
import { managedNpmProjectRoot } from "../project-config/managed-extension-paths.ts";

export interface FakeNpmInstallCall {
	readonly projectDir: string;
	readonly rawSpec: string;
	readonly packageName: string;
	readonly version: string | undefined;
	readonly isPinned: boolean;
}

export interface FakeExtensionAcquisitionGatewayOptions {
	readonly installedPackageRoots?: readonly string[];
	readonly failSpecs?: readonly string[];
	readonly failRemovePackageNames?: readonly string[];
	readonly failInspectPackageRoots?: readonly string[];
}

export interface FakeManagedNpmRemovalCall {
	readonly projectRoot: string;
	readonly packageName: string;
}

export class FakeExtensionAcquisitionGateway implements ExtensionAcquisitionGateway {
	failSpec: string | undefined;
	private readonly installedPackageRoots: Set<string>;
	private readonly ensuredProjectLog: string[] = [];
	private readonly installLog: FakeNpmInstallCall[] = [];
	private readonly failSpecs: ReadonlySet<string>;
	private readonly failRemovePackageNames: ReadonlySet<string>;
	private readonly failInspectPackageRoots: ReadonlySet<string>;
	private readonly removalLog: FakeManagedNpmRemovalCall[] = [];

	constructor(options: FakeExtensionAcquisitionGatewayOptions = {}) {
		this.installedPackageRoots = new Set(options.installedPackageRoots ?? []);
		this.failSpecs = new Set(options.failSpecs ?? []);
		this.failRemovePackageNames = new Set(options.failRemovePackageNames ?? []);
		this.failInspectPackageRoots = new Set(options.failInspectPackageRoots ?? []);
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
		return this.installLog.map((install) => ({ ...install }));
	}

	get removals(): readonly FakeManagedNpmRemovalCall[] {
		return this.removalLog.map((removal) => ({ ...removal }));
	}

	async ensureManagedNpmProject(
		projectDir: string,
	): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.ensuredProjectLog.push(projectDir);
		return resultOk(undefined);
	}

	async isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
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
		readonly projectRoot: string;
		readonly packageName: string;
	}): Promise<Result<ManagedNpmPackageRemovalResult, ExtensionAcquisitionDiagnostic>> {
		this.removalLog.push({ ...request });
		const projectDir = managedNpmProjectRoot(request.projectRoot, request.packageName);
		if (this.failRemovePackageNames.has(request.packageName)) {
			return resultErr({
				code: "extension_acquisition_npm_remove_failed",
				message: `failed to remove ${request.packageName}`,
				path: projectDir,
			});
		}
		const packageRoot = join(projectDir, "node_modules", request.packageName);
		const wasInstalled = this.installedPackageRoots.delete(packageRoot);
		return resultOk({ status: wasInstalled ? "removed" : "already-absent", path: projectDir });
	}

	async installNpmPackage(request: {
		projectDir: string;
		rawSpec: string;
		packageName: string;
		version: string | undefined;
		isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.installLog.push({
			projectDir: request.projectDir,
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
		this.installedPackageRoots.add(join(request.projectDir, "node_modules", request.packageName));
		return resultOk(undefined);
	}
}
