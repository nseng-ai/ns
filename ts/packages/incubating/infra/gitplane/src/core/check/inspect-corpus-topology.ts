import type { TreeInventoryEntry } from "../gateways.ts";
import type { Finding } from "./finding.ts";
import { nestedArtifactFinding } from "./rules/nested-artifact.ts";

export const ARTIFACT_MARKER_NAME = "gitplane-artifact.json";
export interface ArtifactBoundaryTopology {
	readonly path: string;
	readonly marker: TreeInventoryEntry;
	readonly entries: readonly TreeInventoryEntry[];
}
export interface CorpusTopology {
	readonly artifactCount: number;
	readonly boundaries: readonly ArtifactBoundaryTopology[];
	readonly findings: readonly Finding[];
}
function dirname(value: string): string {
	const index = value.lastIndexOf("/");
	return index < 0 ? "" : value.slice(0, index);
}
function beneath(path: string, parent: string): boolean {
	return path.startsWith(`${parent}/`);
}
export function inspectCorpusTopology(inventory: readonly TreeInventoryEntry[]): CorpusTopology {
	const sorted = [...inventory].sort((a, b) => a.path.localeCompare(b.path));
	const markers = sorted.filter((entry) => entry.path.split("/").at(-1) === ARTIFACT_MARKER_NAME);
	const attempted = markers.map((marker) => ({ marker, path: dirname(marker.path) }));
	const outer = attempted.filter(
		(candidate) =>
			!attempted.some((other) => other !== candidate && beneath(candidate.path, other.path)),
	);
	const nested = attempted.filter((candidate) => !outer.includes(candidate));
	if (nested.length > 0)
		return {
			artifactCount: outer.length,
			boundaries: [],
			findings: nested.map(({ marker, path: nestedPath }) => {
				const owner = outer.find((candidate) => beneath(nestedPath, candidate.path));
				if (owner === undefined) throw new Error("Nested artifact has no owning boundary.");
				return nestedArtifactFinding({
					artifactPath: owner.path,
					relativePath: marker.path.slice(owner.path.length + 1),
					nestedArtifactPath: nestedPath,
				});
			}),
		};
	return {
		artifactCount: outer.length,
		findings: [],
		boundaries: outer.map(({ path, marker }) => ({
			path,
			marker,
			entries: sorted.filter((entry) => beneath(entry.path, path)),
		})),
	};
}
