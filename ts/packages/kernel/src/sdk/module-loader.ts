import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import { isRecord } from "@sdl/core/primitives";

import {
	defineExtension,
	failed,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} from "sdl-sdk";

const SDL_SDK_DIR = dirname(fileURLToPath(import.meta.url));
const SDL_SRC_DIR = dirname(SDL_SDK_DIR);

/** Module specifier that SDL command entries import the SDK from. */
const SDK_SPECIFIER = "sdl-sdk";
const CCC_AUTOSLOT_SPECIFIER = "@sdl/ccc/autoslot";
const CCC_LAND_SPECIFIER = "@sdl/ccc/land";
const CCC_TRUNK_PULL_SPECIFIER = "@sdl/ccc/trunk-pull";
const EXEC_SPECIFIER = "@sdl/exec";
const CORE_MODEL_SLUG_SPECIFIER = "@sdl/core/model-slug";
const CORE_PRIMITIVES_SPECIFIER = "@sdl/core/primitives";
const CORE_TEXT_NORMALIZATION_SPECIFIER = "@sdl/core/text-normalization";
const GIT_SPECIFIER = "@sdl/git";
const FLOW_PACKAGE_NAME = "sdl-flow";
const ROASTER_PACKAGE_NAME = "@sdl/roaster";

const CCC_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "ccc", "src");
const CORE_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "infra", "core", "src");
const CAPABILITY_KIT_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "sdl-capability-kit", "src");
const FLOW_PACKAGE_DIR = join(SDL_SRC_DIR, "..", "..", "capabilities", "flow");
const FLOW_PACKAGE_JSON_PATH = join(FLOW_PACKAGE_DIR, "package.json");
const ROASTER_PACKAGE_DIR = join(SDL_SRC_DIR, "..", "..", "roaster");
const ROASTER_PACKAGE_JSON_PATH = join(ROASTER_PACKAGE_DIR, "package.json");
const CCC_AUTOSLOT_MODULE_PATH = join(CCC_SRC_DIR, "autoslot.ts");
const CCC_LAND_MODULE_PATH = join(CCC_SRC_DIR, "land.ts");
const CCC_TRUNK_PULL_MODULE_PATH = join(CCC_SRC_DIR, "trunk-pull.ts");
const EXEC_MODULE_PATH = join(SDL_SRC_DIR, "..", "..", "infra", "exec", "src", "index.ts");
const CORE_MODEL_SLUG_MODULE_PATH = join(CORE_SRC_DIR, "model-slug.ts");
const CORE_PRIMITIVES_MODULE_PATH = join(CORE_SRC_DIR, "primitives.ts");
const CORE_TEXT_NORMALIZATION_MODULE_PATH = join(CORE_SRC_DIR, "text-normalization.ts");
const GIT_MODULE_PATH = join(SDL_SRC_DIR, "..", "..", "infra", "git", "src", "index.ts");

const SDL_INTERNAL_WORKSPACE_MODULE_PATHS = {
	"@sdl/kernel/cli": "cli.ts",
	"@sdl/kernel/context": "context.ts",
	"@sdl/kernel/pi-text-generation": "sdk/pi-text-generation.ts",
} as const;

const CAPABILITY_KIT_MODULE_PATHS = {
	"@sdl/capability-kit/checkpoint-flow": "checkpoint-flow.ts",
	"@sdl/capability-kit/checkpoint-message": "checkpoint-message.ts",
	"@sdl/capability-kit/pending-worktree": "pending-worktree.ts",
	"@sdl/capability-kit/temp-files": "temp-files.ts",
	"@sdl/capability-kit/text-generation": "text-generation.ts",
	"@sdl/capability-kit/text-repair": "text-repair.ts",
} as const;

