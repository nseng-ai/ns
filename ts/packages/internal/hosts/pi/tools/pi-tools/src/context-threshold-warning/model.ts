export const CONTEXT_THRESHOLDS_TOKENS = [200_000, 400_000, 600_000, 800_000, 1_000_000] as const;

export type ContextThresholdTokens = (typeof CONTEXT_THRESHOLDS_TOKENS)[number];

export interface ContextThresholdTransition {
	readonly nextPreviousTokens: number;
	readonly crossedThreshold: ContextThresholdTokens | undefined;
}

export function evaluateContextThreshold(
	previousTokens: number | undefined,
	currentTokens: number,
): ContextThresholdTransition {
	const priorTokens = previousTokens ?? 0;
	let crossedThreshold: ContextThresholdTokens | undefined;

	for (const threshold of CONTEXT_THRESHOLDS_TOKENS) {
		if (priorTokens < threshold && currentTokens >= threshold) crossedThreshold = threshold;
	}

	return {
		nextPreviousTokens: currentTokens,
		crossedThreshold,
	};
}
