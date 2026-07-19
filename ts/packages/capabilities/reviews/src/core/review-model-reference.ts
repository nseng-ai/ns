import { formatModelRef, type ModelSelection } from "@nseng-ai/foundation/model-slug";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "./failures.ts";

export type ReviewsHarness = "claude-code" | "codex" | "pi";

export interface ResolvedReviewsModelSelection {
	readonly selection: ModelSelection;
	readonly harness: ReviewsHarness;
}

const EXPECTED_MODEL_REFERENCE =
	"Expected a qualified model reference using anthropic/<model-id>, openai/<model-id>, openai-codex/<model-id>, or vercel-ai-gateway/<model-id>.";

export function resolveReviewsModelSelection(
	selection: ModelSelection,
): ReviewResult<ResolvedReviewsModelSelection> {
	if (
		selection.provider.trim() !== selection.provider ||
		selection.provider === "" ||
		selection.modelId.trim() !== selection.modelId ||
		selection.modelId === "" ||
		selection.modelId.split("/").some((component) => component === "")
	) {
		return unsupportedModelSelection(selection);
	}

	switch (selection.provider) {
		case "anthropic":
			return { ok: true, value: { selection, harness: "claude-code" } };
		case "openai":
		case "openai-codex":
			return { ok: true, value: { selection, harness: "codex" } };
		case "vercel-ai-gateway":
			return { ok: true, value: { selection, harness: "pi" } };
		default:
			return unsupportedModelSelection(selection);
	}
}

function unsupportedModelSelection(
	selection: ModelSelection,
): ReviewResult<ResolvedReviewsModelSelection> {
	return resultErr({
		code: "model-not-supported-by-harness",
		message: `Reviews model ${JSON.stringify(formatModelRef(selection))} is not supported by a local review harness. ${EXPECTED_MODEL_REFERENCE}`,
	});
}
