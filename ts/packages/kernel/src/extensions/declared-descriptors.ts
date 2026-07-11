import { readFile, stat } from "node:fs/promises";

import { formatErrorMessage, isNodeErrorCode } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { npmPackageRoot, parseExtensionSourceSpec } from "./acquisition.ts";
import {
	descriptorExportPathErrorInfo,
	resolveDescriptorExportPath,
} from "../project-config/descriptor-package.ts";
import { loadNsUserModuleDefault } from "../runtime/module-loader.ts";
import { validateExtensionDescriptor, type ExtensionDescriptor } from "../sdk/descriptor.ts";

const extensionPackageManifestSchema = z
	.object({
		name: z.string().min(1),
		version: z.string().min(1),
	})
	.passthrough();

export interface DeclaredExtensionDescriptor {
	readonly spec: string;
	readonly sourceKind: "local" | "npm";
	readonly moduleRoot: string;
	readonly descriptorPath: string;
	readonly packageName: string;
	readonly version: string;
	readonly descriptor: ExtensionDescriptor;
}

export interface DeclaredExtensionDescriptorDiagnostic {
	readonly severity: "error";
	readonly code: string;
	readonly message: string;
	readonly spec: string;
	readonly relatedSpecs?: readonly string[];
	readonly path?: string;
}

export const declaredExtensionDescriptorDiagnosticSchema = z.object({
	severity: z.literal("error"),
	code: z.string(),
	message: z.string(),
	spec: z.string(),
	relatedSpecs: z.array(z.string()).readonly().optional(),
	path: z.string().optional(),
});

export interface LoadDeclaredExtensionDescriptorsResult {
	readonly descriptors: readonly DeclaredExtensionDescriptor[];
	readonly diagnostics: readonly DeclaredExtensionDescriptorDiagnostic[];
}

export type DeclaredDescriptorPackageManifestResult =
	| { readonly type: "found"; readonly manifest: unknown }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly message: string };

export type DeclaredDescriptorFileResult =
	| { readonly type: "found" }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly message: string };

export type DeclaredDescriptorImportResult =
	| { readonly ok: true; readonly defaultExport: unknown }
	| { readonly ok: false; readonly message: string };

export interface DeclaredExtensionDescriptorGateway {
	readPackageManifest(packageJsonPath: string): Promise<DeclaredDescriptorPackageManifestResult>;
	inspectDescriptorFile(descriptorPath: string): Promise<DeclaredDescriptorFileResult>;
	importDescriptorDefault(descriptorPath: string): Promise<DeclaredDescriptorImportResult>;
}

export interface LoadDeclaredExtensionDescriptorsOptions {
	readonly repoRoot: string;
	readonly specs: readonly string[];
	readonly gateway?: DeclaredExtensionDescriptorGateway;
}

