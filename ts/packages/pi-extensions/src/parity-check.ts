import { piSurfaceKey, piSurfaceParityMatching, type PiSurfaceParity } from "./parity.ts";

export interface LivePiSurface {
	readonly kind: "command" | "tool";
	readonly surface: string;
}

export interface ParityComparison {
	readonly missingMetadata: readonly LivePiSurface[];
	readonly staleMetadata: readonly PiSurfaceParity[];
	readonly duplicateMetadataKeys: readonly string[];
}

export function comparePiSurfaceParity(options: {
	readonly liveSurfaces: readonly LivePiSurface[];
	readonly metadata: readonly PiSurfaceParity[];
}): ParityComparison {
	const liveKeySet = new Set(options.liveSurfaces.map((surface) => piSurfaceKey(surface)));
	const exactMetadata = options.metadata.filter((record) => piSurfaceParityMatching(record).type === "exact");
	const exactMetadataKeyCounts = countKeys(exactMetadata.map((record) => piSurfaceKey(record)));
	const exactMetadataKeySet = new Set(exactMetadataKeyCounts.keys());

	return {
		missingMetadata: sortLiveSurfaces(options.liveSurfaces.filter((surface) => !exactMetadataKeySet.has(piSurfaceKey(surface)))),
		staleMetadata: sortParityRecords(exactMetadata.filter((record) => !liveKeySet.has(piSurfaceKey(record)))),
		duplicateMetadataKeys: [...exactMetadataKeyCounts.entries()]
			.filter(([, count]) => count > 1)
			.map(([key]) => key)
			.sort(),
	};
}

export function formatParityComparisonFailure(comparison: ParityComparison): string {
	const sections: string[] = [];
	if (comparison.missingMetadata.length > 0) {
		sections.push(
			[
				"Live Pi surfaces missing exact parity metadata:",
				...comparison.missingMetadata.map((surface) => `- ${piSurfaceKey(surface)}`),
				"Add a co-located parity metadata record near the module that registers each surface.",
			].join("\n"),
		);
	}

	if (comparison.staleMetadata.length > 0) {
		sections.push(
			[
				"Exact parity metadata without a live Pi registration:",
				...comparison.staleMetadata.map((record) => `- ${piSurfaceKey(record)} (${record.sourceModule})`),
				"Remove or rename stale metadata, or mark it dynamic-family only when it is genuinely runtime-generated.",
			].join("\n"),
		);
	}

	if (comparison.duplicateMetadataKeys.length > 0) {
		sections.push(
			[
				"Duplicate exact parity metadata keys:",
				...comparison.duplicateMetadataKeys.map((key) => `- ${key}`),
				"Keep exactly one exact metadata record per live command/tool surface.",
			].join("\n"),
		);
	}

	return sections.length === 0 ? "Pi extension parity metadata matches live registrations." : sections.join("\n\n");
}

function countKeys(keys: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const key of keys) {
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function sortLiveSurfaces(surfaces: readonly LivePiSurface[]): LivePiSurface[] {
	return [...surfaces].sort((left, right) => piSurfaceKey(left).localeCompare(piSurfaceKey(right)));
}

function sortParityRecords(records: readonly PiSurfaceParity[]): PiSurfaceParity[] {
	return [...records].sort((left, right) => piSurfaceKey(left).localeCompare(piSurfaceKey(right)));
}
