/**
 * In-memory memo store for stack-view enrichment results with LRU eviction. The
 * store is a pure data structure: no I/O, no clocks, no timers. Recency is
 * tracked purely through `Map` insertion order — a touched entry is deleted and
 * re-inserted so it becomes most-recent — so the least-recently-used entry is
 * always the first key in iteration order. `snapshot()` returns a defensive copy
 * for a stable point-in-time read while rendering.
 */

/** One memoized enrichment result. */
export type EnrichmentEntry =
	| { state: "pending" }
	| { state: "ready"; summary: string }
	| { state: "failed" };

export interface EnrichmentStore {
	get(key: string): EnrichmentEntry | undefined;
	set(key: string, entry: EnrichmentEntry): void;
	delete(key: string): void;
	snapshot(): ReadonlyMap<string, EnrichmentEntry>;
}

/** Default LRU capacity when the caller does not override it. */
export const DEFAULT_MAX_ENTRIES = 500;

export function createEnrichmentStore(options?: { maxEntries?: number }): EnrichmentStore {
	const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
	const entries = new Map<string, EnrichmentEntry>();

	function touch(key: string, entry: EnrichmentEntry): void {
		// Delete-then-set moves the key to the most-recent position in iteration order.
		entries.delete(key);
		entries.set(key, entry);
	}

	function evict(): void {
		// Invariant: never evict a `pending` entry — it is the engine's in-flight
		// ownership marker, and dropping it would silently defeat dedup and strand
		// the in-flight task. Evict the oldest non-pending entry; if every entry
		// over capacity is pending, evict nothing.
		while (entries.size > maxEntries) {
			let didEvict = false;
			for (const [key, entry] of entries) {
				if (entry.state === "pending") continue;
				entries.delete(key);
				didEvict = true;
				break;
			}
			if (!didEvict) break;
		}
	}

	return {
		get(key) {
			const entry = entries.get(key);
			if (entry === undefined) return undefined;
			touch(key, entry);
			return entry;
		},
		set(key, entry) {
			touch(key, entry);
			evict();
		},
		delete(key) {
			entries.delete(key);
		},
		snapshot() {
			return new Map(entries);
		},
	};
}
