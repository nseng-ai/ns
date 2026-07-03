import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface WorkspaceRootMarkerOptions {
	readonly cwd: string;
	readonly markers: readonly string[];
	readonly nestedDirectory?: string;
	readonly exists?: (path: string) => boolean;
}

export function findWorkspaceRootByMarkers(options: WorkspaceRootMarkerOptions): string | null {
	const exists = options.exists ?? existsSync;
	let current = resolve(options.cwd);
	while (true) {
		if (hasAllMarkers(current, options.markers, exists)) return current;

		if (options.nestedDirectory !== undefined) {
			const nestedRoot = join(current, options.nestedDirectory);
			if (hasAllMarkers(nestedRoot, options.markers, exists)) return nestedRoot;
		}

		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function hasAllMarkers(
	root: string,
	markers: readonly string[],
	exists: (path: string) => boolean,
): boolean {
	return markers.every((marker) => exists(join(root, marker)));
}
