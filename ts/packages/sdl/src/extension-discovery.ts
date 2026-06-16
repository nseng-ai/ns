import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

export type DiscoveredExtensionKind = "file" | "dir-index" | "package";

export interface DiscoveredExtension {
	kind: DiscoveredExtensionKind;
	entryPath: string;
	rootDir: string;
	displayPath: string;
}

export interface ExtensionDiscoveryDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string | undefined;
}

export interface ExtensionDiscoveryResult {
	extensions: readonly DiscoveredExtension[];
	diagnostics: readonly ExtensionDiscoveryDiagnostic[];
}

export function discoverExtensionsInRoot(rootDir: string): ExtensionDiscoveryResult {
	if (!existsSync(rootDir)) return { extensions: [], diagnostics: [] };

	let rootStat;
	try {
		rootStat = statSync(rootDir);
	} catch (error) {
		return { extensions: [], diagnostics: [diagnostic("extension_root_stat_failed", `Could not inspect extension root ${rootDir}.\n${formatUnknownError(error)}`, rootDir)] };
	}
	if (!rootStat.isDirectory()) {
		return { extensions: [], diagnostics: [diagnostic("extension_root_not_directory", `Extension root must be a directory: ${rootDir}.`, rootDir)] };
	}

	let entries;
	try {
		entries = readdirSync(rootDir, { withFileTypes: true });
	} catch (error) {
		return { extensions: [], diagnostics: [diagnostic("extension_root_read_failed", `Could not read extension root ${rootDir}.\n${formatUnknownError(error)}`, rootDir)] };
	}

	const extensions: DiscoveredExtension[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const entryPath = join(rootDir, entry.name);
		if (entry.isFile()) {
			if (isLoadableExtensionFile(entry.name)) {
				extensions.push({ kind: "file", entryPath, rootDir, displayPath: relativeDisplayPath(rootDir, entryPath) });
			}
			continue;
		}
		if (!entry.isDirectory()) continue;

		const packageJsonPath = join(entryPath, "package.json");
		if (existsSync(packageJsonPath)) {
			const packageResult = discoverPackageExtensions(rootDir, entryPath, packageJsonPath);
			extensions.push(...packageResult.extensions);
			diagnostics.push(...packageResult.diagnostics);
			continue;
		}

		const indexTs = join(entryPath, "index.ts");
		const indexJs = join(entryPath, "index.js");
		if (existsSync(indexTs)) {
			extensions.push({ kind: "dir-index", entryPath: indexTs, rootDir, displayPath: relativeDisplayPath(rootDir, indexTs) });
			continue;
		}
		if (existsSync(indexJs)) {
			extensions.push({ kind: "dir-index", entryPath: indexJs, rootDir, displayPath: relativeDisplayPath(rootDir, indexJs) });
			continue;
		}
		diagnostics.push(diagnostic("extension_directory_missing_entry", `Extension directory must contain package.json, index.ts, or index.js: ${entryPath}.`, entryPath));
	}

	return {
		extensions: extensions.sort((left, right) => left.displayPath.localeCompare(right.displayPath)),
		diagnostics,
	};
}

function discoverPackageExtensions(rootDir: string, packageDir: string, packageJsonPath: string): ExtensionDiscoveryResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return { extensions: [], diagnostics: [diagnostic("extension_manifest_parse_failed", `Could not parse extension manifest ${packageJsonPath}.\n${formatUnknownError(error)}`, packageJsonPath)] };
	}

	if (!isRecord(parsed) || !isRecord(parsed.asdl)) {
		return { extensions: [], diagnostics: [diagnostic("extension_manifest_missing_asdl", `Extension manifest must contain an asdl object: ${packageJsonPath}.`, packageJsonPath)] };
	}
	const entries = parsed.asdl.extensions;
	if (!Array.isArray(entries)) {
		return { extensions: [], diagnostics: [diagnostic("extension_manifest_extensions_not_array", `Extension manifest asdl.extensions must be an array: ${packageJsonPath}.`, packageJsonPath)] };
	}

	const extensions: DiscoveredExtension[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of entries) {
		if (typeof entry !== "string" || entry.trim() === "") {
			diagnostics.push(diagnostic("extension_manifest_entry_invalid", `Extension manifest entries must be non-empty relative paths: ${packageJsonPath}.`, packageJsonPath));
			continue;
		}
		if (entry.startsWith("/") || entry.includes("\\")) {
			diagnostics.push(diagnostic("extension_manifest_entry_not_relative", `Extension manifest entry must be a relative POSIX-style path inside the package: ${entry}.`, packageJsonPath));
			continue;
		}
		const resolvedEntry = resolve(packageDir, entry);
		if (!isInsideDirectory(packageDir, resolvedEntry)) {
			diagnostics.push(diagnostic("extension_manifest_entry_escapes", `Extension manifest entry must not escape its package directory: ${entry}.`, packageJsonPath));
			continue;
		}
		if (!isLoadableExtensionFile(basename(resolvedEntry))) {
			diagnostics.push(diagnostic("extension_manifest_entry_unsupported", `Extension manifest entry must be a .ts or .js file, excluding .d.ts: ${entry}.`, packageJsonPath));
			continue;
		}
		let entryStat;
		try {
			entryStat = statSync(resolvedEntry);
		} catch {
			diagnostics.push(diagnostic("extension_manifest_entry_missing", `Extension manifest entry does not exist: ${entry}.`, packageJsonPath));
			continue;
		}
		if (!entryStat.isFile()) {
			diagnostics.push(diagnostic("extension_manifest_entry_not_file", `Extension manifest entry must be a file: ${entry}.`, packageJsonPath));
			continue;
		}
		extensions.push({ kind: "package", entryPath: resolvedEntry, rootDir, displayPath: relativeDisplayPath(rootDir, resolvedEntry) });
	}
	return { extensions, diagnostics };
}

function isLoadableExtensionFile(name: string): boolean {
	if (name.endsWith(".d.ts")) return false;
	const extension = extname(name);
	return extension === ".ts" || extension === ".js";
}

function isInsideDirectory(parent: string, child: string): boolean {
	const relativePath = relative(parent, child);
	return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.startsWith("\\"));
}

function relativeDisplayPath(rootDir: string, entryPath: string): string {
	return join(basename(rootDir), relative(rootDir, entryPath));
}

function diagnostic(code: string, message: string, path?: string): ExtensionDiscoveryDiagnostic {
	return { severity: "error", code, message, ...(path === undefined ? {} : { path }) };
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
