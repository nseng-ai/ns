// JSON manifest step for the package-scope sweep (ji -> ns): renames package
// `name` fields, dependency keys, exports subpath keys/values, bin entries,
// the `"ji"` manifest key itself (-> `"ns"`, NEW in this sweep — the sdl->ji
// sweep only rewrote values inside an already-"ji"-named key), and values
// inside that field (`"ji"` subpackage entries -> `"ns"`, command `entry`
// paths) across all workspace and extension package.json files.
// Dependency-section keys are re-sorted alphabetically after renaming.
//
// Usage: node manifest-rewrite.ts [--write]   (dry run by default; idempotent)

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGE_NAME_MAP, renameSpecifier } from "./rename-map.ts";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..", "..", "..", "..", "..");

// The consumer-instance directory is `.ji` before phase 1 (PR-4) lands and
// `.ns` after `git mv .ji .ns`. Prefer `.ns` when it exists so the same tool
// runs unchanged on landing day.
const CONSUMER_DIR = existsSync(join(REPO_ROOT, ".ns")) ? ".ns" : ".ji";

const DEPENDENCY_SECTIONS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
	"peerDependenciesMeta",
] as const;

// bin-name renames. `jicc` -> `nscc` is this sweep's own row. `ji` -> `ns`
// (the @ns/kernel CLI bin) is owned by phase 1 (PR-4); the entry here is an
// idempotent backstop in case this tool runs against a tree where phase 1
// missed it.
const BIN_NAME_MAP: Readonly<Record<string, string>> = {
	jicc: "nscc",
	ji: "ns",
};

type JsonObject = Record<string, unknown>;

function renamePackageName(name: string): string {
	return PACKAGE_NAME_MAP[name] ?? name;
}

function renamePathValue(value: string): string {
	return renameSpecifier(value) ?? value;
}

function rewriteDependencySection(section: JsonObject): JsonObject {
	const entries = Object.entries(section)
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
			? value.replaceAll("hosts/jicc", "hosts/nscc")
			: value;
	}
	return rewritten;
}

// Deep-rewrite the `ns` (formerly `ji`) manifest field: `"ji"` subpackage
// entries become `"ns"`, and any nested `./`-relative path value (e.g.
// command `entry`) goes through the specifier rename. Command `path` segments
// (CLI words) are left alone by construction: bare words other than the exact
// string "ji" are not specifier-shaped, and no command word is "ji".
function rewriteNsField(value: unknown): unknown {
	if (typeof value === "string") {
		if (value === "ji") {
			return "ns";
		}
		return renamePathValue(value);
	}
	if (Array.isArray(value)) {
		return value.map(rewriteNsField);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as JsonObject).map(([key, entry]) => [key, rewriteNsField(entry)]),
		);
	}
	return value;
}

function rewriteManifest(manifest: JsonObject): JsonObject {
	const rewritten: JsonObject = {};
	for (const [key, value] of Object.entries(manifest)) {
		if (key === "name" && typeof value === "string") {
			rewritten[key] = renamePackageName(value);
		} else if (
			DEPENDENCY_SECTIONS.includes(key as typeof DEPENDENCY_SECTIONS[number])
			&& value !== null && typeof value === "object"
		) {
			rewritten[key] = rewriteDependencySection(value as JsonObject);
		} else if (key === "exports") {
			rewritten[key] = rewriteExports(value);
		} else if (key === "bin" && value !== null && typeof value === "object") {
			rewritten[key] = Object.fromEntries(
				Object.entries(value as JsonObject).map((
					[binName, binPath],
				) => [
					BIN_NAME_MAP[binName] ?? binName,
					typeof binPath === "string" ? renamePathValue(binPath) : binPath,
				]),
			);
		} else if (key === "scripts" && value !== null && typeof value === "object") {
			rewritten[key] = rewriteScripts(value as JsonObject);
		} else if ((key === "ji" || key === "ns") && value !== null && typeof value === "object") {
			// Manifest-key rename: `"ji"` -> `"ns"`, preserving key position.
			// Accepting an existing `"ns"` key keeps the tool idempotent.
			rewritten["ns"] = rewriteNsField(value);
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
	const roots = [
		join(REPO_ROOT, "ts"),
		// <consumer>/reviews/*/tools/* packages are workspace members via
		// ts/pnpm-workspace.yaml globs.
		join(REPO_ROOT, CONSUMER_DIR, "reviews"),
		// <consumer>/extensions/* manifests are not workspace members but
		// carry the `"ji"` manifest key that this sweep renames to `"ns"`.
		join(REPO_ROOT, CONSUMER_DIR, "extensions"),
	];
	for (const root of roots) {
		if (existsSync(root)) {
			walkManifests(root, files);
		}
	}
	return files.sort();
}

// Preserve each manifest's existing indentation: workspace manifests use
// tabs, the extension manifests under <consumer>/extensions use two spaces.
function detectIndent(original: string): string {
	const match = original.match(/\n([ \t]+)"/);
	return match?.[1] ?? "\t";
}

function main(): void {
	const write = process.argv.includes("--write");
	let changed = 0;
	for (const repoRelativePath of listManifests()) {
		const absolute = join(REPO_ROOT, repoRelativePath);
		const original = readFileSync(absolute, "utf8");
		const manifest = JSON.parse(original) as JsonObject;
		const rewritten = `${JSON.stringify(rewriteManifest(manifest), null, detectIndent(original))}\n`;
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
