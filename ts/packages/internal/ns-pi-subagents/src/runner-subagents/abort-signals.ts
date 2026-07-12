export function uniqueAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal[] {
	const unique: AbortSignal[] = [];
	for (const signal of signals) {
		if (signal && !unique.includes(signal)) unique.push(signal);
	}
	return unique;
}

export function hasAbortedSignal(...signals: Array<AbortSignal | undefined>): boolean {
	return signals.some((signal) => signal?.aborted === true);
}

export function effectiveAbortSignal(signals: readonly AbortSignal[]): AbortSignal | undefined {
	if (signals.length === 0) return undefined;
	if (signals.length === 1) return signals[0];
	return AbortSignal.any([...signals]);
}

export function abortReason(signals: readonly AbortSignal[]): string | undefined {
	for (const signal of signals) {
		if (!signal.aborted) continue;
		const reason = signal.reason as unknown;
		if (reason instanceof Error && reason.message.length > 0) return reason.message;
		if (typeof reason === "string" && reason.length > 0) return reason;
	}
	return undefined;
}
