import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ClinkrScope } from "@nseng-ai/clinkr/app";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

import {
	declaredExtensionSourceIdentity,
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionDescriptor,
	type DeclaredExtensionDescriptorDiagnostic,
	type DeclaredExtensionDescriptorGateway,
	type DeclaredExtensionNpmPackageRootResolver,
} from "./declared-descriptors.ts";
import type { ExtensionPackageAdmissionDiagnostic } from "./package-admission.ts";
import { loadSourceDevNsCommandSources } from "./source-dev-sources.ts";
import { loadUserExtensionLayer } from "./user-extension-layer.ts";
import {
	declaredExtensionSpecsErrorInfo,
	parseDeclaredExtensionSpecsToml,
} from "../project-config/descriptor-package.ts";
import type { NsExtensionApi } from "../sdk/execution.ts";

export type NsCommandSourceKind = "built-in" | "preinstalled" | "user" | "project";
export type NsCommandSourceOrigin = "host" | "package" | "local";
export type NsCommandHelpClassification = "built-in" | "extension";

export interface NsCommandSourcePackageFacts {
	readonly name: string;
	readonly version: string;
	readonly descriptorPath: string;
}

export type NsCommandSourceComposition = (scope: ClinkrScope<NsExtensionApi>) => void;

export interface NsCommandSource {
	readonly label: string;
	readonly kind: NsCommandSourceKind;
	readonly origin: NsCommandSourceOrigin;
	readonly helpClassification: NsCommandHelpClassification;
	readonly package?: NsCommandSourcePackageFacts;
	readonly commandDirectory?: string;
	readonly compose?: NsCommandSourceComposition;
}

export interface NsCommandSourceDiagnostic {
	readonly severity: "error" | "info";
	readonly code: string;
	readonly message: string;
	readonly path?: string;
	readonly sourceLabel?: string;
}

export interface NsCommandSourceInventory {
	readonly sources: readonly NsCommandSource[];
	readonly diagnostics: readonly NsCommandSourceDiagnostic[];
	readonly extensionPackageNames: ReadonlySet<string>;
	readonly builtInPackageNames: ReadonlySet<string>;
}

export interface PreinstalledNsCommandSource extends NsCommandSource {
	readonly kind: "preinstalled" | "built-in";
}

export type PreinstalledNsCommandSourceLoader = () =>
	| readonly PreinstalledNsCommandSource[]
	| Promise<readonly PreinstalledNsCommandSource[]>;

export interface LoadNsCommandSourceInventoryOptions {
	readonly cwd: string;
	readonly homeDir?: string;
	readonly env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	readonly preinstalledSources?: PreinstalledNsCommandSourceLoader;
}

export type UserExtensionPackageAvailabilityDiagnostic =
	| DeclaredExtensionDescriptorDiagnostic
	| ExtensionPackageAdmissionDiagnostic;

export type UserExtensionPackageAvailabilityFact =
	| {
			readonly sourceSpec: string;
			readonly availability: "available";
			readonly packageName: string;
			readonly diagnostics: readonly UserExtensionPackageAvailabilityDiagnostic[];
	  }
	| {
			readonly sourceSpec: string;
			readonly availability: "unavailable";
			readonly packageName?: string;
			readonly diagnostics: readonly UserExtensionPackageAvailabilityDiagnostic[];
	  };

export interface EvaluateUserExtensionPackageAvailabilityOptions {
	readonly configDir: string;
	readonly sourceSpecs: readonly string[];
	readonly preinstalledSources: PreinstalledNsCommandSourceLoader;
	readonly descriptorGateway?: DeclaredExtensionDescriptorGateway;
	readonly resolveNpmPackageRoot?: DeclaredExtensionNpmPackageRootResolver;
}

/** Evaluate each User declaration as an exact filesystem source, without command preselection. */
export async function evaluateUserExtensionPackageAvailability(
	options: EvaluateUserExtensionPackageAvailabilityOptions,
): Promise<readonly UserExtensionPackageAvailabilityFact[]> {
	const loaded = await loadDeclaredExtensionDescriptors({
		repoRoot: options.configDir,
		specs: options.sourceSpecs,
		localPathPolicy: "absolute-only",
		...(options.descriptorGateway === undefined ? {} : { gateway: options.descriptorGateway }),
		...(options.resolveNpmPackageRoot === undefined
			? {}
			: { resolveNpmPackageRoot: options.resolveNpmPackageRoot }),
	});
	const preinstalled = await options.preinstalledSources();
	const availablePackageNames = new Set(
		preinstalled.flatMap((source) => (source.package === undefined ? [] : [source.package.name])),
	);
	for (const descriptor of loaded.descriptors) availablePackageNames.add(descriptor.packageName);

	return options.sourceSpecs.map((sourceSpec) => {
		const descriptor = loaded.descriptors.find((candidate) => candidate.spec === sourceSpec);
		const diagnostics = loaded.diagnostics.filter(
			(diagnostic) =>
				diagnostic.spec === sourceSpec || diagnostic.relatedSpecs?.includes(sourceSpec) === true,
		);
		if (descriptor === undefined || !availablePackageNames.has(descriptor.packageName)) {
			return { sourceSpec, availability: "unavailable" as const, diagnostics };
		}
		return {
			sourceSpec,
			availability: "available" as const,
			packageName: descriptor.packageName,
			...(descriptor.descriptor.commandDirectory === undefined
				? {}
				: { commandDirectory: descriptor.descriptor.commandDirectory }),
			diagnostics,
		};
	});
}

