import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";

import { makeKernelDiagnostic } from "./diagnostics.ts";

export interface ExtensionRootScanDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string;
}

export type ExtensionRootEntry =
	| { type: "file"; name: string; path: string }
	| {
			type: "directory";
			name: string;
			path: string;
			packageJsonPath?: string;
			indexPath?: string;
	  };

export interface ExtensionRootScanResult {
	entries: readonly ExtensionRootEntry[];
	diagnostics: readonly ExtensionRootScanDiagnostic[];
}

export function scanExtensionRoot(rootDir: string): ExtensionRootScanResult {
	if (!existsSync(rootDir)) return { entries: [], diagnostics: [] };

	let isDirectory: boolean;
	try {
		isDirectory = statSync(rootDir).isDirectory();
	} catch (error) {
		return {
			entries: [],
			diagnostics: [
				diagnostic(
					"extension_root_stat_failed",
					`Could not inspect extension root ${rootDir}.\n${formatErrorMessage(error)}`,
					{ path: rootDir },
				),
			],
		};
	}
	if (!isDirectory) {
		return {
			entries: [],
			diagnostics: [
				diagnostic(
					"extension_root_not_directory",
					`Extension root must be a directory: ${rootDir}.`,
					{
						path: rootDir,
					},
				),
			],
		};
	}

	let dirents;
	try {
		dirents = readdirSync(rootDir, { withFileTypes: true });
	} catch (error) {
		return {
			entries: [],
			diagnostics: [
				diagnostic(
					"extension_root_read_failed",
					`Could not read extension root ${rootDir}.\n${formatErrorMessage(error)}`,
					{ path: rootDir },
				),
			],
		};
	}

	const entries: ExtensionRootEntry[] = [];
	for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
		const entryPath = join(rootDir, dirent.name);
		if (dirent.isFile()) {
			entries.push({ type: "file", name: dirent.name, path: entryPath });
			continue;
		}
		if (!dirent.isDirectory()) continue;

		const packageJsonPath = join(entryPath, "package.json");
		if (existsSync(packageJsonPath)) {
			entries.push({ type: "directory", name: dirent.name, path: entryPath, packageJsonPath });
			continue;
		}
		const indexPath = firstExistingDirectoryIndex(entryPath);
		entries.push({
			type: "directory",
			name: dirent.name,
			path: entryPath,
			...(indexPath === undefined ? {} : { indexPath }),
		});
	}
	return { entries, diagnostics: [] };
}

function firstExistingDirectoryIndex(entryPath: string): string | undefined {
	for (const indexFileName of ["index.ts", "index.js"] as const) {
		const indexPath = join(entryPath, indexFileName);
		if (existsSync(indexPath)) return indexPath;
	}
	return undefined;
}

function diagnostic(
	code: string,
	message: string,
	options: { path?: string } = {},
): ExtensionRootScanDiagnostic {
	return makeKernelDiagnostic({ code, message, ...optionalEntry("path", options.path) });
}
