import { z } from "zod";

import { npmPackageRoot, parseExtensionSourceSpec } from "./acquisition.ts";
import {
	loadExtensionDescriptorFromPackageRoot,
	presentExtensionDescriptorPackageError,
	type DescriptorPackageFileResult,
	type DescriptorPackageImportResult,
	type DescriptorPackageManifestResult,
	type ExtensionDescriptorPackageGateway,
} from "../project-config/extension-package-descriptor.ts";
import { gitExtensionSourceUnsupportedMessage } from "../project-config/extension-source-spec.ts";
import type { ExtensionDescriptor } from "../sdk/descriptor.ts";

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

export type DeclaredDescriptorPackageManifestResult = DescriptorPackageManifestResult;
export type DeclaredDescriptorFileResult = DescriptorPackageFileResult;
export type DeclaredDescriptorImportResult = DescriptorPackageImportResult;
export type DeclaredExtensionDescriptorGateway = ExtensionDescriptorPackageGateway;

export interface LoadDeclaredExtensionDescriptorsOptions {
	readonly repoRoot: string;
	readonly specs: readonly string[];
	readonly gateway?: DeclaredExtensionDescriptorGateway;
}

/** Load only the already-installed extension descriptors named by `specs`, preserving declaration order. */
export async function loadDeclaredExtensionDescriptors(
	options: LoadDeclaredExtensionDescriptorsOptions,
): Promise<LoadDeclaredExtensionDescriptorsResult> {
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
			...(options.gateway === undefined ? {} : { gateway: options.gateway }),
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
	gateway?: DeclaredExtensionDescriptorGateway;
}): Promise<LoadDeclaredExtensionDescriptorResult> {
	const parsed = options.parsed;
	if (!parsed.ok) {
		return failure({ spec: options.spec, code: parsed.error.code, message: parsed.error.message });
	}
	if (parsed.value.kind === "git") {
		return failure({
			spec: options.spec,
			code: "extension_descriptor_source_unsupported",
			message: gitExtensionSourceUnsupportedMessage(options.spec),
		});
	}
	const sourceKind = parsed.value.kind;
	const packageRoot =
		sourceKind === "local"
			? parsed.value.path
			: npmPackageRoot(options.repoRoot, parsed.value.packageName);
	const loaded = await loadExtensionDescriptorFromPackageRoot({
		packageRoot,
		...(options.gateway === undefined ? {} : { gateway: options.gateway }),
	});
	if (!loaded.ok) {
		const presentation = presentExtensionDescriptorPackageError({
			error: loaded.error,
			missingManifest: {
				message: `Declared extension package is not installed: ${packageRoot}.`,
			},
		});
		return failure({
			spec: options.spec,
			code: presentation.code,
			message: presentation.message,
			...(presentation.path === undefined ? {} : { path: presentation.path }),
		});
	}
	if (parsed.value.kind === "npm" && loaded.value.packageName !== parsed.value.packageName) {
		return failure({
			spec: options.spec,
			code: "extension_descriptor_package_identity_mismatch",
			message: `Managed extension package for ${options.spec} declares name ${loaded.value.packageName}; expected ${parsed.value.packageName}.`,
			path: loaded.value.packageJsonPath,
		});
	}
	if (
		parsed.value.kind === "npm" &&
		parsed.value.isPinned &&
		loaded.value.version !== parsed.value.version
	) {
		return failure({
			spec: options.spec,
			code: "extension_descriptor_package_version_mismatch",
			message: `Managed extension package for ${options.spec} is version ${loaded.value.version}; expected ${parsed.value.version}.`,
			path: loaded.value.packageJsonPath,
		});
	}
	return {
		ok: true,
		record: {
			spec: options.spec,
			sourceKind,
			moduleRoot: packageRoot,
			descriptorPath: loaded.value.descriptorPath,
			packageName: loaded.value.packageName,
			version: loaded.value.version,
			descriptor: loaded.value.descriptor,
		},
	};
}

interface LoadDeclaredExtensionDescriptorFailureOptions {
	readonly spec: string;
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}

function failure(
	options: LoadDeclaredExtensionDescriptorFailureOptions,
): LoadDeclaredExtensionDescriptorResult {
	return {
		ok: false,
		diagnostic: {
			severity: "error",
			code: options.code,
			message: options.message,
			spec: options.spec,
			...(options.path === undefined ? {} : { path: options.path }),
		},
	};
}
