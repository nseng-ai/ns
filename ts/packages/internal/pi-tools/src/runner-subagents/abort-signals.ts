export function uniqueAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal[] {
	const unique: AbortSignal[] = [];
	for (const signal of signals) {
		if (signal && !unique.includes(signal)) unique.push(signal);
	}
	return unique;
}

export function hasAbortedSignal(...signals: Array<AbortSignal | undefined>): boolean {
	return uniqueAbortSignals(...signals).some((signal) => signal.aborted);
}
