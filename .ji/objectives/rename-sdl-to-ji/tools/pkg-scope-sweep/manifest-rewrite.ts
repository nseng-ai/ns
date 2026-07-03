// JSON manifest step for the package-scope sweep: renames package `name`
// fields, dependency keys, exports subpath keys/values, bin entries, and
// `ji.subpackages` values across all workspace package.json files.
// Dependency-section keys are re-sorted alphabetically after renaming.
//
// Usage: node manifest-rewrite.ts [--write]   (dry run by default; idempotent)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGE_NAME_MAP, PHANTOM_DEPENDENCY_KEYS, renameSpecifier } from "./rename-map.ts";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..", "..", "..", "..", "..");

const DEPENDENCY_SECTIONS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
	"peerDependenciesMeta",
] as const;

type JsonObject = Record<string, unknown>;

function renamePackageName(name: string): string {
	return PACKAGE_NAME_MAP[name] ?? name;
}

function renamePathValue(value: string): string {
	return renameSpecifier(value) ?? value;
}

function rewriteDependencySection(section: JsonObject): JsonObject {
	const entries = Object.entries(section)
		.filter(([key]) => !PHANTOM_DEPENDENCY_KEYS.includes(key))
		.map(([key, value]) => [renamePackageName(key), value] as const);
	entries.sort(([a], [b]) => a.localeCompare(b));
	return Object.fromEntries(entries);
}

function rewriteExports(exportsField: unknown): unknown {
	if (typeof exportsField === "string") {
		return renamePathValue(exportsField);
	}
	if (exportsField === null || typeof exportsField !== "object") {
		return exportsField;
	}
	const rewritten: JsonObject = {};
	for (const [key, value] of Object.entries(exportsField as JsonObject)) {
		rewritten[renamePathValue(key)] = rewriteExports(value);
	}
	return rewritten;
}

function rewriteScripts(scripts: JsonObject): JsonObject {
	const rewritten: JsonObject = {};
	for (const [key, value] of Object.entries(scripts)) {
		rewritten[key] = typeof value === "string"
			? value
				.replaceAll("hosts/sdlcc", "hosts/jicc")
				.replaceAll("sdl-capability-kit", "capability-kit")
			: value;
	}
	return rewritten;
}

function rewriteManifest(manifest: JsonObject): JsonObject {
	const rewritten: JsonObject = {};
	for (const [key, value] of Object.entries(manifest)) {
		if (key === "name" && typeof value === "string") {
			rewritten[key] = renamePackageName(value);
		} else if (DEPENDENCY_SECTIONS.includes(key as typeof DEPENDENCY_SECTIONS[number]) && value !== null && typeof value === "object") {
			rewritten[key] = rewriteDependencySection(value as JsonObject);
		} else if (key === "exports") {
			rewritten[key] = rewriteExports(value);
		} else if (key === "bin" && value !== null && typeof value === "object") {
			rewritten[key] = Object.fromEntries(
				Object.entries(value as JsonObject).map((
					[binName, binPath],
				) => [binName === "sdlcc" ? "jicc" : binName, binPath]),
			);
		} else if (key === "scripts" && value !== null && typeof value === "object") {
			rewritten[key] = rewriteScripts(value as JsonObject);
		} else if (key === "ji" && value !== null && typeof value === "object") {
			const jiField = { ...(value as JsonObject) };
			if (Array.isArray(jiField["subpackages"])) {
				jiField["subpackages"] = jiField["subpackages"].map((entry) =>
					entry === "sdl" ? "ji" : entry
				);
			}
			rewritten[key] = jiField;
		} else if (
			(key === "main" || key === "types" || key === "module") && typeof value === "string"
		) {
			rewritten[key] = renamePathValue(value);
		} else {
			rewritten[key] = value;
		}
	}
	return rewritten;
}

function walkManifests(directory: string, files: string[]): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules") {
				walkManifests(join(directory, entry.name), files);
			}
		} else if (entry.isFile() && entry.name === "package.json") {
			files.push(relative(REPO_ROOT, join(directory, entry.name)));
		}
	}
}

function listManifests(): string[] {
	const files: string[] = [];
	walkManifests(join(REPO_ROOT, "ts"), files);
	return files.sort();
}

function main(): void {
	const write = process.argv.includes("--write");
	let changed = 0;
	for (const repoRelativePath of listManifests()) {
		const absolute = join(REPO_ROOT, repoRelativePath);
		const original = readFileSync(absolute, "utf8");
		const manifest = JSON.parse(original) as JsonObject;
		const rewritten = `${JSON.stringify(rewriteManifest(manifest), null, "\t")}\n`;
		if (rewritten === original) {
			continue;
		}
		changed += 1;
		console.log(`  ${repoRelativePath}`);
		if (write) {
			writeFileSync(absolute, rewritten);
		}
	}
	console.log(`${write ? "APPLIED" : "DRY RUN"}: ${changed} manifests changed`);
}

main();
