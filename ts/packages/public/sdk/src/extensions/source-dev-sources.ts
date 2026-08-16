import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isPathInside } from "@nseng-ai/foundation/primitives";

import {
	loadExtensionDescriptorFromPackageRoot,
	type ExtensionDescriptorPackageError,
} from "../project-config/extension-package-descriptor.ts";
import type { NsCommandSource, NsCommandSourceDiagnostic } from "./source-inventory.ts";

/**
 * Source-development discovery: when the CLI runs from an ns source checkout and the
 * invocation cwd is inside that checkout, workspace packages under `ts/packages` that
 * export an ns extension descriptor contribute command sources without being declared
 * in `ns.toml`. This is what makes the self-hosting repo's own extensions (objectives,
 * reviews, flow, ...) routable when running the CLI from source.
 */

export interface SourceDevNsCommandSources {
	readonly sources: readonly NsCommandSource[];
	readonly diagnostics: readonly NsCommandSourceDiagnostic[];
}

export interface LoadSourceDevNsCommandSourcesOptions {
	readonly cwd: string;
	/**
	 * Package names owned by higher-authority Built-in or explicit Project sources.
	 * A discovered workspace package with one of these names is skipped so the
	 * authoritative source keeps sole ownership of its command routes.
	 */
	readonly contributedPackageNames: ReadonlySet<string>;
	/** Test seam: workspace packages root override; defaults to this checkout's `ts/packages`. */
	readonly packagesRoot?: string;
}

export async function loadSourceDevNsCommandSources(
	options: LoadSourceDevNsCommandSourcesOptions,
): Promise<SourceDevNsCommandSources> {
	const packagesRoot = sourceDevWorkspacePackagesRoot(options.cwd, options.packagesRoot);
	if (packagesRoot === undefined) return { sources: [], diagnostics: [] };
	const sources: NsCommandSource[] = [];
	const diagnostics: NsCommandSourceDiagnostic[] = [];
	for (const packageDir of discoverWorkspacePackageDirs(packagesRoot)) {
		const spec = relative(packagesRoot, packageDir);
		const label = `source-dev:${spec}`;
		const loaded = await loadExtensionDescriptorFromPackageRoot({ packageRoot: packageDir });
		if (!loaded.ok) {
			// Source-dev discovery is opportunistic; packages without usable descriptor metadata are ignored.
			if (isOpportunisticDescriptorSkip(loaded.error)) continue;
			diagnostics.push({
				severity: "error",
				code: loaded.error.code,
				message:
					loaded.error.type === "descriptor-import-failed"
						? `Failed to load source-dev ns extension descriptor ${loaded.error.path}.\n${loaded.error.causeMessage ?? loaded.error.message}`
						: loaded.error.message,
				path: loaded.error.path,
				sourceLabel: label,
			});
			continue;
		}
		if (options.contributedPackageNames.has(loaded.value.packageName)) continue;
		sources.push({
			label,
			kind: "preinstalled",
			origin: "package",
			helpClassification: "extension",
			package: {
				name: loaded.value.packageName,
				version: loaded.value.version,
				descriptorPath: loaded.value.descriptorPath,
			},
			...(loaded.value.descriptor.commandDirectory === undefined
				? {}
				: { commandDirectory: loaded.value.descriptor.commandDirectory }),
		});
	}
	return { sources, diagnostics };
}

function isOpportunisticDescriptorSkip(error: ExtensionDescriptorPackageError): boolean {
	return (
		error.type === "package-manifest-missing" ||
		error.type === "package-manifest-read-failed" ||
		error.type === "package-manifest-invalid" ||
		error.code === "extension_descriptor_export_missing"
	);
}

function sourceDevWorkspacePackagesRoot(
	cwd: string,
	packagesRootOverride: string | undefined,
): string | undefined {
	// This module lives at ts/packages/public/sdk/src/extensions/, so four hops reach
	// ts/packages — the root every disposition tree hangs off (ADR 0045).
	const packagesRoot =
		packagesRootOverride ??
		resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
	const checkoutRoot = resolve(packagesRoot, "..", "..");
	const sdkSourceDir = join(packagesRoot, "public", "sdk", "src");
	if (!existsSync(sdkSourceDir)) return undefined;
	return isPathInside(checkoutRoot, cwd) ? packagesRoot : undefined;
}

/**
 * Runaway-recursion backstop for the source-dev walk of `ts/packages` (symlink loops,
 * pathological nesting). It is not a structural limit on how deep a package may live:
 * owner nesting below a disposition root is free-form (ADR 0045), so raise this freely
 * rather than treating it as a layout rule.
 */
const MAX_SOURCE_DEV_PACKAGE_WALK_DEPTH = 12;

function discoverWorkspacePackageDirs(packagesRoot: string): readonly string[] {
	const packageDirs: string[] = [];
	collectPackageDirs({ root: packagesRoot, current: packagesRoot, depth: 0, packageDirs });
	return packageDirs.sort((left, right) => left.localeCompare(right));
}

function collectPackageDirs(options: {
	root: string;
	current: string;
	depth: number;
	packageDirs: string[];
}): void {
	if (options.depth > MAX_SOURCE_DEV_PACKAGE_WALK_DEPTH) return;
	const packageJsonPath = join(options.current, "package.json");
	if (options.current !== options.root && existsSync(packageJsonPath)) {
		options.packageDirs.push(options.current);
		return;
	}
	let entries;
	try {
		entries = readdirSync(options.current, { withFileTypes: true });
	} catch {
		// Source-dev package discovery is best-effort; unreadable subtrees cannot contribute commands.
		return;
	}
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.isDirectory() || entry.name === "node_modules") continue;
		collectPackageDirs({
			root: options.root,
			current: join(options.current, entry.name),
			depth: options.depth + 1,
			packageDirs: options.packageDirs,
		});
	}
}
