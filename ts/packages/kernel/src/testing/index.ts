import { join } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type {
	ExtensionAcquisitionDiagnostic,
	ExtensionAcquisitionGateway,
} from "../extensions/acquisition.ts";

export interface FakeNpmInstallCall {
	readonly rawSpec: string;
	readonly packageName: string;
	readonly version: string | undefined;
	readonly isPinned: boolean;
}

export class FakeExtensionAcquisitionGateway implements ExtensionAcquisitionGateway {
	readonly installed = new Set<string>();
	readonly installs: FakeNpmInstallCall[] = [];
	ensureCalls = 0;
	failSpec: string | undefined;

	async ensureManagedNpmProject(): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.ensureCalls += 1;
		return resultOk(undefined);
	}

	async isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		return resultOk(this.installed.has(packageRoot));
	}

	async installNpmPackage(request: {
		projectDir: string;
		rawSpec: string;
		packageName: string;
		version: string | undefined;
		isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.installs.push({
			rawSpec: request.rawSpec,
			packageName: request.packageName,
			version: request.version,
			isPinned: request.isPinned,
		});
		if (request.rawSpec === this.failSpec) {
			return resultErr({
				code: "extension_acquisition_npm_install_failed",
				message: `failed ${request.rawSpec}`,
				spec: request.rawSpec,
			});
		}
		this.installed.add(join(request.projectDir, "node_modules", request.packageName));
		return resultOk(undefined);
	}
}
