/**
 * Single-consumer push→pull async channel.
 *
 * Producers `push` values that buffer until the consumer pulls them from
 * `iterable`; `close` ends iteration once the buffer drains. Shared by the
 * fake child-session gateway and the real Pi adapter to expose spawned-process
 * output as an `AsyncIterable`.
 */
export interface EventChannel<T> {
	push(value: T): void;
	close(): void;
	iterable: AsyncIterable<T>;
}

export function createEventChannel<T>(): EventChannel<T> {
	// Wrapped entries keep the buffer honest when T itself includes undefined.
	const buffered: { value: T }[] = [];
	let pendingPull: ((result: IteratorResult<T, undefined>) => void) | null = null;
	let isClosed = false;
	let hasConsumer = false;

	function settlePendingPull(result: IteratorResult<T, undefined>): boolean {
		if (pendingPull === null) return false;
		const resolvePull = pendingPull;
		pendingPull = null;
		resolvePull(result);
		return true;
	}

	function push(value: T): void {
		if (isClosed) throw new Error("Cannot push to a closed event channel.");
		if (settlePendingPull({ done: false, value })) return;
		buffered.push({ value });
	}

	function close(): void {
		if (isClosed) return;
		isClosed = true;
		settlePendingPull({ done: true, value: undefined });
	}

	function next(): Promise<IteratorResult<T, undefined>> {
		const head = buffered.shift();
		if (head !== undefined) return Promise.resolve({ done: false, value: head.value });
		if (isClosed) return Promise.resolve({ done: true, value: undefined });
		if (pendingPull !== null) {
			throw new Error("Event channel supports a single consumer; a pull is already pending.");
		}
		return new Promise((resolve) => {
			pendingPull = resolve;
		});
	}

	const iterable: AsyncIterable<T> = {
		[Symbol.asyncIterator]() {
			if (hasConsumer) throw new Error("Event channel supports a single consumer.");
			hasConsumer = true;
			return { next };
		},
	};

	return { push, close, iterable };
}
