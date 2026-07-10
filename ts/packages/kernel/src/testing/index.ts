import { join } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type {
	ExtensionAcquisitionDiagnostic,
	ExtensionAcquisitionGateway,
} from "../extensions/acquisition.ts";

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
}

export class FakeExtensionAcquisitionGateway implements ExtensionAcquisitionGateway {
	failSpec: string | undefined;
	private readonly installedPackageRoots: Set<string>;
	private readonly ensuredProjectLog: string[] = [];
	private readonly installLog: FakeNpmInstallCall[] = [];
	private readonly failSpecs: ReadonlySet<string>;

	constructor(options: FakeExtensionAcquisitionGatewayOptions = {}) {
		this.installedPackageRoots = new Set(options.installedPackageRoots ?? []);
		this.failSpecs = new Set(options.failSpecs ?? []);
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

	async ensureManagedNpmProject(
		projectDir: string,
	): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.ensuredProjectLog.push(projectDir);
		return resultOk(undefined);
	}

	async isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		return resultOk(this.installedPackageRoots.has(packageRoot));
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
