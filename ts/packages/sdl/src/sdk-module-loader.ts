import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import {
	commandSucceeded,
	defineExtension,
	failed,
	formatCommandEvidence,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} from "./sdk.ts";

const SDL_SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Module specifier that SDL command entries import the SDK from. */
const SDK_SPECIFIER = "@sdl/sdl/sdk";

/** Absolute path to the SDK source module, used as the `alias` resolution target. */
const SDK_MODULE_PATH = join(SDL_SRC_DIR, "sdk.ts");

const INTERNAL_MIGRATION_MODULE_PATHS = {
	"@sdl/sdl/checkpoint": "checkpoint.ts",
	"@sdl/sdl/checkpoint-flow": "checkpoint-flow.ts",
	"@sdl/sdl/checkpoint-message": "checkpoint-message.ts",
	"@sdl/sdl/changes-model-summary": "changes-model-summary.ts",
	"@sdl/sdl/cli": "cli.ts",
	"@sdl/sdl/context": "context.ts",
	"@sdl/sdl/pending-worktree": "pending-worktree.ts",
	"@sdl/sdl/pi-text-generation": "pi-text-generation.ts",
	"@sdl/sdl/pr-description": "pr-description.ts",
	"@sdl/sdl/text-generation": "text-generation.ts",
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

// Keep this object in sync with all runtime value exports from sdk.ts; type-only exports are erased.
const sdlSdkVirtualModule = {
	commandSucceeded,
	defineExtension,
	failed,
	formatCommandEvidence,
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
 * The load-bearing option is `virtualModules`: it binds `@sdl/sdl/sdk` to the
 * exact SDK object imported by this process, so command-entry commands and
 * schemas share host SDK identity instead of resolving dependency copies from
 * `.sdl/extensions`.
 *
 * Checked-in repo-local migration extensions may also import package subpaths
 * listed as `internalMigrationExports`; aliases resolve those subpaths to this
 * source tree without making them part of the public SDK virtual module.
 */
export function createSdlJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
			...buildInternalMigrationAliases(),
			[SDK_SPECIFIER]: SDK_MODULE_PATH,
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
