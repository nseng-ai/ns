import type { ReviewFailure, ReviewResult } from "./failures.ts";
import type { ReviewCatalogGateway, ReviewSource } from "../gateways/review-catalog.ts";
import type { ReviewDefinition } from "./models.ts";
import { parseReviewDefinition } from "./review-definition.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export interface LoadParsedReviewDefinitionOptions {
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly cwd: string;
	readonly key: string;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ParsedReviewDefinition {
	readonly source: ReviewSource;
	readonly definition: ReviewDefinition;
}

export async function loadParsedReviewDefinition(
	options: LoadParsedReviewDefinitionOptions,
): Promise<ReviewResult<ParsedReviewDefinition>> {
	const source = await options.reviewCatalog.loadReviewSource({
		cwd: options.cwd,
		key: options.key,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (!source.ok) return source;

	const parsed = parseReviewDefinition(source.value.source, { name: source.value.key });
	if (!parsed.ok) {
		return {
			ok: false,
			error: reviewDefinitionInvalidFailure(source.value, parsed.error.message),
		};
	}

	return {
		ok: true,
		value: {
			source: source.value,
			definition: parsed.value,
		},
	};
}

export function reviewDefinitionInvalidFailure(
	source: ReviewSource,
	message: string,
): ReviewFailure {
	return {
		code: "review-definition-invalid",
		message: `Review definition ${source.key} at ${source.path} is invalid: ${message}`,
	};
}