export const nodeDeclaredExtensionDescriptorGateway: DeclaredExtensionDescriptorGateway = {
	async readPackageManifest(packageJsonPath) {
		try {
			return { type: "found", manifest: JSON.parse(await readFile(packageJsonPath, "utf8")) };
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

/** Load only the already-installed extension descriptors named by `specs`, preserving declaration order. */
export async function loadDeclaredExtensionDescriptors(
	options: LoadDeclaredExtensionDescriptorsOptions,
): Promise<LoadDeclaredExtensionDescriptorsResult> {
	const gateway = options.gateway ?? nodeDeclaredExtensionDescriptorGateway;
	const declarations = normalizeDeclaredExtensionSpecs(options.repoRoot, options.specs);
	const duplicateSpecsByIdentity = duplicateSpecsByIdentityFrom(declarations);
	const descriptors: DeclaredExtensionDescriptor[] = [];
	const diagnostics: DeclaredExtensionDescriptorDiagnostic[] = [];
	const reportedDuplicateIdentities = new Set<string>();

	for (const declaration of declarations) {
		if (declaration.identity !== undefined) {
			const duplicateSpecs = duplicateSpecsByIdentity.get(declaration.identity);
			if (duplicateSpecs !== undefined) {
				if (!reportedDuplicateIdentities.has(declaration.identity)) {
					diagnostics.push(duplicateIdentityDiagnostic(duplicateSpecs));
					reportedDuplicateIdentities.add(declaration.identity);
				}
				continue;
			}
		}
		const loaded = await loadDeclaredExtensionDescriptor({
			repoRoot: options.repoRoot,
			spec: declaration.spec,
			parsed: declaration.parsed,
			gateway,
		});
		if (loaded.ok) descriptors.push(loaded.record);
		else diagnostics.push(loaded.diagnostic);
	}

	return { descriptors, diagnostics };
}

interface NormalizedDeclaredExtensionSpec {
	readonly spec: string;
	readonly parsed: ReturnType<typeof parseExtensionSourceSpec>;
	readonly identity?: string;
}

function normalizeDeclaredExtensionSpecs(
	repoRoot: string,
	specs: readonly string[],
): readonly NormalizedDeclaredExtensionSpec[] {
	return specs.map((spec) => {
		const parsed = parseExtensionSourceSpec(repoRoot, spec);
		if (!parsed.ok) return { spec, parsed };
		const identity =
			parsed.value.kind === "npm"
				? `npm:${parsed.value.packageName}`
				: parsed.value.kind === "local"
					? `local:${parsed.value.path}`
					: `git:${parsed.value.raw}`;
		return { spec, parsed, identity };
	});
}

function duplicateSpecsByIdentityFrom(
	declarations: readonly NormalizedDeclaredExtensionSpec[],
): ReadonlyMap<string, readonly string[]> {
	const specsByIdentity = new Map<string, string[]>();
	for (const declaration of declarations) {
		if (declaration.identity === undefined) continue;
		const specs = specsByIdentity.get(declaration.identity);
		if (specs === undefined) specsByIdentity.set(declaration.identity, [declaration.spec]);
		else specs.push(declaration.spec);
	}
	return new Map([...specsByIdentity].filter(([, specs]) => specs.length > 1));
}

function duplicateIdentityDiagnostic(
	specs: readonly string[],
): DeclaredExtensionDescriptorDiagnostic {
	const [spec, ...relatedSpecs] = specs;
	if (spec === undefined) throw new Error("Duplicate extension identity group must not be empty.");
	return {
		severity: "error",
		code: "extension_descriptor_duplicate_identity",
		message: `Declared extension ${spec} has duplicate declarations: ${relatedSpecs.join(", ")}.`,
		spec,
		relatedSpecs,
	};
}

type LoadDeclaredExtensionDescriptorResult =
	| { readonly ok: true; readonly record: DeclaredExtensionDescriptor }
	| { readonly ok: false; readonly diagnostic: DeclaredExtensionDescriptorDiagnostic };

async function loadDeclaredExtensionDescriptor(options: {
	repoRoot: string;
	spec: string;
	parsed: ReturnType<typeof parseExtensionSourceSpec>;
	gateway: DeclaredExtensionDescriptorGateway;
}): Promise<LoadDeclaredExtensionDescriptorResult> {
	const parsed = options.parsed;
	if (!parsed.ok) {
		return failure(options.spec, parsed.error.code, parsed.error.message);
	}
	if (parsed.value.kind === "git") {
		return failure(
			options.spec,
			"extension_descriptor_source_unsupported",
			`Git extension sources are reserved but unsupported: ${options.spec}.`,
		);
	}
	const sourceKind = parsed.value.kind;
	const packageRoot =
		sourceKind === "local"
			? parsed.value.path
			: npmPackageRoot(options.repoRoot, parsed.value.packageName);
	const packageJsonPath = `${packageRoot}/package.json`;
	const manifest = await options.gateway.readPackageManifest(packageJsonPath);
	if (manifest.type === "missing") {
		return failure(
			options.spec,
			"extension_descriptor_package_missing",
			`Declared extension package is not installed: ${packageRoot}.`,
			packageJsonPath,
		);
	}
	if (manifest.type === "error") {
		return failure(
			options.spec,
			"extension_descriptor_package_json_read_failed",
			`Could not read extension package manifest ${packageJsonPath}.\n${manifest.message}`,
			packageJsonPath,
		);
	}
	const packageManifest = extensionPackageManifestSchema.safeParse(manifest.manifest);
	if (!packageManifest.success) {
		return failure(
			options.spec,
			"extension_descriptor_package_json_invalid",
			`Extension package manifest must declare non-empty name and version fields: ${packageJsonPath}.`,
			packageJsonPath,
		);
	}
	if (parsed.value.kind === "npm" && packageManifest.data.name !== parsed.value.packageName) {
		return failure(
			options.spec,
			"extension_descriptor_package_identity_mismatch",
			`Managed extension package for ${options.spec} declares name ${packageManifest.data.name}; expected ${parsed.value.packageName}.`,
			packageJsonPath,
		);
	}
	if (
		parsed.value.kind === "npm" &&
		parsed.value.isPinned &&
		packageManifest.data.version !== parsed.value.version
	) {
		return failure(
			options.spec,
			"extension_descriptor_package_version_mismatch",
			`Managed extension package for ${options.spec} is version ${packageManifest.data.version}; expected ${parsed.value.version}.`,
			packageJsonPath,
		);
	}
	const exportPath = resolveDescriptorExportPath(packageRoot, packageManifest.data);
	if (!exportPath.ok) {
		const errorInfo = descriptorExportPathErrorInfo(exportPath, packageJsonPath);
		return failure(options.spec, errorInfo.code, errorInfo.message, packageJsonPath);
	}
	const descriptorFile = await options.gateway.inspectDescriptorFile(exportPath.path);
	if (descriptorFile.type !== "found") {
		const suffix = descriptorFile.type === "error" ? `\n${descriptorFile.message}` : "";
		return failure(
			options.spec,
			"extension_descriptor_export_missing_file",
			`Extension descriptor export does not resolve to a file: ${exportPath.target}.${suffix}`,
			exportPath.path,
		);
	}
	const imported = await options.gateway.importDescriptorDefault(exportPath.path);
	if (!imported.ok) {
		return failure(
			options.spec,
			"extension_descriptor_import_failed",
			`Failed to load ns extension descriptor ${exportPath.path}.\n${imported.message}`,
			exportPath.path,
		);
	}
	const validation = validateExtensionDescriptor(imported.defaultExport, exportPath.path);
	if (!validation.ok) {
		return failure(
			options.spec,
			"extension_descriptor_invalid",
			validation.message,
			exportPath.path,
		);
	}
	return {
		ok: true,
		record: {
			spec: options.spec,
			sourceKind,
			moduleRoot: packageRoot,
			descriptorPath: exportPath.path,
			packageName: packageManifest.data.name,
			version: packageManifest.data.version,
			descriptor: validation.descriptor,
		},
	};
}

function failure(
	spec: string,
	code: string,
	message: string,
	path?: string,
): LoadDeclaredExtensionDescriptorResult {
	return {
		ok: false,
		diagnostic: {
			severity: "error",
			code,
			message,
			spec,
			...(path === undefined ? {} : { path }),
		},
	};
}
