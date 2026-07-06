import { normalize } from "node:path";

import type { NsSubpackage } from "./package-metadata.ts";

export function belongsToDeclaredSubpackage(
	pathWithinSrc: string,
	subpackages: readonly NsSubpackage[],
): boolean {
	const normalizedPath = toPosix(normalize(pathWithinSrc));
	return subpackages.some(
		(subpackage) =>
			normalizedPath === subpackage.name || normalizedPath.startsWith(`${subpackage.name}/`),
	);
}

export function formatDeclaredSubpackageUnits(subpackages: readonly NsSubpackage[]): string {
	return subpackages.map((subpackage) => `src/${subpackage.name}/`).join(", ");
}

function toPosix(path: string): string {
	return path.split("\\").join("/");
}
