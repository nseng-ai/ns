import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import { isRecord } from "@ns/core/primitives";

import {
	defineExtension,
	defineRepoLocalNsExtensionDescriptor,
	failed,
	noopNsCommandIo,
	repoLocalNsCommandDescriptor,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	nsExtensionManifestCommandSchema,
	nsExtensionManifestSchema,
	nsExtensionPackageManifestSchema,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} from "../sdk/index.ts";

const NS_SDK_DIR = dirname(fileURLToPath(import.meta.url));
const NS_SRC_DIR = dirname(NS_SDK_DIR);

/** Module specifier that ns command entries import the SDK from. */
const SDK_SPECIFIER = "@ns/kernel/sdk";
const CCC_AUTOSLOT_SPECIFIER = "@ns/ccc/autoslot";
const CCC_LAND_SPECIFIER = "@ns/ccc/land";
const CCC_TRUNK_PULL_SPECIFIER = "@ns/ccc/trunk-pull";
const EXEC_SPECIFIER = "@ns/core/exec";
const CAPABILITY_KIT_MODEL_SLUG_SPECIFIER = "@ns/capability-kit/model-slug";
const CORE_MODEL_SLUG_SPECIFIER = "@ns/core/model-slug";
const CORE_PRIMITIVES_SPECIFIER = "@ns/core/primitives";
const CORE_TEXT_NORMALIZATION_SPECIFIER = "@ns/core/text-normalization";
const GIT_SPECIFIER = "@ns/capability-kit/git";
const ADDRESS_PACKAGE_NAME = "@ns/address";
const ARETRO_PACKAGE_NAME = "@ns/aretro";
const BRANCH_CONTEXT_PACKAGE_NAME = "@ns/branch-context";
const HANDOFF_PACKAGE_NAME = "@ns/handoff";
const OBJECTIVE_PACKAGE_NAME = "@ns/objective";
const FLOW_PACKAGE_NAME = "@ns/flow";
const ROASTER_PACKAGE_NAME = "@ns/roaster";

const CCC_SRC_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "ccc", "src");
const CORE_SRC_DIR = join(NS_SRC_DIR, "..", "..", "infra", "core", "src");
const CAPABILITY_KIT_SRC_DIR = join(NS_SRC_DIR, "..", "..", "capability-kit", "src");
const ADDRESS_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "address");
const ADDRESS_PACKAGE_JSON_PATH = join(ADDRESS_PACKAGE_DIR, "package.json");
const ARETRO_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "aretro");
const ARETRO_PACKAGE_JSON_PATH = join(ARETRO_PACKAGE_DIR, "package.json");
const BRANCH_CONTEXT_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "branch-context");
const BRANCH_CONTEXT_PACKAGE_JSON_PATH = join(BRANCH_CONTEXT_PACKAGE_DIR, "package.json");
const HANDOFF_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "handoff");
const HANDOFF_PACKAGE_JSON_PATH = join(HANDOFF_PACKAGE_DIR, "package.json");
const OBJECTIVE_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "objective");
const OBJECTIVE_PACKAGE_JSON_PATH = join(OBJECTIVE_PACKAGE_DIR, "package.json");
const FLOW_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "flow");
const FLOW_PACKAGE_JSON_PATH = join(FLOW_PACKAGE_DIR, "package.json");
const ROASTER_PACKAGE_DIR = join(NS_SRC_DIR, "..", "..", "capabilities", "roaster");
const ROASTER_PACKAGE_JSON_PATH = join(ROASTER_PACKAGE_DIR, "package.json");
const CCC_AUTOSLOT_MODULE_PATH = join(CCC_SRC_DIR, "ns", "autoslot.ts");
const CCC_LAND_MODULE_PATH = join(CCC_SRC_DIR, "ns", "land.ts");
const CCC_TRUNK_PULL_MODULE_PATH = join(CCC_SRC_DIR, "ns", "trunk-pull.ts");
const EXEC_MODULE_PATH = join(CORE_SRC_DIR, "exec", "index.ts");
const CAPABILITY_KIT_MODEL_SLUG_MODULE_PATH = join(CAPABILITY_KIT_SRC_DIR, "kit", "model-slug.ts");
const CORE_MODEL_SLUG_MODULE_PATH = join(CORE_SRC_DIR, "primitives", "model-slug.ts");
const CORE_PRIMITIVES_MODULE_PATH = join(CORE_SRC_DIR, "primitives", "primitives.ts");
const CORE_TEXT_NORMALIZATION_MODULE_PATH = join(CORE_SRC_DIR, "terminal", "text-normalization.ts");
const GIT_MODULE_PATH = join(CAPABILITY_KIT_SRC_DIR, "git", "index.ts");

