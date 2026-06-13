import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import * as sdlSdk from "./sdk.ts";

/**
 * Runtime loader for user-authored SDL command modules (e.g. `.asdl/commands/cp.ts`).
 *
 * ## Why jiti
 *
 * Project command overrides are plain TypeScript files that live in the user's
 * repository and `import { defineCommand } from "@asdl/sdl/sdk"`. They are not part
 * of our build: we discover them at runtime and must turn a `.ts` file on disk into
 * a live module, on demand, with no compile step the user has to run themselves.
 *
 * A bare dynamic `import()` cannot do this here:
 *   - It would not transpile the user's TypeScript (decorators, type-only imports,
 *     `.ts` extensions in specifiers) without a registered loader.
 *   - It would resolve `@asdl/sdl/sdk` through the user's `node_modules`, which may
 *     not exist, may be a different version, or — even when it resolves — yields a
 *     *separate* module instance from the SDK the host is already running.
 *
 * jiti solves both: it transpiles TypeScript on the fly and lets us control module
 * resolution via `alias` / `virtualModules`.
 *
 * ## The value: SDK identity, not just SDK availability
 *
 * The load-bearing option is `virtualModules`. It binds the `@asdl/sdl/sdk`
 * specifier to the *exact* `sdlSdk` object this process already imported, so the
 * `defineCommand` / `ok` / `failed` the override calls are identity-equal to ours.
 * The override and the host share one SDK instance rather than two copies that merely
 * look alike — which is what keeps the command contract (type guards, shared helpers,
 * future shared state) sound. `alias` is a path-resolution fallback for environments
 * where the specifier must resolve to a file rather than an injected object.
 *
 * `moduleCache: false` makes each load fresh, so edits to the override file take
 * effect without a stale-cache restart.
 *
 * ## Prior art
 *
 * This mirrors Pi's extension loader, which loads user TypeScript extension modules
 * the same way — `createJiti` with `moduleCache: false`, injecting the framework's
 * own bundled modules via `virtualModules` so extensions share the host's instances:
 * `pi-mono/packages/coding-agent/src/core/extensions/loader.ts` (`loadExtensionModule`).
 * Pi branches between `virtualModules` (compiled Bun binary, no filesystem to resolve
 * against) and `alias` (Node/dev). SDL ships only as TypeScript source, so it has no
 * binary mode; we keep `virtualModules` as the primary path for identity and `alias`
 * as the resolution fallback.
 */

/** Module specifier that project command modules import the SDL SDK from. */
const SDK_SPECIFIER = "@asdl/sdl/sdk";

/** Absolute path to the SDK source module, used as the `alias` resolution target. */
const SDK_MODULE_PATH = join(dirname(fileURLToPath(import.meta.url)), "sdk.ts");

/**
 * Load the default export of a TypeScript command module at `modulePath`, with the
 * SDL SDK injected so the module shares this process's SDK instance.
 *
 * Returns the module's default export as `unknown`; callers are responsible for
 * validating its shape (see `validateCpCommand` in `cp-command.ts`). Throws if the
 * file cannot be transpiled or imported; callers should wrap this in try/catch.
 */
export async function loadSdkCommandModule(modulePath: string): Promise<unknown> {
	const jiti = createJiti(import.meta.url, {
		alias: {
			[SDK_SPECIFIER]: SDK_MODULE_PATH,
		},
		moduleCache: false,
		virtualModules: {
			[SDK_SPECIFIER]: sdlSdk,
		},
	});
	return jiti.import(modulePath, { default: true });
}
