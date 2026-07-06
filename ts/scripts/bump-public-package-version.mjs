#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { assertPlausibleNpmVersion, intendedPublicPackages, loadPublicPackageContext, repoRoot, run, workspaceRoot } from "./public-package-set.mjs";

const version = parseVersion(process.argv.slice(2));
assertPlausibleNpmVersion(version);

const context = await loadPublicPackageContext();
const changed = [];
for (const packageName of intendedPublicPackages) {
	const entry = context.manifestByName.get(packageName);
	if (entry === undefined) throw new Error(`Intended public package is missing: ${packageName}`);
	const source = await readFile(entry.path, "utf8");
	const manifest = JSON.parse(source);
	if (manifest.version === version) continue;
	manifest.version = version;
	await writeFile(entry.path, `${JSON.stringify(manifest, null, "\t")}\n`);
	changed.push(packageName);
}

run("corepack", ["pnpm@11.8.0", "--config.verify-deps-before-run=false", "--dir", workspaceRoot, "install", "--lockfile-only"], {
	cwd: repoRoot,
});

console.log(`Coordinated public package version: ${version}`);
console.log(`Updated source manifests: ${changed.length === 0 ? "none" : changed.join(", ")}`);
console.log("Refreshed ts/pnpm-lock.yaml with pnpm install --lockfile-only.");

function parseVersion(rawArgs) {
	const args = rawArgs.filter((arg) => arg !== "--");
	if (args.length !== 1) throw new Error("Usage: pnpm --dir ts run release:bump-version -- <version>");
	return args[0];
}
