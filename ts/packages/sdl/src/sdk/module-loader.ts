import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import { isRecord } from "@sdl/core/primitives";

import {
	commandSucceeded,
	defineExtension,
	failed,
	formatCommand,
	formatCommandDetails,
	formatCommandError,
	formatCommandEvidence,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	withTemporaryFile,
	z,
} from "./index.ts";

const SDL_SDK_DIR = dirname(fileURLToPath(import.meta.url));
const SDL_SRC_DIR = dirname(SDL_SDK_DIR);

/** Module specifier that SDL command entries import the SDK from. */
const SDK_SPECIFIER = "@sdl/sdl/sdk";
const CCC_AUTOSLOT_SPECIFIER = "@sdl/ccc/autoslot";
const CCC_LAND_SPECIFIER = "@sdl/ccc/land";
const CCC_TRUNK_PULL_SPECIFIER = "@sdl/ccc/trunk-pull";
const CORE_EXEC_SPECIFIER = "@sdl/core/exec";
const CORE_MODEL_SLUG_SPECIFIER = "@sdl/core/model-slug";
const CORE_PRIMITIVES_SPECIFIER = "@sdl/core/primitives";
const CORE_GIT_SPECIFIER = "@sdl/core/git";
const CORE_SUBMIT_SPECIFIER = "@sdl/core/submit";
const CORE_TEXT_NORMALIZATION_SPECIFIER = "@sdl/core/text-normalization";
const GRAPHITE_SUBMIT_SPECIFIER = "@sdl/graphite/submit";
const AUTOBRANCH_DIRTY_WORKTREE_SPECIFIER = "@sdl/autobranch/dirty-worktree";
const AUTOBRANCH_LATEST_COMMIT_SPECIFIER = "@sdl/autobranch/latest-commit";
const FLOW_PACKAGE_NAME = "sdl-flow";

/** Absolute path to the SDK source module, used as the `alias` resolution target. */
const SDK_MODULE_PATH = join(SDL_SDK_DIR, "index.ts");
const CCC_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "ccc", "src");
const CORE_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "sdl-core", "src");
const GRAPHITE_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "graphite", "src");
const AUTOBRANCH_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "autobranch", "src");
const FLOW_PACKAGE_DIR = join(SDL_SRC_DIR, "..", "..", "extensions", "flow");
const FLOW_PACKAGE_JSON_PATH = join(FLOW_PACKAGE_DIR, "package.json");
const CCC_AUTOSLOT_MODULE_PATH = join(CCC_SRC_DIR, "autoslot.ts");
const CCC_LAND_MODULE_PATH = join(CCC_SRC_DIR, "land.ts");
const CCC_TRUNK_PULL_MODULE_PATH = join(CCC_SRC_DIR, "trunk-pull.ts");
const CORE_EXEC_MODULE_PATH = join(CORE_SRC_DIR, "exec.ts");
const CORE_MODEL_SLUG_MODULE_PATH = join(CORE_SRC_DIR, "model-slug.ts");
const CORE_PRIMITIVES_MODULE_PATH = join(CORE_SRC_DIR, "primitives.ts");
const CORE_GIT_MODULE_PATH = join(CORE_SRC_DIR, "git", "index.ts");
const CORE_SUBMIT_MODULE_PATH = join(CORE_SRC_DIR, "submit", "index.ts");
const CORE_TEXT_NORMALIZATION_MODULE_PATH = join(CORE_SRC_DIR, "text-normalization.ts");
const GRAPHITE_SUBMIT_MODULE_PATH = join(GRAPHITE_SRC_DIR, "submit", "index.ts");
const AUTOBRANCH_DIRTY_WORKTREE_MODULE_PATH = join(AUTOBRANCH_SRC_DIR, "dirty-worktree.ts");
const AUTOBRANCH_LATEST_COMMIT_MODULE_PATH = join(AUTOBRANCH_SRC_DIR, "latest-commit.ts");

const INTERNAL_MIGRATION_MODULE_PATHS = {
	"@sdl/sdl/checkpoint-flow": "checkpoint-flow.ts",
	"@sdl/sdl/checkpoint-message": "checkpoint-message.ts",
	"@sdl/sdl/cli": "cli.ts",
	"@sdl/sdl/context": "context.ts",
	"@sdl/sdl/pending-worktree": "pending-worktree.ts",
	"@sdl/sdl/pi-text-generation": "sdk/pi-text-generation.ts",
	"@sdl/sdl/temp-files": "temp-files.ts",
	"@sdl/sdl/text-generation": "sdk/text-generation.ts",
	"@sdl/sdl/text-repair": "text-repair.ts",
} as const;

