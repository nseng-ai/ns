#!/usr/bin/env node

// Builds the self-contained pr-address CLI bundle that ships inside the
// installed pr-address skill. The output is deterministic for a given source
// tree and esbuild version (no timestamps), so the checked-in artifact can be
// regenerated and diffed: `pnpm --dir ts/packages/pr-address run bundle`.

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import process from "node:process";

const PACKAGE_ROOT_URL = new URL("../", import.meta.url);
const REPO_ROOT_URL = new URL("../../../../", import.meta.url);

/** Minimum Node major version the bundle targets; matches the ts workspace engines floor (>=24.12.0). */
export const BUNDLE_NODE_TARGET = "node24";

export const DEFAULT_BUNDLE_OUTFILE = fileURLToPath(
	new URL("skills/pr-address/scripts/pr-address.bundle.mjs", REPO_ROOT_URL),
);

export async function buildPrAddressBundle(outfile: string): Promise<void> {
	await build({
		// Pin the working directory so emitted source-path comments (and therefore
		// the artifact bytes) do not depend on the invoking process's cwd.
		absWorkingDir: fileURLToPath(PACKAGE_ROOT_URL),
		entryPoints: [fileURLToPath(new URL("src/cli.ts", PACKAGE_ROOT_URL))],
		outfile,
		bundle: true,
		platform: "node",
		format: "esm",
		target: BUNDLE_NODE_TARGET,
		legalComments: "none",
		banner: {
			js: "// GENERATED FILE - do not edit. Rebuild with: pnpm --dir ts/packages/pr-address run bundle",
		},
		logLevel: "warning",
	});
}

if (import.meta.main) {
	const outfile = process.argv[2] ?? DEFAULT_BUNDLE_OUTFILE;
	await buildPrAddressBundle(outfile);
	process.stdout.write(`bundled: ${outfile}\n`);
}