export async function loadNsCommandSourceInventory(
	options: LoadNsCommandSourceInventoryOptions,
): Promise<NsCommandSourceInventory> {
	const preinstalled =
		options.preinstalledSources === undefined ? [] : await options.preinstalledSources();
	const project = await loadProjectSources(options.cwd);
	const user = await loadUserSources(options, project.declaredSourceIdentities);
	const declared = [...preinstalled, ...user.sources, ...project.sources];
	const sourceDev = await loadSourceDevNsCommandSources({
		cwd: options.cwd,
		contributedPackageNames: new Set(
			declared.flatMap((source) => (source.package === undefined ? [] : [source.package.name])),
		),
	});
	const sources = [...preinstalled, ...sourceDev.sources, ...user.sources, ...project.sources];
	return {
		sources,
		diagnostics: [...sourceDev.diagnostics, ...user.diagnostics, ...project.diagnostics],
		extensionPackageNames: new Set(
			sources.flatMap((source) => (source.package === undefined ? [] : [source.package.name])),
		),
		builtInPackageNames: new Set(
			sources.flatMap((source) =>
				source.kind === "built-in" && source.package !== undefined ? [source.package.name] : [],
			),
		),
	};
}

async function loadProjectSources(cwd: string): Promise<{
	readonly sources: readonly NsCommandSource[];
	readonly diagnostics: readonly NsCommandSourceDiagnostic[];
	readonly declaredSourceIdentities: ReadonlySet<string>;
}> {
	const nsTomlPath = join(cwd, "ns.toml");
	if (!existsSync(nsTomlPath)) {
		return { sources: [], diagnostics: [], declaredSourceIdentities: new Set() };
	}
	const parsed = parseDeclaredExtensionSpecsToml(readFileSync(nsTomlPath, "utf8"));
	if (!parsed.ok) {
		const error = declaredExtensionSpecsErrorInfo(parsed);
		return {
			sources: [],
			diagnostics: [
				{ severity: "error", code: error.code, message: error.message, path: nsTomlPath },
			],
			declaredSourceIdentities: new Set(),
		};
	}
	const loaded = await loadDeclaredExtensionDescriptors({ repoRoot: cwd, specs: parsed.specs });
	const diagnostics: NsCommandSourceDiagnostic[] = loaded.diagnostics.map((diagnostic) => ({
		severity: "error",
		code: diagnostic.code,
		message: diagnostic.message,
		...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
	}));
	return {
		sources: commandSourcesFromDescriptors("project", loaded.descriptors),
		diagnostics,
		declaredSourceIdentities: new Set(
			parsed.specs.flatMap((spec) => {
				const identity = declaredExtensionSourceIdentity(cwd, spec);
				return identity === undefined ? [] : [identity];
			}),
		),
	};
}

async function loadUserSources(
	options: LoadNsCommandSourceInventoryOptions,
	projectSourceIdentities: ReadonlySet<string>,
): Promise<{
	readonly sources: readonly NsCommandSource[];
	readonly diagnostics: readonly NsCommandSourceDiagnostic[];
}> {
	const layer = await loadUserExtensionLayer({
		...options,
		projectSourceIdentities,
	});
	return {
		sources: commandSourcesFromDescriptors("user", layer.descriptors),
		diagnostics: layer.diagnostics.map((diagnostic) => ({
			severity: "error",
			code: diagnostic.code,
			message: diagnostic.message,
			...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
			...(layer.userConfigPath === undefined
				? {}
				: { sourceLabel: `user:${dirname(layer.userConfigPath)}` }),
		})),
	};
}

function commandSourcesFromDescriptors(
	kind: "user" | "project",
	descriptors: readonly DeclaredExtensionDescriptor[],
): readonly NsCommandSource[] {
	return descriptors.map(
		(record): NsCommandSource => ({
			label: `${kind}:${record.packageName}`,
			kind,
			origin: record.sourceKind === "local" ? "local" : "package",
			helpClassification: "extension",
			package: {
				name: record.packageName,
				version: record.version,
				descriptorPath: record.descriptorPath,
			},
			...(record.descriptor.commandDirectory === undefined
				? {}
				: { commandDirectory: record.descriptor.commandDirectory }),
		}),
	);
}
