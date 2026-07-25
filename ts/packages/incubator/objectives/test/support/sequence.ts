export interface SequencedValue<T> {
	value: T | undefined;
	nextIndex: number;
}

export function nextFromSequence<T>(sequence: readonly T[], index: number): SequencedValue<T> {
	if (sequence.length === 0) return { value: undefined, nextIndex: index };
	return { value: sequence[Math.min(index, sequence.length - 1)], nextIndex: index + 1 };
}