const NS_INTERNAL_WORKSPACE_MODULE_PATHS = {
	"@ns/kernel/cli": "cli/index.ts",
	"@ns/kernel/context": "cli/context.ts",
	"@ns/kernel/pi-text-generation": "runtime/pi-text-generation.ts",
} as const;

const CAPABILITY_KIT_MODULE_PATHS = {
	"@ns/capability-kit/checkpoint-flow": "kit/checkpoint-flow.ts",
	"@ns/capability-kit/checkpoint-message": "kit/checkpoint-message.ts",
	"@ns/capability-kit/pending-worktree": "kit/pending-worktree.ts",
	"@ns/capability-kit/temp-files": "kit/temp-files.ts",
	"@ns/capability-kit/text-generation": "kit/text-generation.ts",
	"@ns/capability-kit/text-repair": "kit/text-repair.ts",
} as const;

function buildInternalWorkspaceAliases(): Record<string, string> {
	return {
		...buildModuleAliasMap(NS_SRC_DIR, NS_INTERNAL_WORKSPACE_MODULE_PATHS),
		...buildModuleAliasMap(CAPABILITY_KIT_SRC_DIR, CAPABILITY_KIT_MODULE_PATHS),
	};
}

function buildModuleAliasMap(
	baseDir: string,
	modulePaths: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(modulePaths).map(([specifier, relativePath]) => [
			specifier,
			join(baseDir, relativePath),
		]),
	);
}

const NS_COMMAND_EXPORT_PREFIX = "./ns/commands/";

const PACKAGE_COMMAND_ALIAS_SOURCES = [
	{
		packageName: ADDRESS_PACKAGE_NAME,
		packageDir: ADDRESS_PACKAGE_DIR,
		packageJsonPath: ADDRESS_PACKAGE_JSON_PATH,
		exportPrefix: NS_COMMAND_EXPORT_PREFIX,
	},
	{
		packageName: ARETRO_PACKAGE_NAME,
		packageDir: ARETRO_PACKAGE_DIR,
		packageJsonPath: ARETRO_PACKAGE_JSON_PATH,
		exportPrefix: NS_COMMAND_EXPORT_PREFIX,
	},
	{
		packageName: BRANCH_CONTEXT_PACKAGE_NAME,
		packageDir: BRANCH_CONTEXT_PACKAGE_DIR,
		packageJsonPath: BRANCH_CONTEXT_PACKAGE_JSON_PATH,
		exportPrefix: NS_COMMAND_EXPORT_PREFIX,
	},
	{
		packageName: HANDOFF_PACKAGE_NAME,
		packageDir: HANDOFF_PACKAGE_DIR,
		packageJsonPath: HANDOFF_PACKAGE_JSON_PATH,
		exportPrefix: NS_COMMAND_EXPORT_PREFIX,
	},
	{
		packageName: OBJECTIVE_PACKAGE_NAME,
		packageDir: OBJECTIVE_PACKAGE_DIR,
		packageJsonPath: OBJECTIVE_PACKAGE_JSON_PATH,
		exportPrefix: NS_COMMAND_EXPORT_PREFIX,
	},
	{
		packageName: FLOW_PACKAGE_NAME,
		packageDir: FLOW_PACKAGE_DIR,
		packageJsonPath: FLOW_PACKAGE_JSON_PATH,
		exportPrefix: "./commands/",
	},
	{
		packageName: ROASTER_PACKAGE_NAME,
		packageDir: ROASTER_PACKAGE_DIR,
		packageJsonPath: ROASTER_PACKAGE_JSON_PATH,
		exportPrefix: "./commands/",
	},
] as const satisfies readonly PackageCommandAliasSource[];

interface PackageCommandAliasSource {
	packageName: string;
	packageDir: string;
	packageJsonPath: string;
	exportPrefix: string;
}

function buildAllPackageCommandAliases(): Record<string, string> {
	return Object.assign({}, ...PACKAGE_COMMAND_ALIAS_SOURCES.map(buildPackageCommandAliases));
}

function buildPackageCommandAliases(options: {
	packageName: string;
	packageDir: string;
	packageJsonPath: string;
	exportPrefix: string;
}): Record<string, string> {
	return buildPackageExportAliases({
		...options,
		includeSubpath: (subpath) => subpath.startsWith(options.exportPrefix),
	});
}

