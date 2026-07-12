import { join } from "node:path";

const MANAGED_EXTENSIONS_ROOT = ".ns/managed-extensions";
const MANAGED_NPM_ROOT_RELATIVE_PATH = `${MANAGED_EXTENSIONS_ROOT}/npm`;

export interface ManagedNpmPackagePaths {
	readonly npmRoot: string;
	readonly npmProjectRoot: string;
	readonly packageRoot: string;
	/** Existing directories inspected with lstat, ordered from the project root down to the package project. */
	readonly trustedAncestors: readonly string[];
	/** Optional empty directories pruned after project removal, ordered from nearest to farthest. */
	readonly pruningAncestors: readonly string[];
}

export function managedNpmRoot(projectRoot: string): string {
	return join(projectRoot, MANAGED_NPM_ROOT_RELATIVE_PATH);
}

export function managedNpmPackagePaths(
	projectRoot: string,
	packageName: string,
): ManagedNpmPackagePaths {
	const packagePathSegments = packageName.split("/");
	const npmRoot = managedNpmRoot(projectRoot);
	const npmProjectRoot = join(npmRoot, ...packagePathSegments);
	const projectAncestors = [
		join(projectRoot, ".ns"),
		join(projectRoot, ".ns", "managed-extensions"),
		npmRoot,
	];
	const scopeRoot =
		packagePathSegments.length === 2 ? join(npmRoot, packagePathSegments[0] ?? "") : undefined;
	return {
		npmRoot,
		npmProjectRoot,
		packageRoot: join(npmProjectRoot, "node_modules", ...packagePathSegments),
		trustedAncestors: [
			...projectAncestors,
			...(scopeRoot === undefined ? [] : [scopeRoot]),
			npmProjectRoot,
		],
		pruningAncestors: scopeRoot === undefined ? [] : [scopeRoot],
	};
}

export function managedNpmProjectRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectRoot, packageName).npmProjectRoot;
}

export function npmPackageRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectRoot, packageName).packageRoot;
}
