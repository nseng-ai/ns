import { parseModelRef } from "@nseng-ai/foundation/model-slug";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "./failures.ts";

export type ReviewsHarness = "claude-code" | "codex" | "pi";

export interface ResolvedReviewsModelReference {
	readonly reference: string;
	readonly provider: "anthropic" | "openai" | "openai-codex" | "vercel-ai-gateway";
	readonly modelId: string;
	readonly harness: ReviewsHarness;
}

const EXPECTED_MODEL_REFERENCE =
	"Expected a qualified model reference using anthropic/<model-id>, openai/<model-id>, openai-codex/<model-id>, or vercel-ai-gateway/<model-id>.";

export function resolveReviewsModelReference(
	reference: string,
): ReviewResult<ResolvedReviewsModelReference> {
	const normalized = reference.trim();
	if (normalized === "") {
		return resultErr({
			code: "model-not-provided",
			message: `A Reviews model must be provided. ${EXPECTED_MODEL_REFERENCE}`,
		});
	}

	const parsed = parseModelRef(normalized);
	if (
		parsed === undefined ||
		parsed.provider.trim() !== parsed.provider ||
		parsed.modelId.trim() !== parsed.modelId ||
		parsed.modelId.split("/").some((component) => component === "")
	) {
		return unsupportedModelReference(normalized);
	}

	switch (parsed.provider) {
		case "anthropic":
			return {
				ok: true,
				value: {
					reference: normalized,
					provider: parsed.provider,
					modelId: parsed.modelId,
					harness: "claude-code",
				},
			};
		case "openai":
		case "openai-codex":
			return {
				ok: true,
				value: {
					reference: normalized,
					provider: parsed.provider,
					modelId: parsed.modelId,
					harness: "codex",
				},
			};
		case "vercel-ai-gateway":
			return {
				ok: true,
				value: {
					reference: normalized,
					provider: parsed.provider,
					modelId: parsed.modelId,
					harness: "pi",
				},
			};
		default:
			return unsupportedModelReference(normalized);
	}
}

function unsupportedModelReference(reference: string): ReviewResult<ResolvedReviewsModelReference> {
	return resultErr({
		code: "model-not-supported-by-harness",
		message: `Reviews model ${JSON.stringify(reference)} is not supported by a local review harness. ${EXPECTED_MODEL_REFERENCE}`,
	});
}
