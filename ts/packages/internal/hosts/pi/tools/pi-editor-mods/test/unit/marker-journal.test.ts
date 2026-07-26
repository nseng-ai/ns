import { describe, expect, it } from "vitest";

import {
	LEGACY_MARKER_CUSTOM_TYPE,
	MARKER_CUSTOM_TYPE,
	MarkerJournal,
	restoreMarkerJournal,
} from "../../src/marker-journal.ts";

function entry(marker: number, path: string): unknown {
	return { type: "custom", customType: MARKER_CUSTOM_TYPE, data: { version: 1, marker, path } };
}

describe("marker journal", () => {
	it("restores first valid identities, ignores conflicts/invalid entries, and advances from max", () => {
		const snapshot = restoreMarkerJournal([
			entry(4, "/a.png"),
			entry(4, "/conflict.png"),
			entry(8, "/a.png"),
			{
				type: "custom",
				customType: MARKER_CUSTOM_TYPE,
				data: { version: 2, marker: 20, path: "/x" },
			},
			entry(9, "relative.png"),
		]);
		expect([...snapshot.markerToPath]).toEqual([[4, "/a.png"]]);
		expect(snapshot.nextMarker).toBe(5);
	});

	it("restores entries written by the pre-consolidation extension", () => {
		const snapshot = restoreMarkerJournal([
			{
				type: "custom",
				customType: LEGACY_MARKER_CUSTOM_TYPE,
				data: { version: 1, marker: 2, path: "/legacy.png" },
			},
		]);
		expect([...snapshot.markerToPath]).toEqual([[2, "/legacy.png"]]);
	});

	it("keeps stable maps and appends exactly when allocating", () => {
		const appended: unknown[] = [];
		const journal = new MarkerJournal(
			{
				appendEntry: (customType, data) => {
					appended.push({ customType, data });
				},
			},
			restoreMarkerJournal([entry(2, "/old.png")]),
		);
		expect(journal.allocate("/old.png")).toBe(2);
		expect(journal.allocate("/new.png")).toBe(3);
		expect(journal.allocate("/new.png")).toBe(3);
		expect(journal.markerTextForPath("/new.png")).toBe("[screenshot #3]");
		expect(appended).toEqual([
			{ customType: MARKER_CUSTOM_TYPE, data: { version: 1, marker: 3, path: "/new.png" } },
		]);
		expect(journal.entries()).toEqual([
			[2, "/old.png"],
			[3, "/new.png"],
		]);
	});
});