function buildInternalWorkspaceAliases(): Record<string, string> {
	return {
		...buildModuleAliasMap(SDL_SRC_DIR, SDL_INTERNAL_WORKSPACE_MODULE_PATHS),
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

function buildFlowCommandAliases(): Record<string, string> {
	return buildPackageCommandAliases({
		packageName: FLOW_PACKAGE_NAME,
		packageDir: FLOW_PACKAGE_DIR,
		packageJsonPath: FLOW_PACKAGE_JSON_PATH,
	});
}

function buildRoasterCommandAliases(): Record<string, string> {
	return buildPackageCommandAliases({
		packageName: ROASTER_PACKAGE_NAME,
		packageDir: ROASTER_PACKAGE_DIR,
		packageJsonPath: ROASTER_PACKAGE_JSON_PATH,
	});
}

function buildPackageCommandAliases(options: {
	packageName: string;
	packageDir: string;
	packageJsonPath: string;
}): Record<string, string> {
	const packageJson = readCommandPackageJson(options.packageJsonPath, options.packageName);
	if (packageJson.name !== options.packageName) {
		throw new Error(
			`Expected extension package name ${options.packageName}, found ${packageJson.name}.`,
		);
	}

	return Object.fromEntries(
		Object.entries(packageJson.exports)
			.filter(([subpath]) => subpath.startsWith("./commands/"))
			.map(([subpath, target]) => [
				`${options.packageName}/${subpath.slice("./".length)}`,
				join(options.packageDir, stripLeadingDotSlash(target)),
			]),
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
	exports: Record<string, string>;
}

function isCommandPackageJson(value: unknown): value is CommandPackageJson {
	if (!isRecord(value)) return false;
	if (typeof value.name !== "string") return false;
	if (!isRecord(value.exports)) return false;
	return Object.entries(value.exports).every(
		([subpath, target]) => typeof subpath === "string" && typeof target === "string",
	);
}

function stripLeadingDotSlash(path: string): string {
	return path.startsWith("./") ? path.slice("./".length) : path;
}

// Keep this object in sync with all runtime value exports from sdl-sdk; type-only exports are erased.
const sdlSdkVirtualModule = {
	defineExtension,
	failed,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} satisfies Record<string, unknown>;

/**
 * Create the SDL-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds `sdl-sdk` to the
 * exact SDK object imported by this process, so command-entry commands and
 * schemas share host SDK identity instead of resolving dependency copies from
 * `.sdl/extensions`.
 *
 * Package-internal workspace modules may still resolve package subpaths listed
 * as `internalWorkspaceExports`. The repo-local flow manifest is currently a
 * checked-in adapter layer over the source-checkout `sdl-flow` package, so the
 * command subpaths are aliased narrowly from that package's `exports` map
 * without adding general `node_modules` package discovery.
 */
export function createSdlJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
			...buildInternalWorkspaceAliases(),
			...buildFlowCommandAliases(),
			...buildRoasterCommandAliases(),
			[CCC_AUTOSLOT_SPECIFIER]: CCC_AUTOSLOT_MODULE_PATH,
			[CCC_LAND_SPECIFIER]: CCC_LAND_MODULE_PATH,
			[CCC_TRUNK_PULL_SPECIFIER]: CCC_TRUNK_PULL_MODULE_PATH,
			[EXEC_SPECIFIER]: EXEC_MODULE_PATH,
			[CORE_MODEL_SLUG_SPECIFIER]: CORE_MODEL_SLUG_MODULE_PATH,
			[CORE_PRIMITIVES_SPECIFIER]: CORE_PRIMITIVES_MODULE_PATH,
			[CORE_TEXT_NORMALIZATION_SPECIFIER]: CORE_TEXT_NORMALIZATION_MODULE_PATH,
			[GIT_SPECIFIER]: GIT_MODULE_PATH,
		},
		moduleCache: false,
		virtualModules: {
			[SDK_SPECIFIER]: sdlSdkVirtualModule,
		},
	});
}

/**
 * Load the default export of a TypeScript or JavaScript SDL user module.
 *
 * Callers validate the returned value according to the command-entry contract.
 * Throws when the file cannot be transpiled or imported.
 */
export async function loadSdlUserModuleDefault(modulePath: string): Promise<unknown> {
	const jiti = createSdlJiti();
	return jiti.import(modulePath, { default: true });
}
