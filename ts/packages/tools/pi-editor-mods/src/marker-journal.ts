import { isAbsolute, normalize } from "node:path";

import { z } from "zod";

export const MARKER_CUSTOM_TYPE = "pi-editor-mods:marker";
export const LEGACY_MARKER_CUSTOM_TYPE = "pi-condensed-screenshots:marker";

const markerDataSchema = z.object({
	version: z.literal(1),
	marker: z.number().int().positive(),
	path: z.string().min(1),
});

export type MarkerData = z.infer<typeof markerDataSchema>;

export interface MarkerJournalHost {
	appendEntry(customType: string, data: unknown): Promise<void> | void;
}

export interface MarkerJournalSnapshot {
	markerToPath: ReadonlyMap<number, string>;
	pathToMarker: ReadonlyMap<string, number>;
	nextMarker: number;
}

/** Restores only the supplied active branch. First valid marker/path identity wins conflicts. */
export function restoreMarkerJournal(entries: readonly unknown[]): MarkerJournalSnapshot {
	const markerToPath = new Map<number, string>();
	const pathToMarker = new Map<string, number>();
	let maximum = 0;
	for (const entry of entries) {
		const data = markerDataFromEntry(entry);
		if (data === undefined || !isAbsolute(data.path)) continue;
		const path = normalize(data.path);
		if (markerToPath.has(data.marker) || pathToMarker.has(path)) continue;
		markerToPath.set(data.marker, path);
		pathToMarker.set(path, data.marker);
		maximum = Math.max(maximum, data.marker);
	}
	return { markerToPath, pathToMarker, nextMarker: maximum + 1 };
}

export class MarkerJournal {
	private readonly markerToPath: Map<number, string>;
	private readonly pathToMarker: Map<string, number>;
	private nextMarker: number;
	private readonly host: MarkerJournalHost;

	constructor(host: MarkerJournalHost, snapshot: MarkerJournalSnapshot) {
		this.host = host;
		this.markerToPath = new Map(snapshot.markerToPath);
		this.pathToMarker = new Map(snapshot.pathToMarker);
		this.nextMarker = snapshot.nextMarker;
	}

	markerForPath(path: string): number | undefined {
		return this.pathToMarker.get(path);
	}

	pathForMarker(marker: number): string | undefined {
		return this.markerToPath.get(marker);
	}

	entries(): ReadonlyArray<readonly [number, string]> {
		return [...this.markerToPath.entries()].sort((left, right) => left[0] - right[0]);
	}

	allocate(path: string): number {
		const existing = this.pathToMarker.get(path);
		if (existing !== undefined) return existing;
		const marker = this.nextMarker;
		this.nextMarker += 1;
		this.markerToPath.set(marker, path);
		this.pathToMarker.set(path, marker);
		const data: MarkerData = { version: 1, marker, path };
		this.host.appendEntry(MARKER_CUSTOM_TYPE, data);
		return marker;
	}

	markerTextForPath(path: string): string {
		return `[screenshot #${this.allocate(path)}]`;
	}
}

function markerDataFromEntry(entry: unknown): MarkerData | undefined {
	if (
		!isRecord(entry) ||
		entry.type !== "custom" ||
		(entry.customType !== MARKER_CUSTOM_TYPE && entry.customType !== LEGACY_MARKER_CUSTOM_TYPE)
	) {
		return undefined;
	}
	const result = markerDataSchema.safeParse(entry.data);
	return result.success ? result.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
