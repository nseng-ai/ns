import { dirname, join } from "node:path";

const MANAGED_EXTENSIONS_ROOT = ".ns/managed-extensions";
const MANAGED_NPM_ROOT_RELATIVE_PATH = `${MANAGED_EXTENSIONS_ROOT}/npm`;

/** Filesystem ownership policy for isolated managed npm extension projects. */
export interface ManagedNpmStorage {
	readonly npmRoot: string;
	/** Existing lifecycle-owned directories inspected with lstat before package removal. */
	readonly trustedAncestors: readonly string[];
}

export interface ManagedNpmPackagePaths {
	readonly npmRoot: string;
	readonly npmProjectRoot: string;
	readonly packageRoot: string;
	/** Existing directories inspected with lstat, ordered from the storage boundary down to the package project. */
	readonly trustedAncestors: readonly string[];
	/** Optional empty directories pruned after project removal, ordered from nearest to farthest. */
	readonly pruningAncestors: readonly string[];
}

/** Preserve the established repository-local managed npm layout. */
export function projectManagedNpmStorage(projectRoot: string): ManagedNpmStorage {
	const npmRoot = join(projectRoot, MANAGED_NPM_ROOT_RELATIVE_PATH);
	return {
		npmRoot,
		trustedAncestors: [
			join(projectRoot, ".ns"),
			join(projectRoot, MANAGED_EXTENSIONS_ROOT),
			npmRoot,
		],
	};
}

/** Build user-scoped storage below an already-resolved ns extensions data root. */
export function userManagedNpmStorage(extensionsDataRoot: string): ManagedNpmStorage {
	const nsDataRoot = dirname(extensionsDataRoot);
	const npmRoot = join(extensionsDataRoot, "npm");
	return {
		npmRoot,
		// The XDG data home itself is caller-owned. Trust begins at ns's own subtree.
		trustedAncestors: [nsDataRoot, extensionsDataRoot, npmRoot],
	};
}

export function managedNpmRoot(projectRoot: string): string {
	return projectManagedNpmStorage(projectRoot).npmRoot;
}

export function managedNpmPackagePaths(
	storage: ManagedNpmStorage,
	packageName: string,
): ManagedNpmPackagePaths {
	const packagePathSegments = packageName.split("/");
	const npmProjectRoot = join(storage.npmRoot, ...packagePathSegments);
	const scopeRoot =
		packagePathSegments.length === 2
			? join(storage.npmRoot, packagePathSegments[0] ?? "")
			: undefined;
	return {
		npmRoot: storage.npmRoot,
		npmProjectRoot,
		packageRoot: join(npmProjectRoot, "node_modules", ...packagePathSegments),
		trustedAncestors: [
			...storage.trustedAncestors,
			...(scopeRoot === undefined ? [] : [scopeRoot]),
			npmProjectRoot,
		],
		pruningAncestors: scopeRoot === undefined ? [] : [scopeRoot],
	};
}

export function managedNpmProjectRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectManagedNpmStorage(projectRoot), packageName).npmProjectRoot;
}

export function npmPackageRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectManagedNpmStorage(projectRoot), packageName).packageRoot;
}
