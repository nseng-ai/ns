import { join } from "node:path";

const MANAGED_EXTENSIONS_ROOT = ".ns/managed-extensions";
const MANAGED_NPM_ROOT_RELATIVE_PATH = `${MANAGED_EXTENSIONS_ROOT}/npm`;

export interface ManagedNpmPackagePaths {
	readonly npmProjectRoot: string;
	readonly packageRoot: string;
}

export function managedNpmRoot(projectRoot: string): string {
	return join(projectRoot, MANAGED_NPM_ROOT_RELATIVE_PATH);
}

export function managedNpmPackagePaths(
	projectRoot: string,
	packageName: string,
): ManagedNpmPackagePaths {
	const packagePathSegments = packageName.split("/");
	const npmProjectRoot = join(managedNpmRoot(projectRoot), ...packagePathSegments);
	return {
		npmProjectRoot,
		packageRoot: join(npmProjectRoot, "node_modules", ...packagePathSegments),
	};
}

export function managedNpmProjectRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectRoot, packageName).npmProjectRoot;
}

export function npmPackageRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectRoot, packageName).packageRoot;
}
