import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

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
const CORE_PRIMITIVES_SPECIFIER = "@sdl/core/primitives";

/** Absolute path to the SDK source module, used as the `alias` resolution target. */
const SDK_MODULE_PATH = join(SDL_SDK_DIR, "index.ts");
const CCC_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "ccc", "src");
const CORE_SRC_DIR = join(SDL_SRC_DIR, "..", "..", "sdl-core", "src");
const CCC_AUTOSLOT_MODULE_PATH = join(CCC_SRC_DIR, "autoslot.ts");
const CCC_LAND_MODULE_PATH = join(CCC_SRC_DIR, "land.ts");
const CCC_TRUNK_PULL_MODULE_PATH = join(CCC_SRC_DIR, "trunk-pull.ts");
const CORE_EXEC_MODULE_PATH = join(CORE_SRC_DIR, "exec.ts");
const CORE_PRIMITIVES_MODULE_PATH = join(CORE_SRC_DIR, "primitives.ts");

const INTERNAL_MIGRATION_MODULE_PATHS = {
	"@sdl/sdl/checkpoint": "checkpoint.ts",
	"@sdl/sdl/checkpoint-flow": "checkpoint-flow.ts",
	"@sdl/sdl/checkpoint-message": "checkpoint-message.ts",
	"@sdl/sdl/changes-model-summary": "changes-model-summary.ts",
	"@sdl/sdl/cli": "cli.ts",
	"@sdl/sdl/context": "context.ts",
	"@sdl/sdl/pending-worktree": "pending-worktree.ts",
	"@sdl/sdl/pi-text-generation": "sdk/pi-text-generation.ts",
	"@sdl/sdl/pr-description": "pr-description.ts",
	"@sdl/sdl/submit": "submit.ts",
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
 * as `internalMigrationExports`; checked-in `.sdl/extensions` should keep
 * repeated command-author helpers under `.sdl/extensions/shared/` until a
 * later explicit SDK-promotion decision.
 */
export function createSdlJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
			...buildInternalMigrationAliases(),
			[SDK_SPECIFIER]: SDK_MODULE_PATH,
			[CCC_AUTOSLOT_SPECIFIER]: CCC_AUTOSLOT_MODULE_PATH,
			[CCC_LAND_SPECIFIER]: CCC_LAND_MODULE_PATH,
			[CCC_TRUNK_PULL_SPECIFIER]: CCC_TRUNK_PULL_MODULE_PATH,
			[CORE_EXEC_SPECIFIER]: CORE_EXEC_MODULE_PATH,
			[CORE_PRIMITIVES_SPECIFIER]: CORE_PRIMITIVES_MODULE_PATH,
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