function buildInternalMigrationAliases(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(INTERNAL_MIGRATION_MODULE_PATHS).map(([specifier, relativePath]) => [
			specifier,
			join(SDL_SRC_DIR, relativePath),
		]),
	);
}

function buildFlowCommandAliases(): Record<string, string> {
	const packageJson = readFlowPackageJson();
	if (packageJson.name !== FLOW_PACKAGE_NAME) {
		throw new Error(
			`Expected flow extension package name ${FLOW_PACKAGE_NAME}, found ${packageJson.name}.`,
		);
	}

	return Object.fromEntries(
		Object.entries(packageJson.exports)
			.filter(([subpath]) => subpath.startsWith("./commands/"))
			.map(([subpath, target]) => [
				`${FLOW_PACKAGE_NAME}/${subpath.slice("./".length)}`,
				join(FLOW_PACKAGE_DIR, stripLeadingDotSlash(target)),
			]),
	);
}

function readFlowPackageJson(): FlowPackageJson {
	const parsed: unknown = JSON.parse(readFileSync(FLOW_PACKAGE_JSON_PATH, "utf8"));
	if (!isFlowPackageJson(parsed)) {
		throw new Error(`Invalid ${FLOW_PACKAGE_NAME} package.json exports.`);
	}
	return parsed;
}

interface FlowPackageJson {
	name: string;
	exports: Record<string, string>;
}

function isFlowPackageJson(value: unknown): value is FlowPackageJson {
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

// Keep this object in sync with all runtime value exports from sdk/index.ts; type-only exports are erased.
const sdlSdkVirtualModule = {
	commandSucceeded,
	defineExtension,
	failed,
	formatCommand,
	formatCommandDetails,
	formatCommandError,
	formatCommandEvidence,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	withTemporaryFile,
	z,
} satisfies Record<string, unknown>;

/**
 * Create the SDL-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds `@sdl/sdl/sdk` to the
 * exact SDK object imported by this process, so command-entry commands and
 * schemas share host SDK identity instead of resolving dependency copies from
 * `.sdl/extensions`.
 *
 * Package-internal migration modules may still resolve package subpaths listed
 * as `internalMigrationExports`. The repo-local flow manifest is currently a
 * checked-in adapter layer over the source-checkout `sdl-flow` package, so the
 * command subpaths are aliased narrowly from that package's `exports` map
 * without adding general `node_modules` package discovery.
 */
export function createSdlJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
			...buildInternalMigrationAliases(),
			...buildFlowCommandAliases(),
			[SDK_SPECIFIER]: SDK_MODULE_PATH,
			[CCC_AUTOSLOT_SPECIFIER]: CCC_AUTOSLOT_MODULE_PATH,
			[CCC_LAND_SPECIFIER]: CCC_LAND_MODULE_PATH,
			[CCC_TRUNK_PULL_SPECIFIER]: CCC_TRUNK_PULL_MODULE_PATH,
			[CORE_EXEC_SPECIFIER]: CORE_EXEC_MODULE_PATH,
			[CORE_MODEL_SLUG_SPECIFIER]: CORE_MODEL_SLUG_MODULE_PATH,
			[CORE_PRIMITIVES_SPECIFIER]: CORE_PRIMITIVES_MODULE_PATH,
			[CORE_GIT_SPECIFIER]: CORE_GIT_MODULE_PATH,
			[CORE_SUBMIT_SPECIFIER]: CORE_SUBMIT_MODULE_PATH,
			[CORE_TEXT_NORMALIZATION_SPECIFIER]: CORE_TEXT_NORMALIZATION_MODULE_PATH,
			[GRAPHITE_SUBMIT_SPECIFIER]: GRAPHITE_SUBMIT_MODULE_PATH,
			[AUTOBRANCH_DIRTY_WORKTREE_SPECIFIER]: AUTOBRANCH_DIRTY_WORKTREE_MODULE_PATH,
			[AUTOBRANCH_LATEST_COMMIT_SPECIFIER]: AUTOBRANCH_LATEST_COMMIT_MODULE_PATH,
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
