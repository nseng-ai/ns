import { normalize } from "node:path";

export function belongsToDeclaredSubpackage(
	pathWithinSrc: string,
	subpackages: readonly string[],
): boolean {
	const normalizedPath = toPosix(normalize(pathWithinSrc));
	return subpackages.some(
		(subpackage) => normalizedPath === subpackage || normalizedPath.startsWith(`${subpackage}/`),
	);
}

export function formatDeclaredSubpackageUnits(subpackages: readonly string[]): string {
	return subpackages.map((subpackage) => `src/${subpackage}/`).join(", ");
}

function toPosix(path: string): string {
	return path.split("\\").join("/");
}
