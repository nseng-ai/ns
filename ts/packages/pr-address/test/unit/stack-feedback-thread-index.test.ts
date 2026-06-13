import { describe, expect, test } from "vitest";

import {
	actionableReviewThreadItems,
	buildStackFeedbackThreadIndex,
	duplicateThreadKeys,
	informationalReviewThreadKeys,
	itemsByThread,
	knownReviewThreadKeys,
	otherBatchReviewThreads,
	plannedPrNumbers,
	selectedBatchReviewThreadItems,
	threadKey,
	threadKeyString,
	type ThreadIndexBatch,
	type ThreadIndexItem,
	type ThreadIndexPlan,
	type ThreadIndexValidation,
	type ThreadKey,
} from "../../src/stack-feedback-thread-index.ts";

type StackTestItem = ThreadIndexItem;

type StackTestPlan = ThreadIndexPlan<StackTestItem> & { readonly validation: ThreadIndexValidation };

function minimalStackFeedbackPlan(options: {
	batches: readonly ThreadIndexBatch<StackTestItem>[];
	informational?: readonly StackTestItem[];
	validationPrNumbers?: readonly number[];
}): StackTestPlan {
	return {
		batches: options.batches,
		informational: options.informational ?? [],
		validation: {
			per_pr: (options.validationPrNumbers ?? []).map((prNumber) => ({ pr_number: prNumber })),
		},
	};
}

function stackBatch(batchId: string, items: readonly StackTestItem[]): ThreadIndexBatch<StackTestItem> {
	return { batch_id: batchId, items };
}

function stackThreadItem(prNumber: number, threadId: string | null): StackTestItem {
	return { pr_number: prNumber, thread_id: threadId, source_kind: "review_thread" };
}

function stackReviewItem(prNumber: number): StackTestItem {
	return { pr_number: prNumber, source_kind: "review" };
}

describe("stack feedback thread index", () => {
	test("collects actionable and known review threads", () => {
		const stackPlan = minimalStackFeedbackPlan({
			batches: [
				stackBatch("local", [
					stackThreadItem(101, "PRRT_101"),
					stackReviewItem(101),
					stackThreadItem(102, "   "),
					stackThreadItem(103, null),
				]),
			],
			informational: [
				stackThreadItem(104, "PRRT_INFO"),
				stackThreadItem(105, " "),
				stackReviewItem(106),
			],
		});

		const index = buildStackFeedbackThreadIndex(stackPlan);

		expect(actionableReviewThreadItems(stackPlan).map((item) => item.thread_id)).toEqual(["PRRT_101", "   ", null]);
		expect(index.actionableReviewThreadKeys).toEqual(new Set([threadKeyString(101, "PRRT_101")]));
		expect(knownReviewThreadKeys(stackPlan)).toEqual(
			new Set([threadKeyString(101, "PRRT_101"), threadKeyString(104, "PRRT_INFO")]),
		);
		expect(index.knownReviewThreadKeys).toEqual(
			new Set([threadKeyString(101, "PRRT_101"), threadKeyString(104, "PRRT_INFO")]),
		);
		expect(threadKey(101, "  PRRT_101  ")).toEqual([101, "PRRT_101"]);
		expect(threadKey(101, " ")).toBeNull();

		const repeatedKeys: readonly ThreadKey[] = [
			[101, "PRRT_A"],
			[102, "PRRT_B"],
			[102, "PRRT_B"],
			[101, "PRRT_A"],
			[102, "PRRT_B"],
		];
		expect(duplicateThreadKeys(repeatedKeys)).toEqual([
			[102, "PRRT_B"],
			[101, "PRRT_A"],
		]);
		expect(duplicateThreadKeys([[101, "PRRT_A"], [102, "PRRT_B"]])).toEqual([]);
	});

	test("preserves validation pr order", () => {
		const stackPlan = minimalStackFeedbackPlan({
			batches: [stackBatch("local", [stackThreadItem(101, "PRRT_101")])],
			informational: [stackThreadItem(103, "PRRT_INFO")],
			validationPrNumbers: [103, 101, 102],
		});
		const fallbackStackPlan = minimalStackFeedbackPlan({
			batches: [
				stackBatch("local", [
					stackThreadItem(102, "PRRT_102"),
					stackThreadItem(101, "PRRT_101"),
					stackThreadItem(102, "PRRT_102B"),
				]),
			],
			informational: [stackThreadItem(103, "PRRT_INFO")],
		});

		expect(plannedPrNumbers(stackPlan)).toEqual([103, 101, 102]);
		expect(buildStackFeedbackThreadIndex(stackPlan).plannedPrNumbers).toEqual([103, 101, 102]);
		expect(plannedPrNumbers(fallbackStackPlan)).toEqual([102, 101, 103]);
	});

	test("supports payload builder lookups", () => {
		const stackPlan = minimalStackFeedbackPlan({
			batches: [
				stackBatch("local", [
					stackThreadItem(101, " PRRT_SHARED "),
					stackThreadItem(102, "PRRT_SHARED"),
					stackReviewItem(103),
				]),
				stackBatch("cross_cutting", [stackThreadItem(104, "PRRT_OTHER")]),
			],
			informational: [stackThreadItem(105, "PRRT_INFO")],
		});

		const selectedItems = selectedBatchReviewThreadItems(stackPlan.batches[0]!);

		const groupedByThread = new Map(
			[...itemsByThread(selectedItems)].map(([threadId, items]) => [threadId, items.map((item) => item.pr_number)]),
		);

		expect(selectedItems.map((item) => item.pr_number)).toEqual([101, 102]);
		expect(groupedByThread).toEqual(new Map([["PRRT_SHARED", [101, 102]]]));
		expect(otherBatchReviewThreads(stackPlan, "local")).toEqual(
			new Map([[threadKeyString(104, "PRRT_OTHER"), "cross_cutting"]]),
		);
		expect(informationalReviewThreadKeys(stackPlan)).toEqual(new Set([threadKeyString(105, "PRRT_INFO")]));
	});
});
