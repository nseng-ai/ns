export interface MapWithConcurrencyInput<T, R> {
	readonly items: readonly T[];
	readonly maxConcurrency: number;
	readonly signal?: AbortSignal;
	run(item: T, index: number): Promise<R>;
}

export async function mapWithConcurrency<T, R>({
	items,
	maxConcurrency,
	signal,
	run,
}: MapWithConcurrencyInput<T, R>): Promise<Array<R | undefined>> {
	if (items.length === 0) return [];
	if (maxConcurrency < 1) return Array.from({ length: items.length });

	const results: Array<R | undefined> = Array.from({ length: items.length });
	let nextIndex = 0;
	const workerCount = Math.min(maxConcurrency, items.length);

	async function runNextItem(): Promise<void> {
		for (;;) {
			if (signal?.aborted) return;
			const index = nextIndex;
			nextIndex += 1;
			const item = items[index];
			if (item === undefined) return;
			results[index] = await run(item, index);
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => runNextItem()));
	return results;
}
