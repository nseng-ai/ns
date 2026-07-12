import { createJiti } from "jiti/static";

import { nsSdkRuntimeExports } from "../sdk/runtime-exports.ts";

/** Module specifier that ns command entries import the SDK from. */
const SDK_SPECIFIER = "@nseng-ai/sdk";

/**
 * Create the ns-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds `@nseng-ai/sdk` to the
 * exact SDK object imported by this process, so descriptor and command modules share host SDK
 * identity instead of resolving dependency copies from their package roots.
 *
 * First-party bundled commands are loaded by package module specifier through
 * the selected-command loader instead of through source-checkout aliases here.
 */
export function createNsJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		moduleCache: true,
		virtualModules: {
			[SDK_SPECIFIER]: nsSdkRuntimeExports,
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
