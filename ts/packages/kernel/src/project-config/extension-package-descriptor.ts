import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { formatErrorMessage, isNodeErrorCode } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	descriptorExportPathErrorInfo,
	resolveDescriptorExportPath,
} from "./descriptor-package.ts";
import { loadNsUserModuleDefault } from "../runtime/module-loader.ts";
import { validateExtensionDescriptor, type ExtensionDescriptor } from "../sdk/descriptor.ts";

const extensionPackageManifestSchema = z
	.object({ name: z.string().min(1), version: z.string().min(1) })
	.passthrough();

export type DescriptorPackageManifestResult =
	| { readonly type: "found"; readonly text: string }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly message: string };

export type DescriptorPackageFileResult =
	| { readonly type: "found" }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly message: string };

export type DescriptorPackageImportResult =
	| { readonly ok: true; readonly defaultExport: unknown }
	| { readonly ok: false; readonly message: string };

export interface ExtensionDescriptorPackageGateway {
	readPackageManifest(packageJsonPath: string): Promise<DescriptorPackageManifestResult>;
	inspectDescriptorFile(descriptorPath: string): Promise<DescriptorPackageFileResult>;
	importDescriptorDefault(descriptorPath: string): Promise<DescriptorPackageImportResult>;
}

export interface LoadedExtensionDescriptorPackage {
	readonly packageRoot: string;
	readonly packageJsonPath: string;
	readonly packageName: string;
	readonly version: string;
	readonly descriptorPath: string;
	readonly descriptor: ExtensionDescriptor;
}

export interface ExtensionDescriptorPackageError {
	readonly type:
		| "package-manifest-missing"
		| "package-manifest-read-failed"
		| "package-manifest-invalid"
		| "descriptor-export-invalid"
		| "descriptor-file-missing"
		| "descriptor-import-failed"
		| "descriptor-invalid";
	readonly code: string;
	readonly message: string;
	readonly path: string;
	readonly packageJsonPath: string;
	readonly candidatePath?: string;
	readonly causeMessage?: string;
}

export type LoadExtensionDescriptorFromPackageRootResult =
	| { readonly ok: true; readonly value: LoadedExtensionDescriptorPackage }
	| { readonly ok: false; readonly error: ExtensionDescriptorPackageError };

export const nodeExtensionDescriptorPackageGateway: ExtensionDescriptorPackageGateway = {
	async readPackageManifest(packageJsonPath) {
		try {
			return { type: "found", text: await readFile(packageJsonPath, "utf8") };
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
			return { type: "error", message: formatErrorMessage(error) };
		}
	},
	async inspectDescriptorFile(descriptorPath) {
		try {
			const file = await stat(descriptorPath);
			return file.isFile() ? { type: "found" } : { type: "missing" };
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
			return { type: "error", message: formatErrorMessage(error) };
		}
	},
	async importDescriptorDefault(descriptorPath) {
		try {
			return { ok: true, defaultExport: await loadNsUserModuleDefault(descriptorPath) };
		} catch (error) {
			return { ok: false, message: formatErrorMessage(error) };
		}
	},
};

/** Load and validate the descriptor contract rooted at one already-resolved package directory. */
export async function loadExtensionDescriptorFromPackageRoot(options: {
	readonly packageRoot: string;
	readonly gateway?: ExtensionDescriptorPackageGateway;
}): Promise<LoadExtensionDescriptorFromPackageRootResult> {
	const gateway = options.gateway ?? nodeExtensionDescriptorPackageGateway;
	const packageJsonPath = join(options.packageRoot, "package.json");
	const manifest = await gateway.readPackageManifest(packageJsonPath);
	if (manifest.type === "missing") {
		return packageFailure(
			"package-manifest-missing",
			"extension_descriptor_package_missing",
			`Extension package manifest is missing: ${packageJsonPath}.`,
			packageJsonPath,
			packageJsonPath,
		);
	}
	if (manifest.type === "error") {
		return packageFailure(
			"package-manifest-read-failed",
			"extension_descriptor_package_json_read_failed",
			`Could not read extension package manifest ${packageJsonPath}.\n${manifest.message}`,
			packageJsonPath,
			packageJsonPath,
			undefined,
			manifest.message,
		);
	}
	let packageManifestValue: unknown;
	try {
		packageManifestValue = JSON.parse(manifest.text);
	} catch (error) {
		return packageFailure(
			"package-manifest-invalid",
			"extension_descriptor_package_json_invalid",
			`Extension package manifest is not valid JSON: ${packageJsonPath}.\n${formatErrorMessage(error)}`,
			packageJsonPath,
			packageJsonPath,
		);
	}
	const packageManifest = extensionPackageManifestSchema.safeParse(packageManifestValue);
	if (!packageManifest.success) {
		return packageFailure(
			"package-manifest-invalid",
			"extension_descriptor_package_json_invalid",
			`Extension package manifest must declare non-empty name and version fields: ${packageJsonPath}.`,
			packageJsonPath,
			packageJsonPath,
		);
	}
	const exportPath = resolveDescriptorExportPath(options.packageRoot, packageManifest.data);
	if (!exportPath.ok) {
		const errorInfo = descriptorExportPathErrorInfo(exportPath, packageJsonPath);
		return packageFailure(
			"descriptor-export-invalid",
			errorInfo.code,
			errorInfo.message,
			packageJsonPath,
			packageJsonPath,
		);
	}
	const descriptorFile = await gateway.inspectDescriptorFile(exportPath.path);
	if (descriptorFile.type !== "found") {
		const suffix = descriptorFile.type === "error" ? `\n${descriptorFile.message}` : "";
		return packageFailure(
			"descriptor-file-missing",
			"extension_descriptor_export_missing_file",
			`Extension descriptor export does not resolve to a file: ${exportPath.target}.${suffix}`,
			exportPath.path,
			packageJsonPath,
			exportPath.path,
			descriptorFile.type === "error" ? descriptorFile.message : undefined,
		);
	}
	const imported = await gateway.importDescriptorDefault(exportPath.path);
	if (!imported.ok) {
		return packageFailure(
			"descriptor-import-failed",
			"extension_descriptor_import_failed",
			`Failed to load ns extension descriptor ${exportPath.path}.\n${imported.message}`,
			exportPath.path,
			packageJsonPath,
			exportPath.path,
			imported.message,
		);
	}
	const validation = validateExtensionDescriptor(imported.defaultExport, exportPath.path);
	if (!validation.ok) {
		return packageFailure(
			"descriptor-invalid",
			"extension_descriptor_invalid",
			validation.message,
			exportPath.path,
			packageJsonPath,
			exportPath.path,
		);
	}
	return {
		ok: true,
		value: {
			packageRoot: options.packageRoot,
			packageJsonPath,
			packageName: packageManifest.data.name,
			version: packageManifest.data.version,
			descriptorPath: exportPath.path,
			descriptor: validation.descriptor,
		},
	};
}

function packageFailure(
	type: ExtensionDescriptorPackageError["type"],
	code: string,
	message: string,
	path: string,
	packageJsonPath: string,
	candidatePath?: string,
	causeMessage?: string,
): LoadExtensionDescriptorFromPackageRootResult {
	return {
		ok: false,
		error: {
			type,
			code,
			message,
			path,
			packageJsonPath,
			...(candidatePath === undefined ? {} : { candidatePath }),
			...(causeMessage === undefined ? {} : { causeMessage }),
		},
	};
}
