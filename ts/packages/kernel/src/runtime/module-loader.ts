import { createJiti } from "jiti/static";

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

/** Module specifier that ns command entries import the SDK from. */
const SDK_SPECIFIER = "@ns/kernel/sdk";

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
 * First-party bundled commands are loaded by package module specifier through
 * the selected-command loader instead of through source-checkout aliases here.
 */
export function createNsJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
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
