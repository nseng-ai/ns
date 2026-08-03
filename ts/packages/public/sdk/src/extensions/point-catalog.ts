import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	declaredExtensionSourceIdentity,
	type DeclaredExtensionDescriptor,
} from "./declared-descriptors.ts";
import {
	loadEffectiveUserExtensionLayer,
	type EffectiveUserExtensionLayer,
} from "./user-extension-layer.ts";
import {
	declaredExtensionSpecsErrorInfo,
	parseDeclaredExtensionSpecsToml,
	resolveAcquiredDescriptorPackageRoot,
} from "../project-config/descriptor-package.ts";
import {
	loadExtensionDescriptorFromPackageRoot,
	presentExtensionDescriptorPackageError,
} from "../project-config/extension-package-descriptor.ts";
import {
	gitExtensionSourceUnsupportedMessage,
	parseExtensionSourceSpec,
} from "../project-config/extension-source-spec.ts";
import {
	buildPointCatalog,
	builtInPointDefinitions,
	composeLayeredPointDefinitions,
	emptyLoadedProjectConfig,
	loadProjectConfig,
	pointDefinitionsForDescriptor,
	type PointCatalog,
	type PointDefinition,
	type ProjectConfigDiagnostic,
	type ProjectConfigGateway,
	type PromptPointEnvOverride,
	type ScopedPointDefinition,
	type SettingsSchema,
} from "../project-config/points.ts";
import { makeSdkDiagnostic } from "../runtime/diagnostics.ts";

/**
 * Descriptor-aware point catalog coordinator (ADR 0055).
 *
 * Point definitions layer as built-in fallback < enabled User descriptors <
 * Project descriptors, gated by the same effective User extension layer the
 * command catalog consumes. Point installations remain Project-owned: only
 * the project `ns.toml` `[points]` table, repo prompt conventions, and env
 * overrides install anything.
 */
export async function loadPointCatalogWithDescriptors(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions?: readonly PointDefinition[];
	settingsSchemas?: readonly SettingsSchema[];
	promptEnvOverride?: PromptPointEnvOverride;
	env?: Record<string, string | undefined>;
	homeDir?: string;
}): Promise<PointCatalog> {
	const layered =
		request.pointDefinitions === undefined
			? await discoverLayeredPointDefinitions(request)
			: { pointDefinitions: request.pointDefinitions, diagnostics: [] };
	const configResult = loadProjectConfig({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions: layered.pointDefinitions,
		settingsSchemas: request.settingsSchemas ?? [],
	});
	return buildPointCatalog({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions: layered.pointDefinitions,
		config: configResult.config ?? emptyLoadedProjectConfig,
		diagnostics: [...layered.diagnostics, ...configResult.diagnostics],
		...optionalEntry("promptEnvOverride", request.promptEnvOverride),
		env: request.env ?? {},
	});
}

