
export type ThreadKey = readonly [prNumber: number, threadId: string];

export interface ThreadIndexItem {
	readonly pr_number: number;
	readonly thread_id?: string | null | undefined;
	readonly source_kind: string;
}

export interface ThreadIndexBatch<TItem extends ThreadIndexItem> {
	readonly batch_id: string;
	readonly items: readonly TItem[];
}

export interface ThreadIndexPlan<TItem extends ThreadIndexItem> {
	readonly batches: readonly ThreadIndexBatch<TItem>[];
	readonly informational: readonly TItem[];
}

export interface ThreadIndexValidation {
	readonly per_pr: readonly { readonly pr_number: number }[];
}


export function threadKey(prNumber: number, threadId: string | null | undefined): ThreadKey | null {
	const trimmed = trimOptional(threadId);
	if (trimmed === null) return null;
	return [prNumber, trimmed];
}

export function threadKeyString(prNumber: number, threadId: string): string {
	return `${prNumber}\u0000${threadId}`;
}

export function plannedPrNumbers<TItem extends ThreadIndexItem>(
	stackPlan: ThreadIndexPlan<TItem> & { readonly validation: ThreadIndexValidation },
): number[] {
	if (stackPlan.validation.per_pr.length > 0) return stackPlan.validation.per_pr.map((item) => item.pr_number);
	const prNumbers: number[] = [];
	for (const batch of stackPlan.batches) {
		for (const item of batch.items) prNumbers.push(item.pr_number);
	}
	for (const item of stackPlan.informational) prNumbers.push(item.pr_number);
	return [...new Set(prNumbers)];
}

export function actionableReviewThreadItems<TItem extends ThreadIndexItem>(stackPlan: ThreadIndexPlan<TItem>): TItem[] {
	return stackPlan.batches.flatMap((batch) => batch.items.filter((item) => item.source_kind === "review_thread"));
}


export function knownReviewThreadKeys<TItem extends ThreadIndexItem>(stackPlan: ThreadIndexPlan<TItem>): Set<string> {
	const keys = reviewThreadKeys(actionableReviewThreadItems(stackPlan));
	for (const key of informationalReviewThreadKeys(stackPlan)) keys.add(key);
	return keys;
}

export function informationalReviewThreadKeys<TItem extends ThreadIndexItem>(
	stackPlan: Pick<ThreadIndexPlan<TItem>, "informational">,
): Set<string> {
	return reviewThreadKeys(stackPlan.informational.filter((item) => item.source_kind === "review_thread"));
}

export function itemsByThread<TItem extends ThreadIndexItem>(items: readonly TItem[]): Map<string, TItem[]> {
	const grouped = new Map<string, TItem[]>();
	for (const item of items) {
		const threadId = trimOptional(item.thread_id);
		if (threadId === null) continue;
		const existing = grouped.get(threadId);
		if (existing === undefined) grouped.set(threadId, [item]);
		else existing.push(item);
	}
	return grouped;
}

export function otherBatchReviewThreads<TItem extends ThreadIndexItem>(
	stackPlan: ThreadIndexPlan<TItem>,
	selectedBatchId: string,
): Map<string, string> {
	const lookup = new Map<string, string>();
	for (const batch of stackPlan.batches) {
		if (batch.batch_id === selectedBatchId) continue;
		for (const item of batch.items) {
			if (item.source_kind !== "review_thread") continue;
			const key = threadKey(item.pr_number, item.thread_id);
			if (key !== null) lookup.set(threadKeyString(key[0], key[1]), batch.batch_id);
		}
	}
	return lookup;
}

export function duplicateThreadKeys(keys: readonly ThreadKey[]): ThreadKey[] {
	const seen = new Set<string>();
	const duplicates: ThreadKey[] = [];
	const duplicateStrings = new Set<string>();
	for (const key of keys) {
		const serialized = threadKeyString(key[0], key[1]);
		if (seen.has(serialized) && !duplicateStrings.has(serialized)) {
			duplicates.push(key);
			duplicateStrings.add(serialized);
		}
		seen.add(serialized);
	}
	return duplicates;
}

function reviewThreadKeys(items: readonly ThreadIndexItem[]): Set<string> {
	const keys = new Set<string>();
	for (const item of items) {
		const key = threadKey(item.pr_number, item.thread_id);
		if (key !== null) keys.add(threadKeyString(key[0], key[1]));
	}
	return keys;
}


function trimOptional(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}
