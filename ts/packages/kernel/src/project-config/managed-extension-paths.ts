import { join } from "node:path";

export const MANAGED_EXTENSIONS_ROOT = ".ns/managed-extensions";
const MANAGED_NPM_ROOT_RELATIVE_PATH = `${MANAGED_EXTENSIONS_ROOT}/npm`;

export function managedNpmProjectRoot(projectRoot: string, packageName: string): string {
	return join(projectRoot, MANAGED_NPM_ROOT_RELATIVE_PATH, ...npmPackageNameSegments(packageName));
}

export function npmPackageRoot(projectRoot: string, packageName: string): string {
	return join(
		managedNpmProjectRoot(projectRoot, packageName),
		"node_modules",
		...npmPackageNameSegments(packageName),
	);
}

function npmPackageNameSegments(packageName: string): readonly string[] {
	return packageName.split("/");
}
