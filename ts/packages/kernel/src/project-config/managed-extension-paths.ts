import { join } from "node:path";

const MANAGED_EXTENSIONS_ROOT = ".ns/managed-extensions";
const MANAGED_NPM_ROOT_RELATIVE_PATH = `${MANAGED_EXTENSIONS_ROOT}/npm`;

export interface ManagedNpmPackagePaths {
	readonly projectRoot: string;
	readonly packageRoot: string;
}

export function managedNpmPackagePaths(
	projectRoot: string,
	packageName: string,
): ManagedNpmPackagePaths {
	const packagePathSegments = packageName.split("/");
	const privateProjectRoot = join(
		projectRoot,
		MANAGED_NPM_ROOT_RELATIVE_PATH,
		...packagePathSegments,
	);
	return {
		projectRoot: privateProjectRoot,
		packageRoot: join(privateProjectRoot, "node_modules", ...packagePathSegments),
	};
}

export function managedNpmProjectRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectRoot, packageName).projectRoot;
}

export function npmPackageRoot(projectRoot: string, packageName: string): string {
	return managedNpmPackagePaths(projectRoot, packageName).packageRoot;
}
