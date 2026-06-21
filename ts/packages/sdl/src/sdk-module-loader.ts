import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import {
	commandEvidenceFailure,
	commandStep,
	commandSteps,
	runSdlCommandSequence,
	stdoutCommandStep,
	trimStdout,
} from "./command-sequence.ts";
import {
	commandSucceeded,
	createSdlCommandResult,
	defineExtension,
	failed,
	formatCommandEvidence,
	ok,
	z,
} from "./sdk.ts";

/** Module specifier that SDL command entries import the SDK from. */
const SDK_SPECIFIER = "@sdl/sdl/sdk";
const COMMAND_SEQUENCE_SPECIFIER = "@sdl/sdl/command-sequence";

/** Absolute paths to SDL source modules, used as `alias` resolution targets. */
const SDL_SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const SDK_MODULE_PATH = join(SDL_SOURCE_DIR, "sdk.ts");
const COMMAND_SEQUENCE_MODULE_PATH = join(SDL_SOURCE_DIR, "command-sequence.ts");

// Keep this object in sync with all runtime value exports from sdk.ts; type-only exports are erased.
const sdlSdkVirtualModule = {
	commandSucceeded,
	createSdlCommandResult,
	defineExtension,
	failed,
	formatCommandEvidence,
	ok,
	z,
} satisfies Record<string, unknown>;

const sdlCommandSequenceVirtualModule = {
	commandEvidenceFailure,
	commandStep,
	commandSteps,
	runSdlCommandSequence,
	stdoutCommandStep,
	trimStdout,
} satisfies Record<string, unknown>;

/**
 * Create the SDL-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds SDL extension imports to the
 * exact objects imported by this process, so command-entry commands and schemas share
 * host SDK identity and project-local helper imports work from temporary extension roots.
 */
export function createSdlJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
			[SDK_SPECIFIER]: SDK_MODULE_PATH,
			[COMMAND_SEQUENCE_SPECIFIER]: COMMAND_SEQUENCE_MODULE_PATH,
		},
		moduleCache: false,
		virtualModules: {
			[SDK_SPECIFIER]: sdlSdkVirtualModule,
			[COMMAND_SEQUENCE_SPECIFIER]: sdlCommandSequenceVirtualModule,
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