async function discoverLayeredPointDefinitions(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	env?: Record<string, string | undefined>;
	homeDir?: string;
}): Promise<{
	pointDefinitions: readonly PointDefinition[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}> {
	const project = await discoverProjectDescriptorPointDefinitions(
		request.repoRoot,
		request.gateway,
	);
	const userLayer = await loadEffectiveUserExtensionLayer({
		...optionalEntries({ env: request.env, homeDir: request.homeDir }),
		projectSourceIdentities: new Set(project.declaredSourceIdentities),
	});
	const layered = composeLayeredPointDefinitions({
		fallbackDefinitions: builtInPointDefinitions,
		userDefinitions: userLayerPointDefinitions(userLayer),
		projectDefinitions: project.pointDefinitions,
	});
	return {
		pointDefinitions: layered.pointDefinitions,
		diagnostics: [
			...project.diagnostics,
			...userLayer.diagnostics.map((layerDiagnostic) =>
				diagnostic(
					layerDiagnostic.code,
					layerDiagnostic.message,
					optionalEntry("path", layerDiagnostic.path),
				),
			),
			...layered.diagnostics,
		],
	};
}

function userLayerPointDefinitions(
	layer: EffectiveUserExtensionLayer,
): readonly ScopedPointDefinition[] {
	if (!layer.decision.enabled) return [];
	return layer.descriptors.flatMap((record) => scopedDescriptorPointDefinitions(record));
}

function scopedDescriptorPointDefinitions(
	record: DeclaredExtensionDescriptor,
): readonly ScopedPointDefinition[] {
	return pointDefinitionsForDescriptor(record.descriptor, record.descriptorPath).map(
		(definition) => ({ definition, sourceLabel: `${record.spec} (${record.descriptorPath})` }),
	);
}

interface ProjectDescriptorPointDiscovery {
	pointDefinitions: readonly ScopedPointDefinition[];
	declaredSourceIdentities: readonly string[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}

async function discoverProjectDescriptorPointDefinitions(
	repoRoot: string,
	gateway: ProjectConfigGateway,
): Promise<ProjectDescriptorPointDiscovery> {
	const declared = readDeclaredExtensionSpecs(repoRoot, gateway);
	if (!declared.ok) {
		return {
			pointDefinitions: [],
			declaredSourceIdentities: [],
			diagnostics: [declared.diagnostic],
		};
	}
	const pointDefinitions: ScopedPointDefinition[] = [];
	const diagnostics: ProjectConfigDiagnostic[] = [];
	for (const spec of declared.specs) {
		const loaded = await loadDescriptorPointDefinitions({ repoRoot, spec });
		pointDefinitions.push(...loaded.pointDefinitions);
		diagnostics.push(...loaded.diagnostics);
	}
	return {
		pointDefinitions,
		declaredSourceIdentities: declared.specs.flatMap((spec) => {
			const identity = declaredExtensionSourceIdentity(repoRoot, spec);
			return identity === undefined ? [] : [identity];
		}),
		diagnostics,
	};
}

function readDeclaredExtensionSpecs(
	repoRoot: string,
	gateway: ProjectConfigGateway,
): { ok: true; specs: readonly string[] } | { ok: false; diagnostic: ProjectConfigDiagnostic } {
	const readResult = gateway.readTextFile({ repoRoot, relativePath: "ns.toml" });
	if (readResult.type === "missing") return { ok: true, specs: [] };
	if (readResult.type === "error") {
		return {
			ok: false,
			diagnostic: diagnostic("ns_toml_read_failed", readResult.message, { path: "ns.toml" }),
		};
	}
	const parsed = parseDeclaredExtensionSpecsToml(readResult.text);
	if (parsed.ok) return parsed;
	const errorInfo = declaredExtensionSpecsErrorInfo(parsed);
	return {
		ok: false,
		diagnostic: diagnostic(errorInfo.code, errorInfo.message, { path: errorInfo.path }),
	};
}

async function loadDescriptorPointDefinitions(request: {
	repoRoot: string;
	spec: string;
}): Promise<{
	pointDefinitions: readonly ScopedPointDefinition[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}> {
	const parsed = parseExtensionSourceSpec(request.repoRoot, request.spec);
	if (!parsed.ok) {
		return {
			pointDefinitions: [],
			diagnostics: [diagnostic(parsed.error.code, parsed.error.message, { path: request.spec })],
		};
	}
	if (parsed.value.kind === "git") {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_descriptor_source_unsupported",
					gitExtensionSourceUnsupportedMessage(request.spec),
					{ path: request.spec },
				),
			],
		};
	}
	const acquisition = resolveAcquiredDescriptorPackageRoot({
		repoRoot: request.repoRoot,
		spec: request.spec,
	});
	const loaded = await loadExtensionDescriptorFromPackageRoot({
		packageRoot: acquisition.packageRoot,
	});
	if (!loaded.ok) {
		const presentation = presentExtensionDescriptorPackageError({
			error: loaded.error,
			missingManifest: {
				code: "extension_descriptor_package_json_read_failed",
				message: `Could not read extension package manifest ${loaded.error.packageJsonPath}.\nFile does not exist.`,
			},
		});
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(presentation.code, presentation.message, { path: presentation.path }),
			],
		};
	}
	return {
		pointDefinitions: pointDefinitionsForDescriptor(
			loaded.value.descriptor,
			loaded.value.descriptorPath,
		).map((definition) => ({
			definition,
			sourceLabel: `${request.spec} (${loaded.value.descriptorPath})`,
		})),
		diagnostics: [],
	};
}

function diagnostic(
	code: string,
	message: string,
	options: { path?: string } = {},
): ProjectConfigDiagnostic {
	return makeSdkDiagnostic({
		code,
		message,
		...optionalEntry("path", options.path),
	});
}