function buildPackageExportAliases(options: {
	packageName: string;
	packageDir: string;
	packageJsonPath: string;
	exportSubpaths?: readonly string[];
	includeSubpath?: (subpath: string) => boolean;
}): Record<string, string> {
	const packageJson = readCommandPackageJson(options.packageJsonPath, options.packageName);
	if (packageJson.name !== options.packageName) {
		throw new Error(
			`Expected extension package name ${options.packageName}, found ${packageJson.name}.`,
		);
	}
	const exportSubpaths = new Set(options.exportSubpaths);
	const includeSubpath = options.includeSubpath ?? ((subpath) => exportSubpaths.has(subpath));

	return Object.fromEntries(
		Object.entries(packageJson.exports)
			.filter(([subpath]) => includeSubpath(subpath))
			.map(([subpath, target]) => {
				const resolvedTarget = resolveCommandExportTarget({
					packageName: options.packageName,
					subpath,
					target,
				});
				return [
					`${options.packageName}/${subpath.slice("./".length)}`,
					join(options.packageDir, stripLeadingDotSlash(resolvedTarget)),
				];
			}),
	);
}

export function resolveCommandExportTarget(options: {
	packageName: string;
	subpath: string;
	target: unknown;
}): string {
	if (typeof options.target === "string") return options.target;
	if (isRecord(options.target)) {
		const importTarget = options.target.import;
		if (typeof importTarget === "string") return importTarget;
		const defaultTarget = options.target.default;
		if (typeof defaultTarget === "string") return defaultTarget;
	}
	throw new Error(
		`Invalid ${options.packageName} package.json export for ${options.subpath}: expected string target or conditional object with string import/default.`,
	);
}

function readCommandPackageJson(path: string, packageName: string): CommandPackageJson {
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!isCommandPackageJson(parsed)) {
		throw new Error(`Invalid ${packageName} package.json exports.`);
	}
	return parsed;
}

interface CommandPackageJson {
	name: string;
	exports: Record<string, unknown>;
}

function isCommandPackageJson(value: unknown): value is CommandPackageJson {
	if (!isRecord(value)) return false;
	if (typeof value.name !== "string") return false;
	if (!isRecord(value.exports)) return false;
	return true;
}

function stripLeadingDotSlash(path: string): string {
	return path.startsWith("./") ? path.slice("./".length) : path;
}

// Keep this object in sync with all runtime value exports from @ns/kernel/sdk; type-only exports are erased.
// Descriptor helpers are test-authoring-only today, but stay here while they are runtime exports.
const nsSdkVirtualModule = {
	defineExtension,
	defineRepoLocalNsExtensionDescriptor,
	failed,
	noopNsCommandIo,
	repoLocalNsCommandDescriptor,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	nsExtensionManifestCommandSchema,
	nsExtensionManifestSchema,
	nsExtensionPackageManifestSchema,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} satisfies Record<string, unknown>;

/**
 * Create the ns-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds `@ns/kernel/sdk` to the
 * exact SDK object imported by this process, so command-entry commands and
 * schemas share host SDK identity instead of resolving dependency copies from
 * `.ns/extensions`.
 *
 * Package-internal workspace modules may still resolve package subpaths listed
 * as `internalWorkspaceExports`. The repo-local flow manifest is currently a
 * checked-in adapter layer over the source-checkout `@ns/flow` package, so the
 * command subpaths are aliased narrowly from that package's `exports` map
 * without adding general `node_modules` package discovery.
 */
export function createNsJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
			...buildInternalWorkspaceAliases(),
			...buildAllPackageCommandAliases(),
			[CCC_AUTOSLOT_SPECIFIER]: CCC_AUTOSLOT_MODULE_PATH,
			[CCC_LAND_SPECIFIER]: CCC_LAND_MODULE_PATH,
			[CCC_TRUNK_PULL_SPECIFIER]: CCC_TRUNK_PULL_MODULE_PATH,
			[EXEC_SPECIFIER]: EXEC_MODULE_PATH,
			[CAPABILITY_KIT_MODEL_SLUG_SPECIFIER]: CAPABILITY_KIT_MODEL_SLUG_MODULE_PATH,
			[CORE_MODEL_SLUG_SPECIFIER]: CORE_MODEL_SLUG_MODULE_PATH,
			[CORE_PRIMITIVES_SPECIFIER]: CORE_PRIMITIVES_MODULE_PATH,
			[CORE_TEXT_NORMALIZATION_SPECIFIER]: CORE_TEXT_NORMALIZATION_MODULE_PATH,
			[GIT_SPECIFIER]: GIT_MODULE_PATH,
		},
		moduleCache: false,
		virtualModules: {
			[SDK_SPECIFIER]: nsSdkVirtualModule,
		},
	});
}

/**
 * Load the default export of a TypeScript or JavaScript ns user module.
 *
 * Callers validate the returned value according to the command-entry contract.
 * Throws when the file cannot be transpiled or imported.
 */
export async function loadNsUserModuleDefault(modulePath: string): Promise<unknown> {
	const jiti = createNsJiti();
	return jiti.import(modulePath, { default: true });
}
