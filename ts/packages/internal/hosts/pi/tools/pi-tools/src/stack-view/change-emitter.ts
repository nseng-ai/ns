/** Minimal change-listener registry with snapshot-before-emit safety. */
export interface ChangeEmitter {
	onChange(listener: () => void): () => void;
	emitChange(): void;
}

export function createChangeEmitter(): ChangeEmitter {
	const listeners = new Set<() => void>();
	return {
		onChange(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		emitChange() {
			// Snapshot first: a listener may unsubscribe (mutating the set) during emit.
			const snapshot = [...listeners];
			for (const listener of snapshot) listener();
		},
	};
}
