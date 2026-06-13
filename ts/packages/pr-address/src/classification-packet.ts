import { buildFeedbackManifestView } from "./classification-shared.ts";
import { type BodyLocator } from "./feedback-manifest-contracts.ts";

const FILL_DISPOSITION_PLACEHOLDER = "<fill: actionable|informational>";

export function buildFeedbackClassificationTemplate(manifest: unknown): { type: "ok"; value: unknown } | { type: "error"; message: string } {
	const viewResult = buildFeedbackManifestView(manifest);
	if (viewResult.view === null || viewResult.errors.length > 0) {
		const firstError = viewResult.errors[0];
		const suffix = firstError === undefined ? "" : ` ${firstError.message}`;
		return { type: "error", message: `Cannot build feedback classification template from invalid manifest.${suffix}` };
	}

	const view = viewResult.view;
	return {
		type: "ok",
		value: {
			manifest_kind: view.kind,
			pr_number: view.prNumber,
			payload_path: view.payloadPath,
			counts: {
				reviews: view.reviews.length,
				review_threads: view.requiredThreads.length,
				thread_comments: view.requiredThreads.reduce((total, thread) => total + thread.comments.length, 0),
				discussion_comments: view.discussionComments.length,
				resolved_review_threads_omitted: view.resolvedThreads.length,
			},
			classification_template: {
				schema_version: 1,
				reviews: view.reviews.map((review) => ({
					review_id: review.id,
					disposition: FILL_DISPOSITION_PLACEHOLDER,
					body_locator: classificationLocatorRef(review.body_locator),
					summary: "",
					action_summary: null,
					complexity: null,
					pre_existing: false,
					informational_reason: null,
				})),
				review_threads: view.requiredThreads.map((thread) => ({
					thread_id: thread.thread_id,
					disposition: FILL_DISPOSITION_PLACEHOLDER,
					thread_item_pointer: thread.item_pointer,
					covered_comments: thread.comments.map((comment) => ({
						comment_id: comment.id,
						body_locator: classificationLocatorRef(comment.body_locator),
					})),
					summary: "",
					action_summary: null,
					complexity: null,
					pre_existing: false,
					informational_reason: null,
				})),
				discussion_comments: view.discussionComments.map((comment) => ({
					comment_id: comment.comment_id,
					disposition: FILL_DISPOSITION_PLACEHOLDER,
					body_locator: classificationLocatorRef(comment.body_locator),
					summary: "",
					action_summary: null,
					complexity: null,
					needs_reply: false,
					informational_reason: null,
				})),
			},
		},
	};
}

function classificationLocatorRef(locator: BodyLocator): Record<string, string | null> {
	return {
		json_pointer: locator.json_pointer,
		item_pointer: locator.item_pointer,
	};
}
