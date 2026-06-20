import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import { defineExtension, failed, ok, z } from "./sdk.ts";

/** Module specifier that SDL command entries import the SDK from. */
const SDK_SPECIFIER = "@asdl/sdl/sdk";

/** Absolute path to the SDK source module, used as the `alias` resolution target. */
const SDK_MODULE_PATH = join(dirname(fileURLToPath(import.meta.url)), "sdk.ts");

const sdlSdkVirtualModule = { defineExtension, failed, ok, z } satisfies Record<string, unknown>;

/**
 * Create the SDL-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds `@asdl/sdl/sdk` to the
 * exact SDK object imported by this process, so command-entry commands and
 * schemas share host SDK identity instead of resolving a second package copy.
 */
export function createSdlJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		alias: {
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
